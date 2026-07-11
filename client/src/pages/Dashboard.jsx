import React, { useState, useEffect, useCallback, useRef, useMemo, lazy, Suspense } from 'react';
import ChartDataLabels from 'chartjs-plugin-datalabels';
import 'echarts-gl';
import {
    Chart as ChartJS,
    CategoryScale,
    LinearScale,
    BarElement,
    Title,
    Tooltip,
    Legend,
    ArcElement,
    PointElement,
    LineElement,
    Filler
} from 'chart.js';
import { Bar, Pie, Line } from 'react-chartjs-2';
// Heavy sub-views/modals are code-split into their own chunks so they are NOT
// part of the main Dashboard bundle. MyPerformance is only ever rendered for
// employees/branch-admins; the modals are mounted-but-closed, so their chunks
// load in the background (fallback={null}) with no visual change.
const MyPerformance = lazy(() => import('../components/MyPerformance'));
const CampaignCustomersFollowupModal = lazy(() => import('../components/CampaignCustomersFollowupModal'));
const BranchCustomersModal = lazy(() => import('../components/BranchCustomersModal'));
const BranchLetterReportModal = lazy(() => import('../components/BranchLetterReportModal'));
const OtherFollowupModal = lazy(() => import('../components/OtherFollowupModal'));
const EmployeeCampaignProgress = lazy(() => import('../components/EmployeeCampaignProgress'));
const EmployeeActivityModal = lazy(() => import('../components/EmployeeActivityModal'));
const EmployeeRRModal = lazy(() => import('../components/EmployeeRRModal'));
import axios from 'axios';
import { useLocation, useNavigate } from 'react-router-dom';
import * as XLSX from 'xlsx';
import { warmKey, readWarmCache, writeWarmCache } from '../utils/warmCache';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
const EmployeePerformanceModal = lazy(() => import('../components/EmployeePerformanceModal'));
const EmployeeTime = lazy(() => import('../components/EmployeeTime'));

// Register ChartJS components
ChartJS.register(
    CategoryScale,
    LinearScale,
    BarElement,
    Title,
    Tooltip,
    Legend,
    ArcElement,
    PointElement,
    LineElement,
    Filler,
    ChartDataLabels
);

// Theme color
const themeColor = '#2f3192';
const API_BASE_URL = import.meta.env.VITE_BACKEND_URL;
const MASTER_ADMIN_ID = import.meta.env.VITE_MASTER_ADMIN_ID;

// Constants moved outside component to prevent recreation on every render
const FLAG_ORDER = ['C1', 'C2', 'C3', 'C4', 'C5', 'C6', 'C7'];

const BRANCH_ORDER_LIST = [
    'HO', '420435_1', '420435_2', '420435_3', '420435_4', '420435_5',
    '420435_6', '420435_7', '420435_8', '420435_9', '420435_10',
    '420435_11', '420435_12', '420435_13', '420435_14'
];

// Branch name mapping
const branchNameMap = {
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

// Function to get branch display name
const getBranchDisplayName = (branchCode) => {
    if (!branchCode) return 'N/A';
    const branchName = branchNameMap[branchCode];
    if (branchName) {
        return `${branchName} - ${branchCode}`;
    }
    return branchCode;
};

const Dashboard = () => {
    const [userData, setUserData] = useState(null);
    const [allEmployeesPerformance, setAllEmployeesPerformance] = useState([]);
    const [branchPerformance, setBranchPerformance] = useState([]);
    // True once a branch-performance fetch has completed (with data or not) —
    // lets the Branch Overview tab show a loader instead of "No Branch Data"
    // while the request is still in flight.
    const [branchPerfFetched, setBranchPerfFetched] = useState(false);
    const [branchEmployees, setBranchEmployees] = useState([]);
    const [branches, setBranches] = useState([]);
    const [selectedBranch, setSelectedBranch] = useState('');
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState('my');
    const [error, setError] = useState(null);
    const [exportLoading, setExportLoading] = useState(false);
    const [isAdmin, setIsAdmin] = useState(false);
    const [isMasterAdmin, setIsMasterAdmin] = useState(false);
    const [isITAdmin, setIsITAdmin] = useState(false);
    const [isBranchAdmin, setIsBranchAdmin] = useState(false);
    const [isEmployee, setIsEmployee] = useState(false);
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
    const [campaignPerformance, setCampaignPerformance] = useState([]);
    const [campaignLoading, setCampaignLoading] = useState(false);
    const [statusStats, setStatusStats] = useState(null);
    const [branchEngagedData, setBranchEngagedData] = useState({});
    const [branchRemainingData, setBranchRemainingData] = useState({});
    const [branchStatsLoading, setBranchStatsLoading] = useState({});
    const [allocationSummary, setAllocationSummary] = useState({});
    const [rrSelectedBranch, setRrSelectedBranch] = useState('');
    const [activitySelectedBranch, setActivitySelectedBranch] = useState('');
    const [allEmployeesPerformanceWithCampaigns, setAllEmployeesPerformanceWithCampaigns] = useState({ employees: [], campaigns: [] });
    const hasFetchedBranchPerformance = useRef(false);
    const hasFetchedAllBranches = useRef(false);
    const [showOtherFollowupModal, setShowOtherFollowupModal] = useState(false);
    const [branchEmployeesLoading, setBranchEmployeesLoading] = useState(false);

    // Track which tabs have been loaded
    const [loadedTabs, setLoadedTabs] = useState({
        overall: false,
        branches: false,
        'branch-report': false,
        'campaign-success': false,
        activity: false,
        'rejected-reason': false
    });

    // Time period filter state
    const [timePeriod, setTimePeriod] = useState('all');

    // Highlight time-dependent counts whenever a non-"all" filter is active.
    // 'all' (Calendar) renders the raw value; any other selection turns it yellow.
    const isTimeFiltered = timePeriod !== 'all';
    const TimeValue = ({ children, style }) =>
        isTimeFiltered ? (
            <span style={{ backgroundColor: '#fde047', borderRadius: '4px', padding: '0 4px', ...style }}>
                {children}
            </span>
        ) : (
            <>{children}</>
        );

    const tableContainerRef = useRef(null);
    const topScrollBarRef = useRef(null);
    const [customStartDate, setCustomStartDate] = useState(null);
    const [customEndDate, setCustomEndDate] = useState(null);
    const [isFilterLoading, setIsFilterLoading] = useState(false);
    const [showCustomDatePicker, setShowCustomDatePicker] = useState(false);
    const [detailedView, setDetailedView] = useState(false);
    const [selectedEmployee, setSelectedEmployee] = useState(null);
    const [showEmployeeModal, setShowEmployeeModal] = useState(false);
    const [showEmployeeActivityModal, setShowEmployeeActivityModal] = useState(false);
    const [selectedActivityUser, setSelectedActivityUser] = useState(null);
    const [selectedActivityName, setSelectedActivityName] = useState('');

    const handleActivityUserNameClick = (user, activity) => {
        setSelectedActivityUser({
            user_id: user.user_id,
            user_name: user.user_name,
            branch: user.branch,
            branch_display: user.branch_display
        });
        setSelectedActivityName(activity.activity_name);
        setShowEmployeeActivityModal(true);
    };

    const [showEmployeeRRModal, setShowEmployeeRRModal] = useState(false);
    const [selectedRRUser, setSelectedRRUser] = useState(null);
    const [selectedRRName, setSelectedRRName] = useState('');

    const handleRRUserNameClick = (user, reason) => {
        setSelectedRRUser({
            user_id: user.user_id,
            user_name: user.user_name,
            branch: user.branch,
            branch_display: user.branch_display
        });
        setSelectedRRName(reason.rr_name);
        setShowEmployeeRRModal(true);
    };
    const [showCampaignProgressModal, setShowCampaignProgressModal] = useState(false);
    const [selectedEmployeeForProgress, setSelectedEmployeeForProgress] = useState(null);
    const [selectedBranchForModal, setSelectedBranchForModal] = useState(null);
    const [showBranchCustomersModal, setShowBranchCustomersModal] = useState(false);
    // ── Branch-wise Letter Report (letters grouped by sender's branch) ──
    const [branchLetterCounts, setBranchLetterCounts] = useState({});
    const [showBranchLetterModal, setShowBranchLetterModal] = useState(false);
    const [selectedBranchForLetters, setSelectedBranchForLetters] = useState(null);
    const [summaryStats, setSummaryStats] = useState(null);
    const [canExport, setCanExport] = useState(false);
    const [showEmployeeTimeModal, setShowEmployeeTimeModal] = useState(false);
    const TIME_REPORT_ALLOWED_IDS = (import.meta.env.VITE_TIME_REPORT_ALLOWED_IDS || '')
        .split(',')
        .map(id => id.trim())
        .filter(Boolean); const canViewTimeReport = userData && TIME_REPORT_ALLOWED_IDS.includes(String(userData.user_id));

    // Additional stats state
    const [activityStats, setActivityStats] = useState([]);
    const [rrStats, setRrStats] = useState([]);
    const activityTableContainerRef = useRef(null);
    const campaignTableContainerRef = useRef(null);
    const campaignTopScrollBarRef = useRef(null);
    const activityTopScrollBarRef = useRef(null);
    const [activityLoading, setActivityLoading] = useState(false);
    const [rrLoading, setRrLoading] = useState(false);
    const [allCampaigns, setAllCampaigns] = useState([]);
    const [selectedCampaigns, setSelectedCampaigns] = useState([]);
    const [showCampaignFilter, setShowCampaignFilter] = useState(false);
    const isMounted = useRef(true);
    const abortControllerRef = useRef(null);
    const debounceTimeoutRef = useRef(null);

    // Expand/collapse states
    const [expandedActivities, setExpandedActivities] = useState({});
    const [expandedReasons, setExpandedReasons] = useState({});
    const [rrCampaignTotals, setRrCampaignTotals] = useState({ total_customers: 0, total_followups: 0 });
    const [campaignTotals, setCampaignTotals] = useState({ total_customers: 0, total_followups: 0 });
    const [campaignSortConfig, setCampaignSortConfig] = useState({
        key: 'campaign_name',
        direction: 'asc'
    });

    // BRANCH_ORDER moved outside component as BRANCH_ORDER_LIST
    const BRANCH_ORDER = BRANCH_ORDER_LIST;

    const sortedBranchPerformanceMemo = useMemo(() => {
        if (!branchPerformance || branchPerformance.length === 0) return [];
        return [...branchPerformance].sort((a, b) => {
            const indexA = BRANCH_ORDER.indexOf(a.branch);
            const indexB = BRANCH_ORDER.indexOf(b.branch);
            if (indexA === -1 && indexB === -1) return 0;
            if (indexA === -1) return 1;
            if (indexB === -1) return -1;
            return indexA - indexB;
        });
    }, [branchPerformance, BRANCH_ORDER]);

    // === Memoized Bar Chart for Campaign-wise Customer Breakdown (Overall tab) ===
    const campaignBreakdownChartData = useMemo(() => {
        if (!campaignPerformance || campaignPerformance.length === 0) return null;
        return {
            labels: campaignPerformance.map(campaign => {
                const remaining = campaign.asset_numbers_count || 0;
                const completed = campaign.completed_count || campaign.total_completed_followups || campaign.completed || 0;
                const total = remaining + completed;
                const campaignName = campaign.campaign_name.length > 15
                    ? campaign.campaign_name.substring(0, 12) + '...'
                    : campaign.campaign_name;
                return `${campaignName} (${total})`;
            }),
            datasets: [
                {
                    label: 'Remaining',
                    data: campaignPerformance.map(c => c.asset_numbers_count || 0),
                    backgroundColor: 'rgba(59, 130, 246, 0.85)',
                    borderColor: '#3b82f6',
                    borderWidth: 1, borderRadius: 4, barPercentage: 0.7, categoryPercentage: 0.8
                },
                {
                    label: 'WIP',
                    data: campaignPerformance.map(c => c.wip_count || 0),
                    backgroundColor: 'rgba(234, 179, 8, 0.85)',
                    borderColor: '#eab308',
                    borderWidth: 1, borderRadius: 4, barPercentage: 0.7, categoryPercentage: 0.8
                },
                {
                    label: 'FR',
                    data: campaignPerformance.map(c => c.rescheduled_count || 0),
                    backgroundColor: 'rgba(168, 85, 247, 0.85)',
                    borderColor: '#a855f7',
                    borderWidth: 1, borderRadius: 4, barPercentage: 0.7, categoryPercentage: 0.8
                },
                {
                    label: 'Rejected',
                    data: campaignPerformance.map(c => c.rejected_count || 0),
                    backgroundColor: 'rgba(220, 100, 40, 0.85)',
                    borderColor: '#dc6428',
                    borderWidth: 1, borderRadius: 4, barPercentage: 0.7, categoryPercentage: 0.8
                },
                {
                    label: 'NC',
                    data: campaignPerformance.map(c => c.not_connected_count || 0),
                    backgroundColor: 'rgba(107, 114, 128, 0.85)',
                    borderColor: '#6b7280',
                    borderWidth: 1, borderRadius: 4, barPercentage: 0.7, categoryPercentage: 0.8
                },
                {
                    label: 'Completed',
                    data: campaignPerformance.map(c => c.completed_count || c.total_completed_followups || c.completed || 0),
                    backgroundColor: 'rgba(34, 197, 94, 0.85)',
                    borderColor: '#16a34a',
                    borderWidth: 1, borderRadius: 4, barPercentage: 0.7, categoryPercentage: 0.8
                }
            ]
        };
    }, [campaignPerformance]);

    const campaignBreakdownChartOptions = useMemo(() => {
        let maxValue = 0;
        if (campaignPerformance) {
            for (const c of campaignPerformance) {
                const m = Math.max(
                    c.asset_numbers_count || 0,
                    c.wip_count || 0,
                    c.rescheduled_count || 0,
                    c.rejected_count || 0,
                    c.not_connected_count || 0,
                    c.completed_count || c.total_completed_followups || c.completed || 0
                );
                if (m > maxValue) maxValue = m;
            }
        }
        return {
            responsive: true, maintainAspectRatio: false,
            layout: { padding: { top: 25, bottom: 10, left: 10, right: 10 } },
            plugins: {
                legend: { position: 'top', labels: { usePointStyle: true, boxWidth: 10, font: { size: 10 }, padding: 8 } },
                tooltip: {
                    callbacks: {
                        label: (ctx) => `${ctx.dataset.label || ''}: ${ctx.raw || 0}`
                    }
                },
                datalabels: {
                    display: true, color: '#1f2937', anchor: 'end', align: 'top', offset: 8, clip: false,
                    font: { weight: 'bold', size: 10 },
                    formatter: (value) => value === 0 ? '' : value
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    suggestedMax: maxValue * 1.15,
                    title: { display: true, text: 'Number of Customers', font: { size: 11 } },
                    grid: { color: '#EDF2F7' },
                    ticks: { font: { size: 10 } }
                },
                x: {
                    title: { display: true, text: 'Campaigns (Total Customers)', font: { size: 11 } },
                    grid: { display: false },
                    ticks: { font: { size: 9 }, rotation: 45, maxRotation: 45, minRotation: 45 }
                }
            }
        };
    }, [campaignPerformance]);

    // === Memoized Pie Chart for Asset Status Distribution ===
    const assetStatusPieData = useMemo(() => ({
        labels: ['Completed', 'WIP', 'FR', 'Rejected', 'NC'],
        datasets: [{
            data: [
                summaryStats?.completed_assets || 0,
                summaryStats?.wip_assets || 0,
                summaryStats?.rescheduled_assets || 0,
                summaryStats?.rejected_assets || 0,
                summaryStats?.not_connected_assets || 0
            ],
            backgroundColor: ['rgba(34, 197, 94, 0.85)', 'rgba(234, 179, 8, 0.85)', 'rgba(168, 85, 247, 0.85)', 'rgba(220, 100, 40, 0.85)', 'rgba(107, 114, 128, 0.85)'],
            borderColor: ['#22c55e', '#eab308', '#a855f7', '#dc6428', '#6b7280'],
            borderWidth: 2
        }]
    }), [summaryStats]);

    const assetStatusPieOptions = useMemo(() => {
        const total = (summaryStats?.completed_assets || 0) + (summaryStats?.wip_assets || 0) +
            (summaryStats?.rescheduled_assets || 0) + (summaryStats?.rejected_assets || 0) +
            (summaryStats?.not_connected_assets || 0);
        return {
            responsive: true, maintainAspectRatio: true,
            plugins: {
                legend: { position: 'bottom', labels: { boxWidth: 12, padding: 12, font: { size: 11 } } },
                tooltip: {
                    callbacks: {
                        label: (ctx) => {
                            const value = ctx.raw || 0;
                            const pct = total > 0 ? ((value / total) * 100).toFixed(1) : 0;
                            return `${ctx.label || ''}: ${value} (${pct}%)`;
                        }
                    }
                }
            }
        };
    }, [summaryStats]);

    // === Memoized per-branch computed stats (Branch Overview tab) ===
    const branchComputedStats = useMemo(() => {
        const map = {};
        for (const branch of sortedBranchPerformanceMemo) {
            const engagedData = branchEngagedData[branch.branch];
            const remainingData = branchRemainingData[branch.branch];

            if (!engagedData || !remainingData || !engagedData.campaigns || !remainingData.campaigns) {
                map[branch.branch] = null;
                continue;
            }

            // Build O(1) lookup for remaining campaigns by id
            const remainingByCampaignId = {};
            for (const rc of remainingData.campaigns) {
                remainingByCampaignId[Number(rc.campaign_id)] = rc;
            }

            const getCampaignTotalAllocate = (campaign) => {
                if (campaign.total_allocate) return campaign.total_allocate;
                const engagedCustomers = campaign.total_customers || 0;
                const rc = remainingByCampaignId[Number(campaign.campaign_id)];
                const remainingFromAssets = rc?.remaining_customers || 0;
                return engagedCustomers + remainingFromAssets;
            };

            let totalBranchAssets = 0;
            let totalCampaigns = 0;
            for (const c of engagedData.campaigns) {
                const allocate = getCampaignTotalAllocate(c);
                if (allocate > 0) {
                    totalBranchAssets += allocate;
                    const rc = remainingByCampaignId[Number(c.campaign_id)];
                    const status = (rc?.status || 'unknown').toLowerCase();
                    if (status !== 'unknown') totalCampaigns++;
                }
            }

            const totalEngagedCustomers = engagedData.total_customers || 0;
            const totalCompleted = engagedData.completed_followups || 0;
            const totalWip = engagedData.wip_followups || 0;
            const totalRejected = engagedData.rejected_followups || 0;
            const totalRescheduled = engagedData.rescheduled_followups || 0;
            const totalNotConnected = engagedData.not_connected_followups || 0;
            const completionRate = engagedData.branch_completion_rate || 0;
            const totalRemaining = totalBranchAssets - totalCompleted;
            const totalFR = totalEngagedCustomers - (totalWip + totalCompleted + totalRejected + totalNotConnected);

            map[branch.branch] = {
                totalBranchAssets, totalCampaigns, totalEngagedCustomers,
                totalCompleted, totalWip, totalRejected, totalRescheduled,
                totalNotConnected,
                completionRate, totalRemaining, totalFR
            };
        }
        return map;
    }, [sortedBranchPerformanceMemo, branchEngagedData, branchRemainingData]);

    const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' });
    const [rrDetailedView, setRrDetailedView] = useState(false);
    const [rrSortConfig, setRrSortConfig] = useState({ key: null, direction: 'asc' });
    const [statusSortConfig, setStatusSortConfig] = useState({
        key: 'campaign_name',
        direction: 'asc'
    });

    const [selectedCampaign, setSelectedCampaign] = useState(null);
    const [showCustomersModal, setShowCustomersModal] = useState(false);
    const [showAllCampaignReport, setShowAllCampaignReport] = useState(false);

    // Branch employee sort state
    const [branchEmployeeSortState, setBranchEmployeeSortState] = useState({
        sortKey: null,
        sortDirection: 'asc'
    });

    // Refs to prevent infinite loops
    const isInitialMount = useRef(true);
    const isDataLoaded = useRef(false);
    const isLoadingData = useRef(false);

    // Function to mark a tab as loaded
    const markTabAsLoaded = (tabName) => {
        setLoadedTabs(prev => ({ ...prev, [tabName]: true }));
    };

    // Function to check if tab data should be loaded
    const shouldLoadTab = (tabName) => {
        return loadedTabs[tabName];
    };

    useEffect(() => {
        isMounted.current = true;
        // Create a new AbortController for this mount
        abortControllerRef.current = new AbortController();

        return () => {
            isMounted.current = false;
            // Cancel ALL pending requests when leaving the page
            abortControllerRef.current?.abort();
        };
    }, []);

    // Cancel the previous tab's in-flight requests on every tab switch,
    // so the newly-active tab loads fast without competing network calls.
    const isFirstTabRender = useRef(true);
    useEffect(() => {
        if (isFirstTabRender.current) {
            isFirstTabRender.current = false;
            return; // skip on first render so the initial tab loads normally
        }
        abortControllerRef.current?.abort();               // stop old tab's calls
        abortControllerRef.current = new AbortController(); // fresh controller for new tab
    }, [activeTab]);

    // Replace this entire useEffect
    useEffect(() => {
        // Get user data from sessionStorage
        try {
            const userStr = sessionStorage.getItem('user');
            if (userStr) {
                let user;
                try {
                    user = JSON.parse(userStr);
                } catch (e) {
                    user = userStr;
                }

                setUserData(user);

                const role = (user.role || '').toLowerCase();

                // Set role-based flags
                const isMaster = role === 'master_admin';
                const isIT = false; // it_admin role removed from the application
                const isBranch = role === 'branch_admin';
                const isEmp = role === 'employee';
                const isAdminUser = isMaster || isIT || isBranch;

                setIsMasterAdmin(isMaster);
                setIsITAdmin(isIT);
                setIsBranchAdmin(isBranch);
                setIsEmployee(isEmp);
                setIsAdmin(isAdminUser);

                // Set default tab based on role
                let defaultTab = 'overall';
                if (isMaster || isIT) {
                    defaultTab = 'overall';
                } else if (isBranch) {
                    defaultTab = 'overall';
                } else if (isEmp) {
                    defaultTab = 'overall';
                }
                setActiveTab(defaultTab);

                // Mark initial tab as loaded and load its data
                markTabAsLoaded(defaultTab);
            } else {
                setError('No user data found in sessionStorage');
            }
        } catch (error) {
            console.error('Error parsing user data:', error);
            setError('Error loading user data');
        }
    }, []);

    useEffect(() => {
        if (userData && loadedTabs.overall && isInitialMount.current) {
            isInitialMount.current = false;
            loadOverallTabData();
        }
    }, [userData, loadedTabs.overall]);

    // Fetch export permission as soon as userData is available (independent of tab)
    //commented by nik
    // useEffect(() => {
    //     if (userData && userData.user_id) {
    //         fetchExportPermission();
    //     }
    // }, [userData?.user_id]);

    //added by nik
    useEffect(() => {
        if (userData) {
            setCanExport(Boolean(userData.can_export));
        }
    }, [userData]);

    // Deep-link support: the Navbar's ERP Sitemap opens a specific dashboard tab
    // via router state — navigate('/dashboard', { state: { openTab: 'branches' } }).
    // Defined AFTER the mount effect above so on a fresh mount this setActiveTab
    // wins over the role-based default. The state is consumed immediately so a
    // refresh or back-navigation doesn't re-apply it.
    const routerLocation = useLocation();
    const routerNavigate = useNavigate();
    useEffect(() => {
        const tab = routerLocation.state?.openTab;
        if (tab) {
            setActiveTab(tab);
            markTabAsLoaded(tab);
            routerNavigate(routerLocation.pathname, { replace: true, state: null });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [routerLocation.state]);

    // Load data when time period changes - PREVENT INFINITE LOOP
    // NOTE: fetch functions are intentionally NOT in the dependency array — they are
    // defined later in this component, so referencing them here would throw
    // "Cannot access before initialization". They are read at call-time inside the
    // effect body (which runs after render), where they are fully defined.
    useEffect(() => {
        if (userData && loadedTabs.overall && !isInitialMount.current && activeTab === 'overall') {
            isDataLoaded.current = false;
            hasFetchedBranchPerformance.current = false;
            setBranchPerfFetched(false); // refetching — Branch Overview shows its loader again if empty

            // Give the filter-change fetches a FRESH AbortController, exactly like the
            // tab-switch path does. Without this, the request fired on filter change can
            // be cancelled before it lands, so KALA Performance / Campaign Overview keep
            // stale values until a tab switch creates a fresh controller and refetches.
            abortControllerRef.current?.abort();
            abortControllerRef.current = new AbortController();

            if (isMasterAdmin || isITAdmin) {
                fetchSummaryStats();
                fetchCampaignPerformance();
                fetchBranchPerformance();
                fetchAllEmployeesPerformanceWithCampaigns();
            } else if (isBranchAdmin) {
                fetchBranchPerformanceForBranchAdmin();
                fetchBranchEmployeesForBranchAdmin();
                fetchCampaignPerformance();
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [timePeriod, customStartDate, customEndDate, activeTab, userData, isMasterAdmin, isITAdmin, isBranchAdmin]);

    // Load branch overview tab data when activated OR time period changes
    useEffect(() => {
        if (activeTab === 'branches' && userData && (isMasterAdmin || isITAdmin || isBranchAdmin)) {
            if (!loadedTabs.branches) {
                loadBranchOverviewTabData();
                markTabAsLoaded('branches');
            } else {
                // Re-fetch when time period changes
                loadBranchOverviewTabData();
            }
        }
    }, [activeTab, userData, timePeriod, customStartDate, customEndDate]);

    // Branch letter counts — loaded when the Branch Overview tab is active (one call).
    // NOTE: fetchBranchLetterCounts is defined LATER in this component, so it is
    // intentionally NOT in the dependency array — referencing it here would throw
    // "Cannot access 'fetchBranchLetterCounts' before initialization". It is read at
    // call-time inside the effect body (which runs after render, where the function is
    // fully defined) — same pattern as the other tab-loading effects above.
    useEffect(() => {
        if (activeTab === 'branches' && userData && (isMasterAdmin || isITAdmin || isBranchAdmin)) {
            fetchBranchLetterCounts();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeTab, userData, isMasterAdmin, isITAdmin, isBranchAdmin]);

    // Load employee progress tab data when activated
    useEffect(() => {
        if (activeTab === 'branch-report' && userData && (isMasterAdmin || isITAdmin || isBranchAdmin)) {
            if (!loadedTabs['branch-report']) {
                loadEmployeeProgressTabData();
                markTabAsLoaded('branch-report');
            } else if (isBranchAdmin) {
                // Re-fetch when time period changes (branch admin auto-loads its own branch)
                fetchBranchEmployeesForBranchAdmin();
            }
        }
    }, [activeTab, userData, isMasterAdmin, isITAdmin, isBranchAdmin, timePeriod, customStartDate, customEndDate]);

    useEffect(() => {
        if (activeTab === 'campaign-success' && userData && (isMasterAdmin || isITAdmin)) {
            if (!loadedTabs['campaign-success']) {
                loadCampaignSuccessTabData();
                markTabAsLoaded('campaign-success');
            } else {
                // Re-fetch when time period changes
                fetchCampaignPerformance();
            }
        }
    }, [activeTab, userData, isMasterAdmin, isITAdmin, timePeriod, customStartDate, customEndDate]);

    useEffect(() => {
        if (activeTab === 'activity' && userData && (isMasterAdmin || isITAdmin || isBranchAdmin)) {
            if (!loadedTabs.activity) {
                loadActivityFrequencyTabData();
                markTabAsLoaded('activity');
            } else {
                // Re-fetch when time period changes
                fetchActivityStats();
            }
        }
    }, [activeTab, userData, isMasterAdmin, isITAdmin, isBranchAdmin, timePeriod, customStartDate, customEndDate]);

    useEffect(() => {
        if (activeTab === 'rejected-reason' && userData && (isMasterAdmin || isITAdmin || isBranchAdmin)) {
            if (!loadedTabs['rejected-reason']) {
                loadRejectedReasonsTabData();
                markTabAsLoaded('rejected-reason');
            } else {
                // Re-fetch when time period changes
                fetchRrStats();
            }
        }
    }, [activeTab, userData, isMasterAdmin, isITAdmin, isBranchAdmin, timePeriod, customStartDate, customEndDate]);

    const loadCampaignSuccessTabData = useCallback(async () => {
        if (isLoadingData.current) return;
        isLoadingData.current = true;

        try {
            await fetchCampaignPerformance();
        } catch (error) {
            console.error('Error loading drive success tab data:', error);
        } finally {
            isLoadingData.current = false;
        }
    }, []);

    const fetchBranchAllocationSummary = useCallback(async (branchCode) => {
        const signal = abortControllerRef.current?.signal;
        try {
            const response = await axios.post(
                `${API_BASE_URL}/performance/branch-customer-allocate-summary/${branchCode}`,
                { user_id: userData.user_id || userData.id, name: userData.name, role: userData.role, branch: userData.branch },
                { signal }
            );
            if (isMounted.current) setAllocationSummary(prev => ({ ...prev, [branchCode]: response.data }));
        } catch (error) {
            if (axios.isCancel(error) || error.name === 'CanceledError') return;
            if (isMounted.current) {
                console.error(`Error fetching allocation summary for branch ${branchCode}:`, error);
                setAllocationSummary(prev => ({ ...prev, [branchCode]: null }));
            }
        }
    }, [userData]);

    // ONE grouped call -> letter counts for ALL branches (grouped by sender's branch).
    // Not time-filtered; fetched when the Branch Overview tab is active.
    const fetchBranchLetterCounts = useCallback(async () => {
        const signal = abortControllerRef.current?.signal;
        try {
            const payload = { user_id: userData.user_id || userData.id, name: userData.name, role: userData.role, branch: userData.branch };
            const res = await axios.post(`${API_BASE_URL}/performance/branch-letter-counts`, payload, { signal });
            if (isMounted.current) setBranchLetterCounts(res.data?.counts || {});
        } catch (error) {
            if (axios.isCancel(error) || error.name === 'CanceledError') return;
            if (isMounted.current) console.error('Error fetching branch letter counts:', error);
        }
    }, [userData]);

    const activityUniqueBranches = useMemo(() => {
        if (!activityStats) return [];
        const branches = new Set();
        activityStats.forEach(activity => {
            if (activity.user_breakdown) {
                activity.user_breakdown.forEach(user => {
                    const branchName = user.branch_display || user.branch;
                    if (branchName) branches.add(branchName);
                });
            }
        });
        return Array.from(branches).sort();
    }, [activityStats]);

    const handleCampaignSort = (key) => {
        setCampaignSortConfig(prevConfig => ({
            key,
            direction: prevConfig.key === key && prevConfig.direction === 'asc' ? 'desc' : 'asc'
        }));
    };

    const rrUniqueBranches = useMemo(() => {
        if (!rrStats) return [];
        const branches = new Set();
        rrStats.forEach(reason => {
            if (reason.user_breakdown) {
                reason.user_breakdown.forEach(user => {
                    const branchName = user.branch_display || user.branch;
                    if (branchName) branches.add(branchName);
                });
            }
        });
        return Array.from(branches).sort();
    }, [rrStats]);

    // Totals for the Drive Success stat cards — computed in ONE pass instead of
    // ~10 separate filter/reduce scans over campaignPerformance on every render.
    // Values are byte-for-byte identical to the previous inline computations.
    const campaignSuccessTotals = useMemo(() => {
        let activeCount = 0;
        let attendedTotal = 0, attendedActive = 0, attendedInactive = 0;
        let completedTotal = 0, completedActive = 0, completedInactive = 0;
        for (const c of campaignPerformance) {
            const attended = c.attended_customers || 0;
            const completed = c.completed_count || c.total_completed_followups || c.completed || 0;
            attendedTotal += attended;
            completedTotal += completed;
            if (c.status === 'active') {
                activeCount += 1;
                attendedActive += attended;
                completedActive += completed;
            } else if (c.status === 'inactive') {
                attendedInactive += attended;
                completedInactive += completed;
            }
        }
        // Matches original: length > 0 ? rate.toFixed(1) : 0 (renders "0%" when empty)
        const avgSuccessRateDisplay = campaignPerformance.length > 0
            ? (attendedTotal > 0 ? ((completedTotal / attendedTotal) * 100) : 0).toFixed(1)
            : 0;
        return { activeCount, attendedTotal, attendedActive, attendedInactive, completedTotal, completedActive, completedInactive, avgSuccessRateDisplay };
    }, [campaignPerformance]);

    const sortedCampaignPerformance = useMemo(() => {
        if (!campaignPerformance || campaignPerformance.length === 0) return [];

        const campaigns = [...campaignPerformance];
        const { key, direction } = campaignSortConfig;

        campaigns.sort((a, b) => {
            let aValue, bValue;

            switch (key) {
                case 'campaign_name':
                    aValue = a.campaign_name || '';
                    bValue = b.campaign_name || '';
                    break;
                case 'created_by_name':
                    aValue = a.created_by_name || '';
                    bValue = b.created_by_name || '';
                    break;
                case 'service':
                    aValue = a.service || '';
                    bValue = b.service || '';
                    break;
                case 'status':
                    aValue = a.status || '';
                    bValue = b.status || '';
                    break;
                case 'asset_numbers_count':
                    aValue = a.asset_numbers_count || 0;
                    bValue = b.asset_numbers_count || 0;
                    break;
                case 'attended_customers':
                    aValue = a.attended_customers || 0;
                    bValue = b.attended_customers || 0;
                    break;
                case 'total_customers':
                    aValue = a.total_customers || 0;
                    bValue = b.total_customers || 0;
                    break;
                case 'completed_count':
                    aValue = a.completed_count || 0;
                    bValue = b.completed_count || 0;
                    break;
                case 'not_connected_count':
                    aValue = a.not_connected_count || 0;
                    bValue = b.not_connected_count || 0;
                    break;
                case 'wip_count':
                    aValue = a.wip_count || 0;
                    bValue = b.wip_count || 0;
                    break;
                case 'rescheduled_count':
                    aValue = a.rescheduled_count || 0;
                    bValue = b.rescheduled_count || 0;
                    break;
                case 'rejected_count':
                    aValue = a.rejected_count || 0;
                    bValue = b.rejected_count || 0;
                    break;
                case 'success_percentage':
                    aValue = a.success_percentage || 0;
                    bValue = b.success_percentage || 0;
                    break;
                case 'C1':
                case 'C2':
                case 'C3':
                case 'C4':
                case 'C5':
                case 'C6':
                case 'C7':
                    aValue = (a.flag_breakdown && a.flag_breakdown[key]) || 0;
                    bValue = (b.flag_breakdown && b.flag_breakdown[key]) || 0;
                    break;
                default:
                    return 0;
            }

            if (typeof aValue === 'string') {
                return direction === 'asc'
                    ? aValue.localeCompare(bValue)
                    : bValue.localeCompare(aValue);
            } else {
                return direction === 'asc'
                    ? aValue - bValue
                    : bValue - aValue;
            }
        });

        return campaigns;
    }, [campaignPerformance, campaignSortConfig]);

    // Backwards compat shim — JSX using getSortedCampaignPerformance() still works
    const getSortedCampaignPerformance = useCallback(() => sortedCampaignPerformance, [sortedCampaignPerformance]);

    // flagOrder moved to FLAG_ORDER constant outside component (use FLAG_ORDER below)
    const flagOrder = FLAG_ORDER;

    // Set up scroll synchronization for Campaign Success tab
    useEffect(() => {
        if (activeTab !== 'campaign-success') return;

        const tableContainer = campaignTableContainerRef.current;
        const topScrollBar = campaignTopScrollBarRef.current;

        if (!tableContainer || !topScrollBar) return;

        const updateTopScrollWidth = () => {
            if (tableContainer && topScrollBar) {
                // Always mirror the table's scroll width — when the table fits,
                // the spacer equals the visible width and no bar shows.
                const spacer = topScrollBar.querySelector('div');
                if (spacer) {
                    spacer.style.width = `${tableContainer.scrollWidth}px`;
                    spacer.style.height = '1px';
                }
            }
        };

        updateTopScrollWidth();

        const resizeObserver = new ResizeObserver(() => {
            updateTopScrollWidth();
        });

        if (tableContainer) {
            resizeObserver.observe(tableContainer);
            const tableEl = tableContainer.querySelector('table');
            if (tableEl) resizeObserver.observe(tableEl); // re-size when columns change width
        }

        const handleTableScroll = () => {
            if (topScrollBar) {
                topScrollBar.scrollLeft = tableContainer.scrollLeft;
            }
        };

        const handleTopScroll = () => {
            if (tableContainer) {
                tableContainer.scrollLeft = topScrollBar.scrollLeft;
            }
        };

        tableContainer.addEventListener('scroll', handleTableScroll);
        topScrollBar.addEventListener('scroll', handleTopScroll);

        return () => {
            tableContainer.removeEventListener('scroll', handleTableScroll);
            topScrollBar.removeEventListener('scroll', handleTopScroll);
            resizeObserver.disconnect();
        };
        // campaignLoading in deps: the refs only mount AFTER the loading
        // spinner goes away — without it, the first open of the tab attaches
        // nothing and the top scrollbar never appears.
    }, [activeTab, campaignPerformance, campaignLoading]);

    // Set up scroll synchronization for Rejected Reasons tab
    useEffect(() => {
        if (activeTab !== 'rejected-reason') return;

        const tableContainer = tableContainerRef.current;
        const topScrollBar = topScrollBarRef.current;

        if (!tableContainer || !topScrollBar) return;

        const updateTopScrollWidth = () => {
            if (tableContainer && topScrollBar) {
                const scrollWidth = tableContainer.scrollWidth;
                const clientWidth = tableContainer.clientWidth;

                if (scrollWidth > clientWidth) {
                    const spacer = topScrollBar.querySelector('div');
                    if (spacer) {
                        spacer.style.width = `${scrollWidth}px`;
                        spacer.style.height = '1px';
                    }
                }
            }
        };

        updateTopScrollWidth();

        const resizeObserver = new ResizeObserver(() => {
            updateTopScrollWidth();
        });

        if (tableContainer) {
            resizeObserver.observe(tableContainer);
        }

        const handleTableScroll = () => {
            if (topScrollBar) {
                topScrollBar.scrollLeft = tableContainer.scrollLeft;
            }
        };

        const handleTopScroll = () => {
            if (tableContainer) {
                tableContainer.scrollLeft = topScrollBar.scrollLeft;
            }
        };

        tableContainer.addEventListener('scroll', handleTableScroll);
        topScrollBar.addEventListener('scroll', handleTopScroll);

        return () => {
            tableContainer.removeEventListener('scroll', handleTableScroll);
            topScrollBar.removeEventListener('scroll', handleTopScroll);
            resizeObserver.disconnect();
        };
    }, [activeTab, rrDetailedView, rrStats]);

    const handleCampaignNameClick = (campaign) => {
        setSelectedCampaign(campaign);
        setShowCustomersModal(true);
    };

    const handleBranchNameClick = (branch) => {
        setSelectedBranchForModal(branch);
        setShowBranchCustomersModal(true);
    };

    const handleOpenBranchLetters = (branch) => {
        setSelectedBranchForLetters(branch);
        setShowBranchLetterModal(true);
    };

    // Set up scroll synchronization for Activity Frequency tab
    useEffect(() => {
        if (activeTab !== 'activity') return;

        const tableContainer = activityTableContainerRef.current;
        const topScrollBar = activityTopScrollBarRef.current;

        if (!tableContainer || !topScrollBar) return;

        const updateTopScrollWidth = () => {
            if (tableContainer && topScrollBar) {
                const scrollWidth = tableContainer.scrollWidth;
                const clientWidth = tableContainer.clientWidth;

                if (scrollWidth > clientWidth) {
                    const spacer = topScrollBar.querySelector('div');
                    if (spacer) {
                        spacer.style.width = `${scrollWidth}px`;
                        spacer.style.height = '1px';
                    }
                }
            }
        };

        updateTopScrollWidth();

        const resizeObserver = new ResizeObserver(() => {
            updateTopScrollWidth();
        });

        if (tableContainer) {
            resizeObserver.observe(tableContainer);
        }

        const handleTableScroll = () => {
            if (topScrollBar) {
                topScrollBar.scrollLeft = tableContainer.scrollLeft;
            }
        };

        const handleTopScroll = () => {
            if (tableContainer) {
                tableContainer.scrollLeft = topScrollBar.scrollLeft;
            }
        };

        tableContainer.addEventListener('scroll', handleTableScroll);
        topScrollBar.addEventListener('scroll', handleTopScroll);

        return () => {
            tableContainer.removeEventListener('scroll', handleTableScroll);
            topScrollBar.removeEventListener('scroll', handleTopScroll);
            resizeObserver.disconnect();
        };
    }, [activeTab, detailedView, activityStats]);

    const formatDateForAPI = (date) => {
        if (!date) return null;
        // Use LOCAL (IST) date parts so the chosen day isn't shifted to the
        // previous day by UTC conversion (toISOString shifts IST dates back).
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    };

    const handleBranchEmployeeTableSort = (columnKey) => {
        setBranchEmployeeSortState(prevState => ({
            sortKey: columnKey,
            sortDirection: prevState.sortKey === columnKey && prevState.sortDirection === 'asc' ? 'desc' : 'asc'
        }));
    };

    const renderBranchEmployeeSortIcon = (columnKey) => {
        if (branchEmployeeSortState.sortKey !== columnKey) {
            return <span className="ml-1 opacity-60">↕</span>;
        }
        return branchEmployeeSortState.sortDirection === 'asc' ?
            <span className="ml-1">↑</span> :
            <span className="ml-1">↓</span>;
    };

    const sortedBranchEmployees = useMemo(() => {
        const selectedBranchesList = selectedBranch ? selectedBranch.split(',') : [];
        const hideKalaUser = selectedBranchesList.includes('HO');

        const filteredEmployees = hideKalaUser
            ? branchEmployees.filter(emp => String(emp.user_id) !== MASTER_ADMIN_ID)
            : branchEmployees;

        if (!branchEmployeeSortState.sortKey) return filteredEmployees;

        return [...filteredEmployees].sort((employeeA, employeeB) => {
            let valueA, valueB;

            switch (branchEmployeeSortState.sortKey) {
                case 'totalFollowups':
                    valueA = employeeA.total_followups || 0;
                    valueB = employeeB.total_followups || 0;
                    break;
                case 'completedCount':
                    valueA = employeeA.completed_count || 0;
                    valueB = employeeB.completed_count || 0;
                    break;
                case 'wipCount':
                    valueA = employeeA.wip_count || 0;
                    valueB = employeeB.wip_count || 0;
                    break;
                case 'rescheduledCount':
                    valueA = employeeA.rescheduled_count || 0;
                    valueB = employeeB.rescheduled_count || 0;
                    break;
                case 'rejectedCount':
                    valueA = employeeA.rejected_count || 0;
                    valueB = employeeB.rejected_count || 0;
                    break;
                case 'notConnectedCount':
                    valueA = employeeA.not_connected_count || 0;
                    valueB = employeeB.not_connected_count || 0;
                    break;
                case 'quotationValue':
                    valueA = employeeA.total_quotation_value || 0;
                    valueB = employeeB.total_quotation_value || 0;
                    break;
                default:
                    return 0;
            }

            if (valueA < valueB) return branchEmployeeSortState.sortDirection === 'asc' ? -1 : 1;
            if (valueA > valueB) return branchEmployeeSortState.sortDirection === 'asc' ? 1 : -1;
            return 0;
        });
    }, [branchEmployees, branchEmployeeSortState, selectedBranch]);

    // Backwards compat shim — JSX using getSortedBranchEmployeesList() still works
    const getSortedBranchEmployeesList = useCallback(() => sortedBranchEmployees, [sortedBranchEmployees]);

    const fetchBranchEngagedData = useCallback(async (branchCode) => {
        const signal = abortControllerRef.current?.signal;
        try {
            if (isMounted.current) setBranchStatsLoading(prev => ({ ...prev, [branchCode]: true }));
            const response = await axios.post(
                `${API_BASE_URL}/performance/branch-campaign-customers/${branchCode}`,
                { user_id: userData.user_id || userData.id, name: userData.name, role: userData.role, branch: userData.branch },
                { signal }
            );
            if (isMounted.current) setBranchEngagedData(prev => ({ ...prev, [branchCode]: response.data }));
        } catch (error) {
            if (axios.isCancel(error) || error.name === 'CanceledError') return;
            if (isMounted.current) {
                console.error(`Error fetching engaged data for branch ${branchCode}:`, error);
                setBranchEngagedData(prev => ({ ...prev, [branchCode]: null }));
            }
        } finally {
            if (isMounted.current) setBranchStatsLoading(prev => ({ ...prev, [branchCode]: false }));
        }
    }, [userData]);

    const fetchExportPermission = useCallback(async () => {
        const signal = abortControllerRef.current?.signal;
        try {
            const payload = {
                user_id: userData.user_id || userData.id,
                name: userData.name,
                role: userData.role,
                branch: userData.branch
            };
            const response = await axios.post(
                `${API_BASE_URL}/performance/check-export-permission`,
                payload,
                { signal }
            );
            if (isMounted.current) {
                setCanExport(response.data?.can_export || false);
            }
        } catch (error) {
            if (axios.isCancel(error) || error.name === 'CanceledError') return;
            if (isMounted.current) {
                console.error('Error fetching export permission:', error);
                setCanExport(false);
            }
        }
    }, [userData]);

    const fetchBranchRemainingData = useCallback(async (branchCode) => {
        const signal = abortControllerRef.current?.signal;
        try {
            const response = await axios.post(
                `${API_BASE_URL}/performance/branch-total-customers/${branchCode}`,
                { user_id: userData.user_id || userData.id, name: userData.name, role: userData.role, branch: userData.branch },
                { signal }
            );
            if (isMounted.current) setBranchRemainingData(prev => ({ ...prev, [branchCode]: response.data }));
        } catch (error) {
            if (axios.isCancel(error) || error.name === 'CanceledError') return;
            if (isMounted.current) {
                console.error(`Error fetching remaining data for branch ${branchCode}:`, error);
                setBranchRemainingData(prev => ({ ...prev, [branchCode]: null }));
            }
        }
    }, [userData]);

    // ONE request for every branch's engaged/remaining/allocation aggregates —
    // replaces the old 3-requests-per-branch fan-out (each of which loaded the
    // full customer + follow-up detail server-side) that made the Branch-wise
    // Asset Progress chart and Branch Overview tab crawl.
    const branchSummariesRequestedRef = useRef(false);
    const fetchAllBranchSummaries = useCallback(async () => {
        const signal = abortControllerRef.current?.signal;
        const response = await axios.post(
            `${API_BASE_URL}/performance/branches-campaign-summary`,
            { user_id: userData.user_id || userData.id, name: userData.name, role: userData.role, branch: userData.branch },
            { signal }
        );
        const branches = response.data?.branches || {};
        if (!isMounted.current) return branches;
        const engaged = {}, remaining = {}, allocation = {};
        Object.entries(branches).forEach(([code, d]) => {
            if (d?.engaged) engaged[code] = d.engaged;
            if (d?.remaining) remaining[code] = d.remaining;
            if (d?.allocation) allocation[code] = d.allocation;
        });
        // prev spread LAST: anything already fetched in richer per-branch form
        // (e.g. by the Branch Customers modal) keeps winning over the batch data.
        setBranchEngagedData(prev => ({ ...engaged, ...prev }));
        setBranchRemainingData(prev => ({ ...remaining, ...prev }));
        setAllocationSummary(prev => ({ ...allocation, ...prev }));
        return branches;
    }, [userData]);

    // Batch-first loader with per-branch fallback (older servers / batch failure).
    const ensureBranchSummaries = useCallback(async (branchList) => {
        if (!branchList || branchList.length === 0) return;
        if (branchSummariesRequestedRef.current) return; // already requested / in flight
        branchSummariesRequestedRef.current = true;
        let covered = null;
        try {
            covered = await fetchAllBranchSummaries();
        } catch (error) {
            if (axios.isCancel(error) || error.name === 'CanceledError') return;
            console.error('Batch branch summary failed — falling back to per-branch fetches:', error);
        }
        // Fetch per-branch anything the batch didn't cover (or everything, if it
        // failed) — a branch missing from the batch would otherwise stay stuck
        // in its loading skeleton forever.
        branchList.forEach(branch => {
            if (branch.branch && !(covered && covered[branch.branch])) {
                fetchBranchEngagedData(branch.branch);
                fetchBranchRemainingData(branch.branch);
                fetchBranchAllocationSummary(branch.branch);
            }
        });
    }, [fetchAllBranchSummaries, fetchBranchEngagedData, fetchBranchRemainingData, fetchBranchAllocationSummary]);

    useEffect(() => {
        if (loadedTabs.branches && branchPerformance && branchPerformance.length > 0 && (isMasterAdmin || isITAdmin || isBranchAdmin)) {
            ensureBranchSummaries(branchPerformance);
        }
    }, [branchPerformance, ensureBranchSummaries, loadedTabs.branches]);

    const getTotalRemainingCustomers = (branchCode) => {
        const remainingData = branchRemainingData[branchCode];
        if (!remainingData?.campaigns) return 0;
        return remainingData.campaigns.reduce((sum, campaign) => {
            return sum + (campaign.remaining_customers || 0);
        }, 0);
    };

    const getTotalAssets = (branchCode) => {
        const engagedData = branchEngagedData[branchCode];
        const completed = engagedData?.completed_followups || 0;
        const remaining = getTotalRemainingCustomers(branchCode);
        return completed + remaining;
    };

    const getEngagedCustomers = (branchCode) => {
        return branchEngagedData[branchCode]?.total_customers || 0;
    };

    const getCompletedFollowups = (branchCode) => {
        return branchEngagedData[branchCode]?.completed_followups || 0;
    };

    const getTotalCampaigns = (branchCode) => {
        const engagedData = branchEngagedData[branchCode];
        if (!engagedData?.campaigns) return 0;

        return engagedData.campaigns.filter(campaign => {
            const remainingData = branchRemainingData[branchCode];
            const campaignData = remainingData?.campaigns?.find(
                c => Number(c.campaign_id) === Number(campaign.campaign_id)
            );
            const status = campaignData?.status || 'unknown';
            return status.toLowerCase() !== 'unknown';
        }).length;
    };

    const getWipCount = (branchCode) => {
        return branchEngagedData[branchCode]?.wip_followups || 0;
    };

    const getRejectedCount = (branchCode) => {
        return branchEngagedData[branchCode]?.rejected_followups || 0;
    };

    const getRescheduledCount = (branchCode) => {
        return branchEngagedData[branchCode]?.rescheduled_followups || 0;
    };

    const getTotalFollowups = (branchCode) => {
        return branchEngagedData[branchCode]?.total_followups || 0;
    };

    const getCompletionRate = (branchCode) => {
        return branchEngagedData[branchCode]?.branch_completion_rate || 0;
    };

    const fetchSummaryStats = useCallback(async () => {
        const signal = abortControllerRef.current?.signal;
        // Warm-cache-first paint: show last known data instantly (only if state is
        // still empty); the fetch below always runs and overwrites it with fresh data.
        const summaryWarmKey = warmKey('dash-summary', {
            userId: userData.user_id || userData.id,
            role: userData.role || '',
            branch: userData.branch || '',
            timePeriod,
            start: timePeriod === 'custom' && customStartDate ? formatDateForAPI(customStartDate) : null,
            end: timePeriod === 'custom' && customEndDate ? formatDateForAPI(customEndDate) : null
        });
        const warmSummary = readWarmCache(summaryWarmKey);
        if (warmSummary && isMounted.current) {
            setSummaryStats(prev => (prev == null ? warmSummary : prev));
        }
        try {
            let url = `${API_BASE_URL}/performance/summary?time_period=${timePeriod}`;
            if (timePeriod === 'custom' && customStartDate && customEndDate) {
                url += `&start_date=${formatDateForAPI(customStartDate)}&end_date=${formatDateForAPI(customEndDate)}`;
            }
            const params = new URLSearchParams({
                user_id: userData.user_id || userData.id,
                name: userData.name || '',
                role: userData.role || '',
                branch: userData.branch || ''
            });
            const response = await axios.get(`${url}&${params.toString()}`, { signal });
            if (isMounted.current) setSummaryStats(response.data);
            writeWarmCache(summaryWarmKey, response.data);
        } catch (error) {
            if (axios.isCancel(error) || error.name === 'CanceledError') return; // Ignore aborts
            if (isMounted.current) {
                console.error('Error fetching summary stats:', error);
                setSummaryStats({ /* your fallback object */ });
            }
        }
    }, [userData, timePeriod, customStartDate, customEndDate]);

    // KALA Performance tab: only fetch what the graph actually needs (branch performance + engaged/remaining)
    // Allocation summary is loaded lazily only when Branch Overview is opened
    useEffect(() => {
        if (activeTab === 'overall' && (isMasterAdmin || isITAdmin) && loadedTabs.overall && !isLoadingData.current) {
            if (branchPerformance.length === 0) fetchBranchPerformance();
            if (branches.length === 0) fetchAllBranches();
            // Only fetch engaged/remaining for the graph — ONE batch call for all branches
            if (branchPerformance.length > 0) {
                ensureBranchSummaries(branchPerformance);
            }
        }
    }, [activeTab, isMasterAdmin, isITAdmin, loadedTabs.overall, branchPerformance.length, branches.length]);

    const ActiveCampaignsProgressChart = ({ campaigns, loading }) => {
        const [chartData, setChartData] = useState(null);

        useEffect(() => {
            if (!campaigns || campaigns.length === 0) return;

            const sorted = [...campaigns];

            setChartData({
                labels: sorted.map(c =>
                    c.campaign_name.length > 15
                        ? c.campaign_name.substring(0, 12) + "..."
                        : c.campaign_name
                ),
                datasets: [
                    {
                        type: "bar",
                        label: "Completed",
                        borderColor: "#22c55e",
                        data: sorted.map(c => c.completed_customers),
                        backgroundColor: "rgba(34, 197, 94, 0.85)",
                        borderRadius: 6,
                        barThickness: 25
                    },
                    {
                        type: "line",
                        label: "Remaining",
                        data: sorted.map(c => c.remaining_customers),
                        borderColor: "#f59e0b",
                        backgroundColor: "#f59e0b",
                        tension: 0.4,
                        pointRadius: 5,
                        pointHoverRadius: 7,
                        fill: false
                    }
                ]
            });
        }, [campaigns]);

        const options = {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: "top"
                },
                tooltip: {
                    callbacks: {
                        label: function (context) {
                            return `${context.dataset.label}: ${context.raw}`;
                        }
                    }
                },
                datalabels: {
                    display: false
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    title: {
                        display: true,
                        text: "Customers"
                    }
                },
                x: {
                    grid: {
                        display: false
                    }
                }
            }
        };

        if (loading) return <div className="h-64 flex items-center justify-center">Loading...</div>;
        if (!campaigns || campaigns.length === 0) return <div className="h-64 flex items-center justify-center text-gray-500">No active campaigns data available</div>;

        return (
            <div className="w-full h-80">
                {chartData && (
                    <Bar
                        data={chartData}
                        options={options}
                        plugins={[ChartDataLabels]}
                    />
                )}
            </div>
        );
    };

    const fetchActivityStats = useCallback(async () => {
        const signal = abortControllerRef.current?.signal;
        try {
            if (isMounted.current) setActivityLoading(true);
            const payload = {
                user_info: { user_id: userData.user_id || userData.id, name: userData.name, role: userData.role, branch: userData.branch },
                campaign_ids: selectedCampaigns.length > 0 ? selectedCampaigns : null
            };
            let url = `${API_BASE_URL}/performance/activity-stats?time_period=${timePeriod}`;
            if (timePeriod === 'custom' && customStartDate && customEndDate) {
                url += `&start_date=${formatDateForAPI(customStartDate)}&end_date=${formatDateForAPI(customEndDate)}`;
            }
            const response = await axios.post(url, payload, { signal });
            if (isMounted.current) {
                setActivityStats(response.data.activities || []);
                setCampaignTotals(response.data.campaign_totals || { total_customers: 0, total_followups: 0 });
            }
        } catch (error) {
            if (axios.isCancel(error) || error.name === 'CanceledError') return;
            if (isMounted.current) {
                console.error('Error fetching activity frequency:', error);
                setActivityStats([]);
                setCampaignTotals({ total_customers: 0, total_followups: 0 });
            }
        } finally {
            if (isMounted.current) setActivityLoading(false);
        }
    }, [userData, timePeriod, customStartDate, customEndDate, selectedCampaigns]);

    const fetchRrStats = useCallback(async () => {
        const signal = abortControllerRef.current?.signal;
        try {
            if (isMounted.current) setRrLoading(true);
            const payload = {
                user_info: { user_id: userData.user_id || userData.id, name: userData.name, role: userData.role, branch: userData.branch },
                campaign_ids: selectedCampaigns.length > 0 ? selectedCampaigns : null
            };
            let url = `${API_BASE_URL}/performance/rr-stats?time_period=${timePeriod}`;
            if (timePeriod === 'custom' && customStartDate && customEndDate) {
                url += `&start_date=${formatDateForAPI(customStartDate)}&end_date=${formatDateForAPI(customEndDate)}`;
            }
            const response = await axios.post(url, payload, { signal });
            if (isMounted.current) {
                setRrStats(response.data.rr_reasons || []);
                setRrCampaignTotals(response.data.campaign_totals || { total_customers: 0, total_followups: 0 });
            }
        } catch (error) {
            if (axios.isCancel(error) || error.name === 'CanceledError') return;
            if (isMounted.current) {
                console.error('Error fetching RR stats:', error);
                setRrStats([]);
                setRrCampaignTotals({ total_customers: 0, total_followups: 0 });
            }
        } finally {
            if (isMounted.current) setRrLoading(false);
        }
    }, [userData, timePeriod, customStartDate, customEndDate, selectedCampaigns]);

    const fetchCampaignsList = useCallback(async () => {
        const signal = abortControllerRef.current?.signal;
        try {
            const payload = { user_id: userData.user_id || userData.id, name: userData.name, role: userData.role, branch: userData.branch };
            const response = await axios.post(`${API_BASE_URL}/performance/campaigns-list`, payload, { signal });
            if (isMounted.current) {
                setAllCampaigns(response.data?.campaigns || []);
            }
        } catch (error) {
            if (axios.isCancel(error) || error.name === 'CanceledError') return;
            if (isMounted.current) {
                console.error('Error fetching campaigns list:', error);
                setAllCampaigns([]);
            }
        }
    }, [userData]);

    // fetchCampaignsList is defined above this point

    const loadActivityFrequencyTabData = useCallback(async () => {
        setActivityLoading(true);
        try {
            await Promise.all([
                fetchCampaignsList(),
                fetchActivityStats()
            ]);
        } catch (error) {
            console.error('Error loading activity frequency tab data:', error);
        }
        // fetchActivityStats already calls setActivityLoading(false) in its finally block
    }, [fetchCampaignsList, fetchActivityStats]);

    const loadRejectedReasonsTabData = useCallback(async () => {
        setRrLoading(true);
        try {
            await Promise.all([
                fetchCampaignsList(),
                fetchRrStats()
            ]);
        } catch (error) {
            console.error('Error loading rejected reasons tab data:', error);
        }
        // fetchRrStats already calls setRrLoading(false) in its finally block
    }, [fetchCampaignsList, fetchRrStats]);

    const handleCampaignFilter = (campaignId) => {
        setSelectedCampaigns(prev => {
            const newSelection = prev.includes(campaignId)
                ? prev.filter(id => id !== campaignId)
                : [...prev, campaignId];
            return newSelection;
        });
    };

    const clearCampaignFilters = () => {
        setSelectedCampaigns([]);
    };

    const selectAllCampaigns = () => {
        const allIds = allCampaigns.map(c => c.id);
        setSelectedCampaigns(allIds);
    };

    const handleEmployeeNameClick = (employee) => {
        setSelectedEmployee(employee);
        setShowEmployeeModal(true);
    };

    const handleCampaignProgressClick = (employee) => {
        setSelectedEmployeeForProgress(employee);
        setShowCampaignProgressModal(true);
    };

    const toggleActivityExpand = (activityId) => {
        setExpandedActivities(prev => ({
            ...prev,
            [activityId]: !prev[activityId]
        }));
    };

    const toggleReasonExpand = (reasonId) => {
        setExpandedReasons(prev => ({
            ...prev,
            [reasonId]: !prev[reasonId]
        }));
    };

    const getSortedStatusCampaigns = () => {
        if (!statusStats?.campaigns) return [];

        const campaigns = [...statusStats.campaigns];
        const { key, direction } = statusSortConfig;

        campaigns.sort((a, b) => {
            let aValue, bValue;

            switch (key) {
                case 'sno':
                    return direction === 'asc' ? 1 : -1;
                case 'campaign_name':
                    aValue = a.campaign_name || '';
                    bValue = b.campaign_name || '';
                    break;
                case 'service':
                    aValue = a.service || '';
                    bValue = b.service || '';
                    break;
                case 'total':
                    aValue = a.total || 0;
                    bValue = b.total || 0;
                    break;
                case 'completed':
                    aValue = a.completed || 0;
                    bValue = b.completed || 0;
                    break;
                case 'wip':
                    aValue = a.wip || 0;
                    bValue = b.wip || 0;
                    break;
                case 'rejected':
                    aValue = a.rejected || 0;
                    bValue = b.rejected || 0;
                    break;
                default:
                    return 0;
            }

            if (typeof aValue === 'string') {
                return direction === 'asc'
                    ? aValue.localeCompare(bValue)
                    : bValue.localeCompare(aValue);
            } else {
                return direction === 'asc'
                    ? aValue - bValue
                    : bValue - aValue;
            }
        });

        return campaigns;
    };

    const sortedStatusCampaigns = getSortedStatusCampaigns();

    const requestSort = (key) => {
        let direction = 'asc';
        if (sortConfig.key === key && sortConfig.direction === 'asc') {
            direction = 'desc';
        }
        setSortConfig({ key, direction });
    };

    const sortedActivityStats = useMemo(() => {
        if (!activityStats) return [];
        if (!sortConfig.key) return activityStats;

        return [...activityStats].sort((a, b) => {
            let aValue, bValue;

            if (sortConfig.key === 'activity_name') {
                aValue = a.activity_name?.toLowerCase() || '';
                bValue = b.activity_name?.toLowerCase() || '';
            } else if (sortConfig.key === 'total_count') {
                aValue = a.total_count || 0;
                bValue = b.total_count || 0;
            } else {
                return 0;
            }

            if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
            if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
            return 0;
        });
    }, [activityStats, sortConfig]);

    // Backwards compat shim — JSX using getSortedData(activityStats) still works
    const getSortedData = useCallback(() => sortedActivityStats, [sortedActivityStats]);

    const exportActivityStatsToExcel = () => {
        if (!activityStats || activityStats.length === 0) {
            setError('No activity data to export');
            return;
        }

        const exportData = [];
        let serialNo = 1;

        if (selectedCampaigns.length > 0) {
            exportData.push({
                'A': 'SELECTED DRIVES REPORT',
                'B': '',
                'C': '',
                'D': '',
                'E': '',
                'F': '',
                'G': '',
                'H': ''
            });
            exportData.push({});

            exportData.push({
                'A': 'Drive Name',
                'B': 'Service Type',
                'C': '',
                'D': '',
                'E': '',
                'F': '',
                'G': '',
                'H': ''
            });

            allCampaigns
                .filter(c => selectedCampaigns.includes(c.id))
                .forEach((campaign) => {
                    exportData.push({
                        'A': campaign.name,
                        'B': campaign.service,
                        'C': '',
                        'D': '',
                        'E': '',
                        'F': '',
                        'G': '',
                        'H': ''
                    });
                });

            exportData.push({});
            exportData.push({
                'A': `Total Selected Drives: ${selectedCampaigns.length}`,
                'B': `Total Active Drive Assets: ${campaignTotals?.total_customers || 0}`,
                'C': `Total Connected Calls: ${campaignTotals?.total_followups || 0}`,
                'D': '',
                'E': '',
                'F': '',
                'G': '',
                'H': ''
            });

            exportData.push({});
            exportData.push({});
            exportData.push({});
        }

        if (detailedView) {
            exportData.push({
                'A': 'ACTIVITY STATISTICS - DETAILED VIEW (USER WISE)',
                'B': '',
                'C': '',
                'D': '',
                'E': '',
                'F': '',
                'G': '',
                'H': ''
            });
            exportData.push({});

            exportData.push({
                'A': 'Sr. No.',
                'B': 'Activity',
                'C': 'Total Active Drive Assets',
                'D': 'Total Connected Calls',
                'E': 'Activity Count',
                'F': 'User Name',
                'G': 'Branch',
                'H': 'Individual Count'
            });

            activityStats.forEach(activity => {
                if (activity.user_breakdown && activity.user_breakdown.length > 0) {
                    activity.user_breakdown.forEach((user) => {
                        const row = {
                            'A': serialNo++,
                            'B': activity.activity_name,
                            'C': campaignTotals?.total_customers || 0,
                            'D': campaignTotals?.total_followups || 0,
                            'E': activity.total_count,
                            'F': user.user_name || 'N/A',
                            'G': user.branch_display || user.branch || 'N/A',
                            'H': user.count
                        };
                        exportData.push(row);
                    });
                } else {
                    const row = {
                        'A': serialNo++,
                        'B': activity.activity_name,
                        'C': campaignTotals?.total_customers || 0,
                        'D': campaignTotals?.total_followups || 0,
                        'E': activity.total_count,
                        'F': 'No data',
                        'G': 'No data',
                        'H': 0
                    };
                    exportData.push(row);
                }
            });
        } else {
            exportData.push({
                'A': 'ACTIVITY STATISTICS - SUMMARY VIEW (BRANCH WISE)',
                'B': '',
                'C': '',
                'D': '',
                'E': '',
                'F': '',
                'G': ''
            });
            exportData.push({});

            exportData.push({
                'A': 'Sr. No.',
                'B': 'Activity',
                'C': 'Total Active Drive Assets',
                'D': 'Total Connected Calls',
                'E': 'Total Count',
                'F': 'Branch',
                'G': 'Branch Count'
            });

            activityStats.forEach(activity => {
                const branchMap = new Map();
                if (activity.user_breakdown && activity.user_breakdown.length > 0) {
                    activity.user_breakdown.forEach(user => {
                        const branchName = user.branch_display || user.branch;
                        if (branchMap.has(branchName)) {
                            branchMap.set(branchName, branchMap.get(branchName) + user.count);
                        } else {
                            branchMap.set(branchName, user.count);
                        }
                    });
                }

                if (branchMap.size > 0) {
                    const mainRow = {
                        'A': serialNo++,
                        'B': activity.activity_name,
                        'C': campaignTotals?.total_customers || 0,
                        'D': campaignTotals?.total_followups || 0,
                        'E': activity.total_count,
                        'F': '---',
                        'G': '---'
                    };
                    exportData.push(mainRow);

                    branchMap.forEach((count, branch) => {
                        const branchRow = {
                            'A': '',
                            'B': '',
                            'C': '',
                            'D': '',
                            'E': '',
                            'F': branch,
                            'G': count
                        };
                        exportData.push(branchRow);
                    });

                    exportData.push({});
                } else {
                    const row = {
                        'A': serialNo++,
                        'B': activity.activity_name,
                        'C': campaignTotals?.total_customers || 0,
                        'D': campaignTotals?.total_followups || 0,
                        'E': activity.total_count,
                        'F': 'No breakdown data',
                        'G': 0
                    };
                    exportData.push(row);
                }
            });
        }

        const ws = XLSX.utils.json_to_sheet(exportData, { skipHeader: true });

        if (detailedView) {
            ws['!cols'] = [
                { wch: 8 }, { wch: 30 }, { wch: 28 }, { wch: 18 }, { wch: 15 }, { wch: 25 }, { wch: 20 }, { wch: 15 }
            ];
        } else {
            ws['!cols'] = [
                { wch: 8 }, { wch: 30 }, { wch: 18 }, { wch: 18 }, { wch: 15 }, { wch: 25 }, { wch: 15 }
            ];
        }

        const range = XLSX.utils.decode_range(ws['!ref'] || 'A1:A1');
        for (let row = range.s.r; row <= range.e.r; row++) {
            const cellAddress = XLSX.utils.encode_cell({ r: row, c: 0 });
            if (ws[cellAddress] && typeof ws[cellAddress].v === 'string') {
                const cellValue = ws[cellAddress].v;
                if (cellValue.includes('SELECTED DRIVES REPORT') ||
                    cellValue.includes('ACTIVITY STATISTICS') ||
                    cellValue === 'Drive Name' ||
                    cellValue === 'Sr. No.') {
                    ws[cellAddress].s = {
                        font: { bold: true, sz: 12 }
                    };
                }
            }
        }

        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Activity Statistics');

        const periodText = getTimePeriodDisplayText().replace(/ /g, '_');
        const campaignText = selectedCampaigns.length > 0 ? `_${selectedCampaigns.length}_campaigns` : '';
        const viewText = detailedView ? '_detailed_user_wise' : '_summary_branch_wise';
        const filename = `activity_stats${campaignText}${viewText}_${periodText}_${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.xlsx`;
        XLSX.writeFile(wb, filename);
    };

    const requestRrSort = (key) => {
        let direction = 'asc';
        if (rrSortConfig.key === key && rrSortConfig.direction === 'asc') {
            direction = 'desc';
        }
        setRrSortConfig({ key, direction });
    };

    const sortedRrStats = useMemo(() => {
        if (!rrStats) return [];
        if (!rrSortConfig.key) return rrStats;

        return [...rrStats].sort((a, b) => {
            let aValue, bValue;

            if (rrSortConfig.key === 'rr_name') {
                aValue = a.rr_name?.toLowerCase() || '';
                bValue = b.rr_name?.toLowerCase() || '';
            } else if (rrSortConfig.key === 'total_count') {
                aValue = a.total_count || 0;
                bValue = b.total_count || 0;
            } else {
                return 0;
            }

            if (aValue < bValue) return rrSortConfig.direction === 'asc' ? -1 : 1;
            if (aValue > bValue) return rrSortConfig.direction === 'asc' ? 1 : -1;
            return 0;
        });
    }, [rrStats, rrSortConfig]);

    // Backwards compat shim — JSX using getSortedRrData(rrStats) still works
    const getSortedRrData = useCallback(() => sortedRrStats, [sortedRrStats]);

    const exportRrStatsToExcel = () => {
        if (!rrStats || rrStats.length === 0) {
            setError('No rejected reasons data to export');
            return;
        }

        const exportData = [];
        let serialNo = 1;

        if (selectedCampaigns.length > 0) {
            exportData.push({
                'A': 'SELECTED DRIVES REPORT',
                'B': '',
                'C': '',
                'D': '',
                'E': '',
                'F': '',
                'G': '',
                'H': ''
            });
            exportData.push({});

            exportData.push({
                'A': 'Campaign Name',
                'B': 'Service Type',
                'C': '',
                'D': '',
                'E': '',
                'F': '',
                'G': '',
                'H': ''
            });

            allCampaigns
                .filter(c => selectedCampaigns.includes(c.id))
                .forEach((campaign) => {
                    exportData.push({
                        'A': campaign.name,
                        'B': campaign.service,
                        'C': '',
                        'D': '',
                        'E': '',
                        'F': '',
                        'G': '',
                        'H': ''
                    });
                });

            exportData.push({});
            exportData.push({
                'A': `Total Selected Drive
                s: ${selectedCampaigns.length}`,
                'B': `Total Active Drive Assets: ${rrCampaignTotals?.total_customers || 0}`,
                'C': `Total Connected Calls: ${rrCampaignTotals?.total_followups || 0}`,
                'D': '',
                'E': '',
                'F': '',
                'G': '',
                'H': ''
            });

            exportData.push({});
            exportData.push({});
            exportData.push({});
        }

        if (rrDetailedView) {
            exportData.push({
                'A': 'REJECTED REASONS STATISTICS - DETAILED VIEW (USER WISE)',
                'B': '',
                'C': '',
                'D': '',
                'E': '',
                'F': '',
                'G': '',
                'H': ''
            });
            exportData.push({});

            exportData.push({
                'A': 'Sr. No.',
                'B': 'Rejected Reason',
                'C': 'Total Active Drive Assets',
                'D': 'Total Connected Calls',
                'E': 'Total Count',
                'F': 'User Name',
                'G': 'Branch',
                'H': 'Individual Count'
            });

            rrStats.forEach(reason => {
                if (reason.user_breakdown && reason.user_breakdown.length > 0) {
                    reason.user_breakdown.forEach((user) => {
                        const row = {
                            'A': serialNo++,
                            'B': reason.rr_name,
                            'C': rrCampaignTotals?.total_customers || 0,
                            'D': rrCampaignTotals?.total_followups || 0,
                            'E': reason.total_count,
                            'F': user.user_name || 'N/A',
                            'G': user.branch_display || user.branch || 'N/A',
                            'H': user.count
                        };
                        exportData.push(row);
                    });
                } else {
                    const row = {
                        'A': serialNo++,
                        'B': reason.rr_name,
                        'C': rrCampaignTotals?.total_customers || 0,
                        'D': rrCampaignTotals?.total_followups || 0,
                        'E': reason.total_count,
                        'F': 'No data',
                        'G': 'No data',
                        'H': 0
                    };
                    exportData.push(row);
                }
            });
        } else {
            exportData.push({
                'A': 'REJECTED REASONS STATISTICS - SUMMARY VIEW (BRANCH WISE)',
                'B': '',
                'C': '',
                'D': '',
                'E': '',
                'F': '',
                'G': ''
            });
            exportData.push({});

            exportData.push({
                'A': 'Sr. No.',
                'B': 'Rejected Reason',
                'C': 'Total Active Drive Assets',
                'D': 'Total Connected Calls',
                'E': 'Total Count',
                'F': 'Branch',
                'G': 'Branch Count'
            });

            rrStats.forEach(reason => {
                const branchMap = new Map();
                if (reason.user_breakdown && reason.user_breakdown.length > 0) {
                    reason.user_breakdown.forEach(user => {
                        const branchName = user.branch_display || user.branch;
                        if (branchMap.has(branchName)) {
                            branchMap.set(branchName, branchMap.get(branchName) + user.count);
                        } else {
                            branchMap.set(branchName, user.count);
                        }
                    });
                }

                if (branchMap.size > 0) {
                    const mainRow = {
                        'A': serialNo++,
                        'B': reason.rr_name,
                        'C': rrCampaignTotals?.total_customers || 0,
                        'D': rrCampaignTotals?.total_followups || 0,
                        'E': reason.total_count,
                        'F': '---',
                        'G': '---'
                    };
                    exportData.push(mainRow);

                    branchMap.forEach((count, branch) => {
                        const branchRow = {
                            'A': '',
                            'B': '',
                            'C': '',
                            'D': '',
                            'E': '',
                            'F': branch,
                            'G': count
                        };
                        exportData.push(branchRow);
                    });

                    exportData.push({});
                } else {
                    const row = {
                        'A': serialNo++,
                        'B': reason.rr_name,
                        'C': rrCampaignTotals?.total_customers || 0,
                        'D': rrCampaignTotals?.total_followups || 0,
                        'E': reason.total_count,
                        'F': 'No breakdown data',
                        'G': 0
                    };
                    exportData.push(row);
                }
            });
        }

        const ws = XLSX.utils.json_to_sheet(exportData, { skipHeader: true });

        if (rrDetailedView) {
            ws['!cols'] = [
                { wch: 8 }, { wch: 35 }, { wch: 28 }, { wch: 18 }, { wch: 15 }, { wch: 25 }, { wch: 20 }, { wch: 15 }
            ];
        } else {
            ws['!cols'] = [
                { wch: 8 }, { wch: 35 }, { wch: 18 }, { wch: 18 }, { wch: 15 }, { wch: 25 }, { wch: 15 }
            ];
        }

        const range = XLSX.utils.decode_range(ws['!ref'] || 'A1:A1');
        for (let row = range.s.r; row <= range.e.r; row++) {
            const cellAddress = XLSX.utils.encode_cell({ r: row, c: 0 });
            if (ws[cellAddress] && typeof ws[cellAddress].v === 'string') {
                const cellValue = ws[cellAddress].v;
                if (cellValue.includes('SELECTED DRIVES REPORT') ||
                    cellValue.includes('REJECTED REASONS STATISTICS') ||
                    cellValue === 'Drive Name' ||
                    cellValue === 'Sr. No.') {
                    ws[cellAddress].s = {
                        font: { bold: true, sz: 12 }
                    };
                }
            }
        }

        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Rejected Reasons Statistics');

        const periodText = getTimePeriodDisplayText().replace(/ /g, '_');
        const campaignText = selectedCampaigns.length > 0 ? `_${selectedCampaigns.length}_campaigns` : '';
        const viewText = rrDetailedView ? '_detailed_user_wise' : '_summary_branch_wise';
        const filename = `rejected_reasons${campaignText}${viewText}_${periodText}_${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.xlsx`;
        XLSX.writeFile(wb, filename);
    };

    const exportCampaignPerformanceToExcel = () => {
        if (!campaignPerformance || campaignPerformance.length === 0) {
            setError('No drive data to export');
            return;
        }

        // flagOrder moved to FLAG_ORDER constant outside component (use FLAG_ORDER below)
        const flagOrder = FLAG_ORDER;

        const exportData = campaignPerformance.map((campaign, index) => {
            const flagBreakdown = campaign.flag_breakdown || {};

            const row = {
                'Sr. No.': index + 1,
                'Campaign Name': campaign.campaign_name,
                'Created By': campaign.created_by_name || 'N/A',
                'Description': campaign.description || 'No description',
                'Service': campaign.service,
                'Status': campaign.status === 'active' ? 'Active' : 'Inactive',
                'Total Customers': campaign.total_customers || 0,
                'Remaining': campaign.asset_numbers_count || 0,
                'Attended': campaign.attended_customers || 0,
                'WIP': campaign.wip_count || 0,
                'FR': campaign.rescheduled_count || 0,
                'Rejected': campaign.rejected_count || 0,
                'NC': campaign.not_connected_count || 0,
                'Completed': campaign.completed_count || 0,
                'Success %': campaign.success_percentage || 0
            };

            flagOrder.forEach(flag => {
                row[`Flag ${flag}`] = flagBreakdown[flag] || 0;
            });

            return row;
        });

        const ws = XLSX.utils.json_to_sheet(exportData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Drive Performance');

        ws['!cols'] = [
            { wch: 8 }, { wch: 30 }, { wch: 20 }, { wch: 35 }, { wch: 15 }, { wch: 10 }, { wch: 12 }, { wch: 12 }, { wch: 15 }, { wch: 12 }, { wch: 10 }, { wch: 8 }, { wch: 12 }, { wch: 8 },
            ...flagOrder.map(() => ({ wch: 10 }))
        ];

        const periodText = getTimePeriodDisplayText().replace(/ /g, '_');
        const filename = `campaign_performance_${periodText}_${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.xlsx`;
        XLSX.writeFile(wb, filename);
    };

    useEffect(() => {
        if (loadedTabs.activity && userData && (isMasterAdmin || isITAdmin || isBranchAdmin) && !isLoadingData.current) {
            fetchCampaignsList();
        }
    }, [userData, isMasterAdmin, isITAdmin, isBranchAdmin, loadedTabs.activity, fetchCampaignsList]);

    useEffect(() => {
        if (loadedTabs['rejected-reason'] && userData && (isMasterAdmin || isITAdmin || isBranchAdmin) && !isLoadingData.current) {
            fetchCampaignsList();
        }
    }, [userData, isMasterAdmin, isITAdmin, isBranchAdmin, loadedTabs['rejected-reason'], fetchCampaignsList]);

    const fetchAllEmployeesPerformanceWithCampaigns = useCallback(async () => {
        const signal = abortControllerRef.current?.signal;
        try {
            const userPayload = {
                user_id: userData.user_id || userData.id,
                name: userData.name,
                role: userData.role,
                branch: userData.branch
            };
            let employeesUrl = `${API_BASE_URL}/performance/all-employees?time_period=${timePeriod}`;
            let campaignsUrl = `${API_BASE_URL}/performance/campaign-performance?time_period=${timePeriod}`;
            if (timePeriod === 'custom' && customStartDate && customEndDate) {
                const startDateStr = formatDateForAPI(customStartDate);
                const endDateStr = formatDateForAPI(customEndDate);
                employeesUrl += `&start_date=${startDateStr}&end_date=${endDateStr}`;
                campaignsUrl += `&start_date=${startDateStr}&end_date=${endDateStr}`;
            }

            // Fetch employees and campaigns in parallel — only 2 calls total now
            const [employeesResponse, campaignsResponse] = await Promise.all([
                axios.post(employeesUrl, userPayload, { signal }),
                axios.post(campaignsUrl, { user_info: userPayload }, { signal })
            ]);

            if (!isMounted.current) return;

            const campaigns = campaignsResponse.data.campaigns || [];

            // Sort employees by performance score without N×M per-employee campaign calls
            const sortedEmployees = [...employeesResponse.data].sort((a, b) => {
                const totalA = a.total_followups || 0;
                const totalB = b.total_followups || 0;
                const completedA = a.completed_count || 0;
                const completedB = b.completed_count || 0;
                const rateA = totalA > 0 ? (completedA / totalA) * 100 : 0;
                const rateB = totalB > 0 ? (completedB / totalB) * 100 : 0;
                const scoreA = (completedA * 0.6) + (rateA * 0.3) + (totalA * 0.1);
                const scoreB = (completedB * 0.6) + (rateB * 0.3) + (totalB * 0.1);
                return scoreB - scoreA;
            }).map(emp => ({ ...emp, campaign_completed: {} }));

            if (isMounted.current) {
                setAllEmployeesPerformanceWithCampaigns({
                    employees: sortedEmployees,
                    campaigns
                });
                setAllEmployeesPerformance(sortedEmployees);
            }
        } catch (error) {
            if (axios.isCancel(error) || error.name === 'CanceledError') return;
            if (isMounted.current) {
                console.error('Error fetching all employees with drives:', error);
            }
        }
    }, [userData, timePeriod, customStartDate, customEndDate]);

    const fetchBranchPerformance = useCallback(async () => {
        const signal = abortControllerRef.current?.signal;
        try {
            const payload = { user_id: userData.user_id || userData.id, name: userData.name, role: userData.role, branch: userData.branch };
            // Branch-wise Asset Progress + Branch Overview always show ALL-TIME
            // data — the calendar/time filter must not change these boxes.
            const url = `${API_BASE_URL}/performance/branch-performance?time_period=all`;
            const response = await axios.post(url, payload, { signal });
            if (isMounted.current) {
                setBranchPerformance(response.data);
                setBranchPerfFetched(true);
                hasFetchedBranchPerformance.current = true; // ← MARK AS FETCHED
                if (response.data?.length > 0) {
                    ensureBranchSummaries(response.data);
                }
            }
            return response.data;
        } catch (error) {
            if (axios.isCancel(error) || error.name === 'CanceledError') return [];
            if (isMounted.current) {
                console.error('Error fetching branch performance:', error);
                setBranchPerfFetched(true); // fetch finished (failed) — stop showing the loader
            }
            return [];
        }
    }, [userData, ensureBranchSummaries]);

    const fetchBranchPerformanceForBranchAdmin = useCallback(async () => {
        const signal = abortControllerRef.current?.signal; // ADD THIS
        try {
            const payload = {
                user_id: userData.user_id || userData.id,
                name: userData.name,
                role: userData.role,
                branch: userData.branch
            };
            // Branch-wise Asset Progress + Branch Overview always show ALL-TIME
            // data — the calendar/time filter must not change these boxes.
            const url = `${API_BASE_URL}/performance/branch-performance?time_period=all`;
            const response = await axios.post(url, payload, { signal }); // ADD signal
            const filteredData = response.data.filter(branch => branch.branch === userData.branch);
            if (isMounted.current) {
                setBranchPerformance(filteredData);
                setBranchPerfFetched(true);
            }
        } catch (error) {
            if (axios.isCancel(error) || error.name === 'CanceledError') return; // ADD THIS
            if (isMounted.current) {
                console.error('Error fetching branch performance:', error);
                setBranchPerfFetched(true); // fetch finished (failed) — stop showing the loader
            }
        }
    }, [userData]);

    const fetchAllBranches = useCallback(async () => {
        const signal = abortControllerRef.current?.signal;
        try {
            const payload = { user_id: userData.user_id || userData.id, name: userData.name, role: userData.role, branch: userData.branch };
            const response = await axios.post(`${API_BASE_URL}/performance/branches`, payload, { signal });
            if (isMounted.current) {
                setBranches(response.data.branches || []);
                hasFetchedAllBranches.current = true; // ← MARK AS FETCHED
            }
        } catch (error) {
            if (axios.isCancel(error) || error.name === 'CanceledError') return;
            if (isMounted.current) console.error('Error fetching branches:', error);
        }
    }, [userData]);

    const loadEmployeeProgressTabData = useCallback(async () => {
        if (isLoadingData.current) return;
        isLoadingData.current = true;

        try {
            if (isMasterAdmin || isITAdmin) {
                // Only fetch branches if not already fetched
                if (!hasFetchedAllBranches.current) {
                    await fetchAllBranches();
                }
                // Don't auto-fetch employees on tab open — wait for user selection
            } else if (isBranchAdmin) {
                await fetchBranchEmployeesForBranchAdmin();
            }
        } catch (error) {
            console.error('Error loading employee progress tab data:', error);
        } finally {
            isLoadingData.current = false;
        }
    }, [isMasterAdmin, isITAdmin, isBranchAdmin, fetchAllBranches]);

    const fetchBranchEmployeesForBranchAdmin = useCallback(async () => {
        const signal = abortControllerRef.current?.signal;
        try {
            if (isMounted.current) setLoading(true);
            const payload = {
                branch_code: userData.branch,
                user_info: { user_id: userData.user_id || userData.id, name: userData.name, role: userData.role, branch: userData.branch }
            };
            let url = `${API_BASE_URL}/performance/branch-employees?time_period=${timePeriod}`;
            if (timePeriod === 'custom' && customStartDate && customEndDate) {
                url += `&start_date=${formatDateForAPI(customStartDate)}&end_date=${formatDateForAPI(customEndDate)}`;
            }
            const response = await axios.post(url, payload, { signal });
            if (isMounted.current) {
                setBranchEmployees(response.data);
                setSelectedBranch(userData.branch);
                const employeesWithBranch = response.data.map(emp => ({ ...emp, campaign_completed: {} }));
                setAllEmployeesPerformanceWithCampaigns({ employees: employeesWithBranch, campaigns: [] });
                setAllEmployeesPerformance(employeesWithBranch);
            }
        } catch (error) {
            if (axios.isCancel(error) || error.name === 'CanceledError') return;
            if (isMounted.current) {
                console.error('Error fetching branch employees:', error);
                setError(error.response?.data?.detail || error.message);
            }
        } finally {
            if (isMounted.current) setLoading(false);
        }
    }, [userData, timePeriod, customStartDate, customEndDate]);

    const fetchCampaignPerformance = useCallback(async () => {

        const signal = abortControllerRef.current?.signal;
        // Warm-cache-first paint: show last known campaigns instantly (only if state
        // is still empty); the fetch below always runs and overwrites with fresh data.
        const campaignWarmKey = warmKey('dash-campaign-performance', {
            userId: userData.user_id || userData.id,
            role: userData.role || '',
            branch: userData.branch || '',
            timePeriod,
            start: timePeriod === 'custom' && customStartDate ? formatDateForAPI(customStartDate) : null,
            end: timePeriod === 'custom' && customEndDate ? formatDateForAPI(customEndDate) : null
        });
        const warmCampaigns = readWarmCache(campaignWarmKey);
        if (warmCampaigns && isMounted.current) {
            setCampaignPerformance(prev => (prev && prev.length > 0 ? prev : warmCampaigns));
        }
        try {
            if (isMounted.current) setCampaignLoading(true);
            const payload = { user_info: { user_id: userData.user_id || userData.id, name: userData.name, role: userData.role, branch: userData.branch } };
            let url = `${API_BASE_URL}/performance/campaign-performance?time_period=${timePeriod}`;
            if (timePeriod === 'custom' && customStartDate && customEndDate) {
                url += `&start_date=${formatDateForAPI(customStartDate)}&end_date=${formatDateForAPI(customEndDate)}`;
            }
            const response = await axios.post(url, payload, { signal });
            if (isMounted.current) setCampaignPerformance(response.data.campaigns || []);
            writeWarmCache(campaignWarmKey, response.data.campaigns || []);
        } catch (error) {
            if (axios.isCancel(error) || error.name === 'CanceledError') return;
            if (isMounted.current) console.error('Error fetching drive performance:', error);
        } finally {
            if (isMounted.current) setCampaignLoading(false);
        }
    }, [userData, timePeriod, customStartDate, customEndDate]);

    const fetchMultipleBranchEmployees = useCallback(async (branchCodes) => {
        // Cancel any pending debounce
        if (debounceTimeoutRef.current) clearTimeout(debounceTimeoutRef.current);

        const execute = async () => {
            const signal = abortControllerRef.current?.signal;
            if (!branchCodes || branchCodes.length === 0) {
                if (isMounted.current) { setBranchEmployees([]); setBranchEmployeesLoading(false); }
                return;
            }

            // Tracks if any request was cancelled (e.g. user switched tabs mid-load)
            let wasCancelled = false;

            try {
                if (isMounted.current) { setBranchEmployeesLoading(true); setError(null); setBranchEmployees([]); }
                const fetchPromises = branchCodes.map(async (branchCode) => {
                    const payload = {
                        branch_code: branchCode,
                        user_info: { user_id: userData.user_id || userData.id, name: userData.name, role: userData.role, branch: userData.branch }
                    };
                    let url = `${API_BASE_URL}/performance/branch-employees?time_period=${timePeriod}`;
                    if (timePeriod === 'custom' && customStartDate && customEndDate) {
                        url += `&start_date=${formatDateForAPI(customStartDate)}&end_date=${formatDateForAPI(customEndDate)}`;
                    }
                    try {
                        const response = await axios.post(url, payload, { signal });
                        return response.data.map(emp => ({ ...emp, branch: branchCode }));
                    } catch (err) {
                        // Mark cancellation so an aborted fetch is never read as "no data"
                        if (axios.isCancel(err) || err.name === 'CanceledError') { wasCancelled = true; return []; }
                        console.error(`Error fetching branch ${branchCode}:`, err);
                        return [];
                    }
                });

                // Fetch ALL branches in parallel
                const results = await Promise.all(fetchPromises);

                // 🔑 BUG FIX: if this fetch was aborted (tab switch), stop here BEFORE
                // touching state. Otherwise every cancelled request returns [] and the
                // empty result is mistaken for "no employees found", which sets the
                // global error -> the whole page is replaced by the full-screen error box.
                if (signal?.aborted || wasCancelled) return;

                const allEmployees = results.flat();
                const sorted = allEmployees.sort((a, b) => {
                    const rateA = a.total_followups > 0 ? (a.completed_count / a.total_followups) : 0;
                    const rateB = b.total_followups > 0 ? (b.completed_count / b.total_followups) : 0;
                    return rateB - rateA;
                });

                if (isMounted.current) {
                    // Just set the data. Do NOT call setError on an empty result — the
                    // table already shows a graceful "No employees found for selected
                    // branches" empty state when branchEmployees is [].
                    setBranchEmployees(sorted);
                }
            } catch (error) {
                if (axios.isCancel(error) || error.name === 'CanceledError') return;
                if (isMounted.current) {
                    console.error('Error fetching multiple branch employees:', error);
                    setError(error.response?.data?.detail || error.message);
                }
            } finally {
                // Only clear the spinner if THIS fetch wasn't aborted — a newer fetch
                // now owns the loading state.
                if (isMounted.current && !signal?.aborted && !wasCancelled) setBranchEmployeesLoading(false);
            }
        };

        // Debounce only rapid clicks; execute immediately when no pending fetch
        debounceTimeoutRef.current = setTimeout(execute, 50);
    }, [userData, timePeriod, customStartDate, customEndDate]);

    const loadBranchOverviewTabData = useCallback(async () => {
        if (isLoadingData.current) return;
        isLoadingData.current = true;

        try {
            if (isMasterAdmin || isITAdmin) {
                // Only fetch what hasn't been fetched yet during KALA Performance tab load
                const promises = [];
                if (!hasFetchedBranchPerformance.current) {
                    promises.push(fetchBranchPerformance());
                }
                if (!hasFetchedAllBranches.current) {
                    promises.push(fetchAllBranches());
                }
                if (promises.length > 0) {
                    await Promise.all(promises); // fetch remaining in parallel
                }
            } else if (isBranchAdmin) {
                await fetchBranchPerformanceForBranchAdmin();
            }
        } catch (error) {
            console.error('Error loading branch overview tab data:', error);
        } finally {
            isLoadingData.current = false;
        }
    }, [isMasterAdmin, isITAdmin, isBranchAdmin, fetchBranchPerformance, fetchAllBranches, fetchBranchPerformanceForBranchAdmin]);

    // Refetch activity and RR stats when selectedCampaigns changes
    useEffect(() => {
        if (loadedTabs.activity && (isMasterAdmin || isITAdmin || isBranchAdmin) && activeTab === 'activity' && !isLoadingData.current) {
            fetchActivityStats();
        }
    }, [selectedCampaigns, loadedTabs.activity, isMasterAdmin, isITAdmin, isBranchAdmin, activeTab, fetchActivityStats]);

    useEffect(() => {
        if (loadedTabs['rejected-reason'] && (isMasterAdmin || isITAdmin || isBranchAdmin) && activeTab === 'rejected-reason' && !isLoadingData.current) {
            fetchRrStats();
        }
    }, [selectedCampaigns, loadedTabs['rejected-reason'], isMasterAdmin, isITAdmin, isBranchAdmin, activeTab, fetchRrStats]);

    useEffect(() => {
        if (loadedTabs['branch-report'] && userData && activeTab === 'branch-report' && !isLoadingData.current) {
            if (isMasterAdmin || isITAdmin) {
                if (selectedBranch && selectedBranch.split(',').length > 0) {
                    const branchCodes = selectedBranch.split(',');
                    fetchMultipleBranchEmployees(branchCodes);
                }
            } else if (isBranchAdmin) {
                fetchBranchEmployeesForBranchAdmin();
            }
        }
    }, [timePeriod, customStartDate, customEndDate, userData, activeTab, isMasterAdmin, isITAdmin, isBranchAdmin, loadedTabs['branch-report']]);

    const loadOverallTabData = useCallback(async () => {
        // Prevent multiple simultaneous calls
        if (isLoadingData.current) {
            return;
        }

        isLoadingData.current = true;
        setIsFilterLoading(true);
        setError(null);

        try {
            if (isMasterAdmin || isITAdmin) {
                // Fire summary stats, campaign performance and branch performance in
                // PARALLEL — each loader is self-contained (own try/catch, own setState),
                // so cards/graphs still paint independently as each response lands,
                // just without waiting for the previous request to finish first.
                await Promise.all([
                    fetchSummaryStats(),
                    fetchCampaignPerformance(),
                    fetchBranchPerformance()
                ]);

                // Load remaining data in background (don't block UI)
                Promise.all([
                    fetchAllBranches(),
                    fetchAllEmployeesPerformanceWithCampaigns(),
                ]).catch(console.error);

                isDataLoaded.current = true;
            } else if (isBranchAdmin) {
                await Promise.all([
                    fetchBranchPerformanceForBranchAdmin(),
                    fetchBranchEmployeesForBranchAdmin(),
                    fetchCampaignPerformance()
                ]);
                isDataLoaded.current = true;
            }
        } catch (error) {
            console.error('Error loading overall tab data:', error);
            setError('Failed to load dashboard data. Please try again.');
        } finally {
            setIsFilterLoading(false);
            setLoading(false);
            isLoadingData.current = false;
        }
    }, [isMasterAdmin, isITAdmin, isBranchAdmin, fetchSummaryStats, fetchCampaignPerformance, fetchBranchPerformance, fetchAllBranches, fetchAllEmployeesPerformanceWithCampaigns, fetchBranchPerformanceForBranchAdmin, fetchBranchEmployeesForBranchAdmin]);

    const selectedEmployeesTotals = useMemo(() => {
        const employees = sortedBranchEmployees;

        if (!employees.length) {
            return {
                totalEmployees: 0,
                totalFollowups: 0,
                totalCompleted: 0,
                totalWip: 0,
                totalRescheduled: 0,
                totalRejected: 0,
                totalNotConnected: 0,
                totalQuotationValue: 0
            };
        }

        // Single loop instead of 6 reduce calls
        let totalFollowups = 0, totalCompleted = 0, totalWip = 0;
        let totalRescheduled = 0, totalRejected = 0, totalQuotationValue = 0, totalNotConnected = 0;
        for (const emp of employees) {
            totalFollowups += emp.total_followups || 0;
            totalCompleted += emp.completed_count || 0;
            totalWip += emp.wip_count || 0;
            totalRescheduled += emp.rescheduled_count || 0;
            totalRejected += emp.rejected_count || 0;
            totalNotConnected += emp.not_connected_count || 0;
            totalQuotationValue += emp.total_quotation_value || 0;
        }

        return {
            totalEmployees: employees.length,
            totalFollowups, totalCompleted, totalWip, totalRescheduled, totalRejected, totalNotConnected, totalQuotationValue
        };
    }, [sortedBranchEmployees]);

    // Backwards compat shim
    const calculateSelectedEmployeesTotals = useCallback(() => selectedEmployeesTotals, [selectedEmployeesTotals]);

    const exportMultipleBranchEmployees = useCallback(async (branchCodes) => {
        try {
            setExportLoading(true);

            const allEmployees = [];

            for (const branchCode of branchCodes) {
                const payload = {
                    branch_code: branchCode,
                    user_info: {
                        user_id: userData.user_id || userData.id,
                        name: userData.name,
                        role: userData.role,
                        branch: userData.branch
                    }
                };

                let url = `${API_BASE_URL}/performance/branch-employees?time_period=${timePeriod}`;

                if (timePeriod === 'custom' && customStartDate && customEndDate) {
                    url += `&start_date=${formatDateForAPI(customStartDate)}&end_date=${formatDateForAPI(customEndDate)}`;
                }

                try {
                    const response = await axios.post(url, payload);

                    const employeesWithBranch = response.data.map(emp => ({
                        ...emp,
                        branch: branchCode
                    }));

                    allEmployees.push(...employeesWithBranch);
                } catch (error) {
                    console.error(`Error fetching branch ${branchCode} for export:`, error);
                }
            }

            if (allEmployees.length === 0) {
                setError('No data available for selected branches');
                setExportLoading(false);
                return;
            }

            const sortedEmployees = [...allEmployees].sort((a, b) => {
                const rateA = a.total_followups > 0 ? (a.completed_count / a.total_followups) : 0;
                const rateB = b.total_followups > 0 ? (b.completed_count / b.total_followups) : 0;
                return rateB - rateA;
            });

            const exportData = sortedEmployees.map((emp, idx) => {
                const total = emp.total_followups || 0;
                const completed = emp.completed_count || 0;
                const completionRate = total > 0 ? ((completed / total) * 100).toFixed(1) : 0;

                return {
                    'Sr. No.': idx + 1,
                    'Employee Name': emp.user_name,
                    'Branch': getBranchDisplayName(emp.branch),
                    'Total all Calls and follow-ups': total,
                    'Work in Progress': emp.wip_count || 0,
                    'Rescheduled': emp.rescheduled_count || 0,
                    'Rejected': emp.rejected_count || 0,
                    'Completed': completed,
                };
            });

            const totals = {
                totalFollowups: exportData.reduce((sum, row) => sum + row['Total all Calls and follow-ups'], 0),
                totalCompleted: exportData.reduce((sum, row) => sum + row['Completed'], 0),
                totalWip: exportData.reduce((sum, row) => sum + row['Work in Progress'], 0),
                totalRescheduled: exportData.reduce((sum, row) => sum + row['Rescheduled'], 0),
                totalRejected: exportData.reduce((sum, row) => sum + row['Rejected'], 0),
            };

            exportData.push({
                'Sr. No.': 'TOTAL',
                'Employee Name': `${exportData.length} Employees`,
                'Branch': '',
                'Total all Calls and follow-ups': totals.totalFollowups,
                'Work in Progress': totals.totalWip,
                'Rescheduled': totals.totalRescheduled,
                'Rejected': totals.totalRejected,
                'Completed': totals.totalCompleted,
            });

            const ws = XLSX.utils.json_to_sheet(exportData);
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, 'Branch Employees Report');

            const range = XLSX.utils.decode_range(ws['!ref'] || 'A1:A1');
            for (let row = range.s.r; row <= range.e.r; row++) {
                const cellAddress = XLSX.utils.encode_cell({ r: row, c: 0 });
                if (ws[cellAddress] && ws[cellAddress].v === 'TOTAL') {
                    for (let col = 0; col <= 8; col++) {
                        const totalCellAddress = XLSX.utils.encode_cell({ r: row, c: col });
                        if (ws[totalCellAddress]) {
                            ws[totalCellAddress].s = {
                                font: { bold: true, sz: 11 },
                                fill: { fgColor: { rgb: "E5E7EB" } }
                            };
                        }
                    }
                }
            }

            ws['!cols'] = [
                { wch: 8 }, { wch: 25 }, { wch: 25 }, { wch: 18 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 25 }
            ];

            const periodText = {
                'all': 'all_time',
                'month': 'last_30_days',
                '3months': 'last_3_months',
                '6months': 'last_6_months',
                'year': 'last_12_months',
                'custom': 'custom'
            }[timePeriod] || 'all_time';

            const branchText = branchCodes.join('_');
            const filename = `branches_${branchText}_${periodText}_${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.xlsx`;

            XLSX.writeFile(wb, filename);
        } catch (error) {
            console.error('Error exporting multiple branch employees:', error);
            setError(error.response?.data?.detail || error.message);
        } finally {
            setExportLoading(false);
        }
    }, [userData, timePeriod, customStartDate, customEndDate]);

    const exportBranchEmployeesTable = useCallback(() => {
        const employees = getSortedBranchEmployeesList();

        if (!employees || employees.length === 0) {
            setError('No employees data to export');
            return;
        }

        const exportData = employees.map((emp, idx) => {
            const total = emp.total_followups || 0;
            const completed = emp.completed_count || 0;

            return {
                'Sr. No.': idx + 1,
                'Employee Name': emp.user_name,
                'Branch': getBranchDisplayName(emp.branch),
                'Total all Calls and follow-ups': total,
                'Work in Progress': emp.wip_count || 0,
                'Rescheduled': emp.rescheduled_count || 0,
                'Rejected': emp.rejected_count || 0,
                'Not Connected': emp.not_connected_count || 0,
                'Completed': completed,
            };
        });

        // Add total row
        const totals = calculateSelectedEmployeesTotals();
        exportData.push({
            'Sr. No.': 'TOTAL',
            'Employee Name': `${totals.totalEmployees} Employees`,
            'Branch': '',
            'Total all Calls and follow-ups': totals.totalFollowups,
            'Work in Progress': totals.totalWip,
            'Rescheduled': totals.totalRescheduled,
            'Rejected': totals.totalRejected,
            'Not Connected': totals.totalNotConnected,
            'Completed': totals.totalCompleted,
        });

        const ws = XLSX.utils.json_to_sheet(exportData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Branch Employees Report');

        // Style the TOTAL row
        const range = XLSX.utils.decode_range(ws['!ref'] || 'A1:A1');
        for (let row = range.s.r; row <= range.e.r; row++) {
            const cellAddress = XLSX.utils.encode_cell({ r: row, c: 0 });
            if (ws[cellAddress] && ws[cellAddress].v === 'TOTAL') {
                for (let col = 0; col <= 8; col++) {
                    const totalCellAddress = XLSX.utils.encode_cell({ r: row, c: col });
                    if (ws[totalCellAddress]) {
                        ws[totalCellAddress].s = {
                            font: { bold: true, sz: 11 },
                            fill: { fgColor: { rgb: "E5E7EB" } }
                        };
                    }
                }
            }
        }

        ws['!cols'] = [
            { wch: 8 }, { wch: 25 }, { wch: 25 }, { wch: 22 },
            { wch: 18 }, { wch: 14 }, { wch: 12 }, { wch: 14 }, { wch: 14 }
        ];

        const periodText = {
            'all': 'all_time',
            'month': 'last_30_days',
            '3months': 'last_3_months',
            '6months': 'last_6_months',
            'year': 'last_12_months',
            'custom': 'custom'
        }[timePeriod] || 'all_time';

        const filename = `branch_employees_${periodText}_${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.xlsx`;
        XLSX.writeFile(wb, filename);
    }, [branchEmployees, branchEmployeeSortState, timePeriod]);

    const handleTimePeriodChange = (period) => {
        if (period === 'custom') {
            setShowCustomDatePicker(true);
        } else {
            setTimePeriod(period);
            setCustomStartDate(null);
            setCustomEndDate(null);
            setShowCustomDatePicker(false);
            // Reset data loaded flag when period changes
            isDataLoaded.current = false;
        }
    };

    const handleCustomDateApply = () => {
        if (customStartDate && customEndDate) {
            if (customStartDate > customEndDate) {
                setError('Start date cannot be after end date');
                return;
            }
            if (customEndDate > new Date()) {
                setError('End date cannot be in the future');
                return;
            }
            setTimePeriod('custom');
            setShowCustomDatePicker(false);
            // Reset data loaded flag when custom dates are applied
            isDataLoaded.current = false;
        } else {
            setError('Please select both start and end dates');
        }
    };

    const overallStats = useMemo(() => {
        if (!allEmployeesPerformance.length) return null;

        // Single loop instead of 7 separate reduce calls
        let total = 0, completed = 0, wip = 0, rejected = 0, pending = 0, quotationValue = 0, quotationsSent = 0;
        for (const emp of allEmployeesPerformance) {
            total += emp.total_followups || 0;
            completed += emp.completed_count || 0;
            wip += emp.wip_count || 0;
            rejected += emp.rejected_count || 0;
            pending += emp.pending_count || 0;
            quotationValue += emp.total_quotation_value || 0;
            quotationsSent += emp.quotations_sent_count || 0;
        }

        return {
            total_followups: total,
            completed_count: completed,
            wip_count: wip,
            rejected_count: rejected,
            pending_count: pending,
            total_quotation_value: quotationValue,
            quotations_sent_count: quotationsSent,
            total_assets: 0,
            attended_assets: 0,
            remaining_assets: 0,
            completed_assets: 0,
            wip_assets: 0,
            rejected_assets: 0,
            rescheduled_assets: 0,
            total_customers: 0,
            attended_customers: 0,
            remaining_customers: 0,
            completed_customers: 0,
            wip_customers: 0,
            rejected_customers: 0,
            rescheduled_customers: 0
        };
    }, [allEmployeesPerformance]);

    // Backwards compat shim
    const getOverallStats = useCallback(() => overallStats, [overallStats]);

    // Format a Date as DD/MM/YYYY (zero-padded) so the calendar filter always
    // shows dates in Indian day/month/year order regardless of the browser locale.
    const formatDDMMYYYY = (date) => {
        if (!(date instanceof Date) || isNaN(date)) return '';
        const dd = String(date.getDate()).padStart(2, '0');
        const mm = String(date.getMonth() + 1).padStart(2, '0');
        const yyyy = date.getFullYear();
        return `${dd}/${mm}/${yyyy}`;
    };

    const getTimePeriodDisplayText = () => {
        switch (timePeriod) {
            case 'month': return 'Last 30 Days';
            case '3months': return 'Last 3 Months';
            case '6months': return 'Last 6 Months';
            case 'year': return 'Last 12 Months';
            case 'custom':
                if (customStartDate && customEndDate) {
                    return `${formatDDMMYYYY(customStartDate)} - ${formatDDMMYYYY(customEndDate)}`;
                }
                return 'Custom Range';
            default: return 'Calendar';
        }
    };

    const getDateRangeText = () => {
        if (timePeriod === 'custom' && customStartDate && customEndDate) {
            return `${formatDDMMYYYY(customStartDate)} to ${formatDDMMYYYY(customEndDate)}`;
        }

        const now = new Date();
        const endDate = formatDDMMYYYY(now);
        let startDate;

        switch (timePeriod) {
            case 'month':
                startDate = formatDDMMYYYY(new Date(now.setMonth(now.getMonth() - 1)));
                return `${startDate} - ${endDate}`;
            case '3months':
                startDate = formatDDMMYYYY(new Date(now.setMonth(now.getMonth() - 3)));
                return `${startDate} - ${endDate}`;
            case '6months':
                startDate = formatDDMMYYYY(new Date(now.setMonth(now.getMonth() - 6)));
                return `${startDate} - ${endDate}`;
            case 'year':
                startDate = formatDDMMYYYY(new Date(now.setFullYear(now.getFullYear() - 1)));
                return `${startDate} - ${endDate}`;
            default:
                return 'Calendar';
        }
    };

    const hasDataForPeriod = () => {
        if (timePeriod === 'all') return true;

        if (isMasterAdmin || isITAdmin) {
            return allEmployeesPerformance.some(emp =>
                (emp.total_followups || 0) > 0 ||
                (emp.completed_count || 0) > 0
            );
        } else {
            return true;
        }
    };

    const chartOptions = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: {
                position: 'top',
                labels: {
                    usePointStyle: true,
                    boxWidth: 8,
                    font: { size: 12 }
                }
            },
            tooltip: {
                backgroundColor: 'rgba(255, 255, 255, 0.95)',
                titleColor: '#2D4059',
                bodyColor: '#4A5568',
                borderColor: '#E2E8F0',
                borderWidth: 1,
                padding: 10,
                boxPadding: 5,
                usePointStyle: true,
                titleFont: { size: 13 },
                bodyFont: { size: 12 }
            }
        },
        scales: {
            x: {
                grid: { display: false },
                ticks: { font: { size: 11 } }
            },
            y: {
                beginAtZero: true,
                grid: { color: '#EDF2F7' },
                ticks: { font: { size: 11 } }
            }
        }
    };

    // Only gate the very first frame (userData is read synchronously from
    // sessionStorage). Once it's set, the dashboard shell renders immediately
    // and each section shows its own skeleton until its data lands.
    if (!userData && !error) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <div className="flex flex-col items-center">
                    <div className="w-16 h-16 border-4 border-t-4 border-t-[#2f3192] border-gray-200 rounded-full animate-spin"></div>
                    <p className="mt-4 text-black">Loading dashboard...</p>
                </div>
            </div>
        );
    }

    if (error && !loading) {
        return (
            <div className="flex items-center justify-center min-h-screen p-4">
                <div className="bg-red-50 border border-red-200 rounded-xl p-8 max-w-lg w-full text-center">
                    <svg className="w-16 h-16 text-red-400 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <h3 className="text-xl font-semibold text-red-800 mb-2">Error</h3>
                    <p className="text-red-600">{error}</p>
                    <button
                        onClick={() => window.location.reload()}
                        className="mt-4 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
                    >
                        Retry
                    </button>
                </div>
            </div>
        );
    }

    if (!userData) {
        return (
            <div className="flex items-center justify-center min-h-screen p-4">
                <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-8 max-w-lg w-full text-center">
                    <svg className="w-16 h-16 text-yellow-400 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                    <h3 className="text-xl font-semibold text-yellow-800 mb-2">Not Logged In</h3>
                    <p className="text-yellow-600">Please login to view dashboard</p>
                </div>
            </div>
        );
    }

    const displayStats = (isMasterAdmin || isITAdmin) ? getOverallStats() : null;
    const hasData = hasDataForPeriod();

    const getRoleDisplayName = () => {
        if (isMasterAdmin) return 'Master Admin';
        if (isITAdmin) return 'IT Admin';
        if (isBranchAdmin) return 'Branch Admin';
        return 'Employee';
    };

    const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
};

const getPerformanceTitle = () => {
        if (isMasterAdmin || isITAdmin) {
            return 'KALA Performance';
        }
        if (isBranchAdmin) {
            return 'My Performance';
        }
        return 'My Performance';
    };

    // Skeleton components — each mirrors the real layout of the box it stands in
    // for, using a shimmer sweep (.dash-shimmer) instead of spinners so the page
    // structure is visible immediately and content fades in box-by-box.

    // Skeleton for the 3 summary cards
    const SummaryCardsSkeleton = () => (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-3">
            {[0, 1, 2].map((i) => (
                <div key={i} className="bg-gray-100 rounded-2xl shadow-sm border border-gray-200 p-3 dash-fade-in" style={{ animationDelay: `${i * 80}ms` }}>
                    <div className="h-3 w-36 rounded dash-shimmer mb-3" style={{ '--shimmer-delay': `${i * 0.12}s` }}></div>
                    <div className="flex items-center justify-between">
                        <div className="w-[30%] flex justify-center">
                            <div className="h-7 w-14 rounded-lg dash-shimmer" style={{ '--shimmer-delay': `${i * 0.12}s` }}></div>
                        </div>
                        <div className="w-px h-12 bg-gradient-to-b from-transparent via-gray-300 to-transparent"></div>
                        {i === 2 ? (
                            /* 3rd card mirrors the real status grid (WIP / FR / R / NC / C) */
                            <div className="w-[60%] grid grid-cols-3 gap-x-2 gap-y-1.5 max-sm:grid-cols-2">
                                {[0, 1, 2, 3, 4].map((j) => (
                                    <div key={j} className="flex justify-between items-center">
                                        <div className="h-3 w-7 rounded dash-shimmer" style={{ '--shimmer-delay': `${(i * 0.12) + (j * 0.05)}s` }}></div>
                                        <div className="h-4 w-6 rounded dash-shimmer" style={{ '--shimmer-delay': `${(i * 0.12) + (j * 0.05)}s` }}></div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="w-[60%] space-y-2">
                                <div className="flex justify-between items-center">
                                    <div className="h-3 w-16 rounded dash-shimmer" style={{ '--shimmer-delay': `${i * 0.12}s` }}></div>
                                    <div className="h-4 w-10 rounded dash-shimmer" style={{ '--shimmer-delay': `${i * 0.12}s` }}></div>
                                </div>
                                <div className="flex justify-between items-center">
                                    <div className="h-3 w-16 rounded dash-shimmer" style={{ '--shimmer-delay': `${i * 0.12}s` }}></div>
                                    <div className="h-4 w-10 rounded dash-shimmer" style={{ '--shimmer-delay': `${i * 0.12}s` }}></div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            ))}
        </div>
    );

    // Skeleton for the two graphs (drive breakdown bar chart + status pie chart)
    const GraphsSkeleton = () => (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 mb-3">
            {/* Drive-wise Customer Breakdown skeleton — fake vertical bars */}
            <div className="lg:col-span-8 bg-white rounded-xl shadow-sm p-3 border border-gray-100 max-lg:w-full max-lg:min-w-0 dash-fade-in">
                <div className="h-5 w-64 rounded dash-shimmer mb-3"></div>
                <div className="flex justify-center gap-4 mb-3">
                    {[0, 1, 2].map((i) => (
                        <div key={i} className="h-3 w-20 rounded-full dash-shimmer" style={{ '--shimmer-delay': `${i * 0.1}s` }}></div>
                    ))}
                </div>
                <div className="h-[370px] flex items-end justify-around gap-2 px-4 pb-1 border-b border-gray-200">
                    {[55, 82, 40, 95, 65, 30, 74, 50, 88, 45].map((h, i) => (
                        <div
                            key={i}
                            className="flex-1 max-w-[48px] rounded-t-md dash-shimmer"
                            style={{ height: `${h}%`, '--shimmer-delay': `${(i % 5) * 0.12}s` }}
                        ></div>
                    ))}
                </div>
            </div>

            {/* Asset Status Distribution skeleton — fake donut + legend */}
            <div className="lg:col-span-4 bg-white rounded-xl shadow-sm p-3 border border-gray-100 flex flex-col max-lg:w-full max-lg:min-w-0 dash-fade-in" style={{ animationDelay: '80ms' }}>
                <div className="h-5 w-48 rounded dash-shimmer mb-3"></div>
                <div className="flex-1 flex flex-col items-center justify-center gap-5 min-h-[350px]">
                    <div className="relative w-44 h-44 rounded-full dash-shimmer">
                        <div className="absolute inset-[32%] bg-white rounded-full"></div>
                    </div>
                    <div className="grid grid-cols-2 gap-x-6 gap-y-2">
                        {[0, 1, 2, 3].map((i) => (
                            <div key={i} className="flex items-center gap-2">
                                <div className="w-3 h-3 rounded-sm dash-shimmer" style={{ '--shimmer-delay': `${i * 0.1}s` }}></div>
                                <div className="h-3 w-14 rounded dash-shimmer" style={{ '--shimmer-delay': `${i * 0.1}s` }}></div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );

    // Skeleton for Branch-wise Asset Progress — fake horizontal bar rows
    const BranchProgressSkeleton = () => (
        <div className="w-full mb-2 dash-fade-in" style={{ animationDelay: '160ms' }}>
            <div className="bg-white rounded-xl shadow-sm p-3 border border-gray-100">
                <div className="mb-3 flex items-center justify-between">
                    <div className="h-5 w-56 rounded dash-shimmer"></div>
                    <div className="h-4 w-32 rounded dash-shimmer"></div>
                </div>
                <div className="h-3 w-44 rounded dash-shimmer mb-4"></div>
                <div className="space-y-4 py-2">
                    {[92, 78, 85, 62, 71, 52, 66, 44, 57, 38, 48, 30].map((w, i) => (
                        <div key={i} className="flex items-center gap-3">
                            <div className="h-3 w-24 rounded dash-shimmer shrink-0" style={{ '--shimmer-delay': `${(i % 6) * 0.1}s` }}></div>
                            <div className="h-4 rounded-r-md dash-shimmer" style={{ width: `${w}%`, '--shimmer-delay': `${(i % 6) * 0.1}s` }}></div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );

    // Skeleton for one branch's combined 4-section stats box (Branch tab)
    const BranchStatsSkeleton = () => (
        <div className="px-3 py-2 bg-gradient-to-r from-gray-50 to-white">
            <div className="bg-gray-100 rounded-2xl shadow-sm border border-gray-200 flex flex-col md:flex-row divide-y md:divide-y-0 md:divide-x divide-gray-300">
                {[0, 1, 2, 3].map((i) => (
                    <div key={i} className={`${i === 2 ? 'flex-[1.4]' : 'flex-1'} p-3`}>
                        <div className="h-3 w-32 rounded dash-shimmer mb-3" style={{ '--shimmer-delay': `${i * 0.12}s` }}></div>
                        <div className="flex items-center justify-between">
                            <div className="w-[30%] flex justify-center">
                                <div className="h-8 w-12 rounded-lg dash-shimmer" style={{ '--shimmer-delay': `${i * 0.12}s` }}></div>
                            </div>
                            <div className="w-px h-12 bg-gradient-to-b from-transparent via-gray-300 to-transparent"></div>
                            <div className="w-[60%] space-y-2">
                                <div className="flex justify-between items-center">
                                    <div className="h-3 w-14 rounded dash-shimmer" style={{ '--shimmer-delay': `${i * 0.12}s` }}></div>
                                    <div className="h-4 w-10 rounded dash-shimmer" style={{ '--shimmer-delay': `${i * 0.12}s` }}></div>
                                </div>
                                <div className="flex justify-between items-center">
                                    <div className="h-3 w-14 rounded dash-shimmer" style={{ '--shimmer-delay': `${i * 0.12}s` }}></div>
                                    <div className="h-4 w-10 rounded dash-shimmer" style={{ '--shimmer-delay': `${i * 0.12}s` }}></div>
                                </div>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );

    // Skeleton for the whole Branch Overview list (before the branch list arrives)
    const BranchOverviewSkeleton = () => (
        <>
            {[0, 1, 2].map((i) => (
                <div key={i} className="dash-fade-in" style={{ animationDelay: `${i * 90}ms` }}>
                    <div className="px-3 py-2 border-b border-gray-100">
                        <div className="flex items-center justify-between gap-3">
                            <div>
                                <div className="h-4 w-44 rounded dash-shimmer mb-2" style={{ '--shimmer-delay': `${i * 0.1}s` }}></div>
                                <div className="h-3 w-24 rounded dash-shimmer" style={{ '--shimmer-delay': `${i * 0.1}s` }}></div>
                            </div>
                            <div className="flex items-center gap-4">
                                <div className="h-7 w-44 rounded-lg dash-shimmer max-sm:hidden" style={{ '--shimmer-delay': `${i * 0.1}s` }}></div>
                                <div className="flex flex-col items-center gap-1">
                                    <div className="h-3 w-16 rounded dash-shimmer" style={{ '--shimmer-delay': `${i * 0.1}s` }}></div>
                                    <div className="h-6 w-8 rounded dash-shimmer" style={{ '--shimmer-delay': `${i * 0.1}s` }}></div>
                                </div>
                            </div>
                        </div>
                    </div>
                    <BranchStatsSkeleton />
                </div>
            ))}
        </>
    );

    return (
        <div className="min-h-screen py-0 px-0">
            {/* Header with gradient */}
            <div
                className="dash-welcome mb-3 mx-2 sm:mx-4 border border-gray-200 rounded-xl max-sm:rounded-2xl shadow-sm"
                style={{ background: "white" }}
            >
                <div>
                    <div className="flex flex-col sm:flex-row sm:items-stretch gap-2 sm:pr-3 max-sm:pb-2">
                        {/* Identity pill — name + time-of-day greeting */}
                        <div
                            className="flex-shrink-0 flex flex-col justify-center sm:rounded-l-3xl sm:rounded-r-full max-sm:rounded-t-2xl text-white pl-7 pr-12 py-3 max-sm:w-full max-sm:text-center max-sm:px-6 max-sm:py-2.5 shadow-md"
                            style={{ background: 'linear-gradient(135deg, #3b3fa8 0%, #2f3192 55%, #232566 100%)' }}
                        >
                            <p className="text-lg font-bold leading-tight truncate">{userData?.name || 'User'}</p>
                            <p className="text-xs font-medium text-white/80 leading-tight">{getGreeting()}</p>
                        </div>

                        {/* Info chips — branch / role / period / viewing scope */}
                        <div className="flex flex-wrap sm:flex-nowrap items-center gap-1.5 flex-1 min-w-0 py-1.5 max-sm:justify-center max-sm:px-3">
                            <span className="inline-flex items-center gap-1 rounded-full bg-indigo-50 border border-indigo-100 px-3 py-1.5 text-xs font-bold text-[#2f3192] whitespace-nowrap min-w-0">
                                <svg className="w-3.5 h-3.5 flex-shrink-0" style={{ color: '#2f3192' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                                </svg>
                                <span className="truncate">{getBranchDisplayName(userData?.branch)}</span>
                            </span>
                            <span className="inline-flex items-center gap-1 rounded-full bg-indigo-50 border border-indigo-100 px-3 py-1.5 text-xs font-bold text-[#2f3192] whitespace-nowrap min-w-0">
                                <svg className="w-3.5 h-3.5 flex-shrink-0" style={{ color: '#2f3192' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                                </svg>
                                <span className="truncate">{getRoleDisplayName()}</span>
                            </span>
                            {!isEmployee && (
                                <span className="inline-flex items-center gap-1 rounded-full bg-indigo-50 border border-indigo-100 px-3 py-1.5 text-xs font-bold text-[#2f3192] whitespace-nowrap min-w-0 max-w-[220px]">
                                    <svg className="w-3.5 h-3.5 flex-shrink-0" style={{ color: '#2f3192' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                    <span className="truncate">{getDateRangeText()}</span>
                                </span>
                            )}
                            {(isMasterAdmin || isITAdmin) && (
                                <span className="inline-flex items-center gap-1 rounded-full bg-indigo-50 border border-indigo-100 px-3 py-1.5 text-xs font-bold text-[#2f3192] whitespace-nowrap min-w-0">
                                    <svg className="w-3.5 h-3.5 flex-shrink-0" style={{ color: '#2f3192' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                    </svg>
                                    <span className="truncate">Entire Kala Data</span>
                                </span>
                            )}
                            {isBranchAdmin && (
                                <span className="inline-flex items-center gap-1 rounded-full bg-indigo-50 border border-indigo-100 px-3 py-1.5 text-xs font-bold text-[#2f3192] whitespace-nowrap min-w-0 max-w-[260px]">
                                    <svg className="w-3.5 h-3.5 flex-shrink-0" style={{ color: '#2f3192' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                    </svg>
                                    <span className="truncate">{getBranchDisplayName(userData?.branch)} Branch Performance</span>
                                </span>
                            )}
                        </div>

                        {/* Consolidated Date Filter Dropdown */}
                        <div className="relative w-full sm:w-auto self-center max-sm:px-3">
                            {!isEmployee && (
                                <button
                                    onClick={() => setShowCustomDatePicker(!showCustomDatePicker)}
                                    disabled={isFilterLoading}
                                    className="w-full sm:w-auto px-3 py-1.5 bg-[#2f3192] hover:bg-[#262a7d] backdrop-blur-sm text-white rounded-full shadow-md transition-all duration-200 flex items-center justify-center sm:justify-between gap-1.5 text-xs font-semibold"
                                >
                                    <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                    </svg>
                                    <span className="truncate">{getTimePeriodDisplayText()}</span>
                                    <svg className={`w-3 h-3 transition-transform flex-shrink-0 ${showCustomDatePicker ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                    </svg>
                                </button>
                            )}

                            {showCustomDatePicker && (
                                <div className="fixed inset-0 z-50 sm:absolute sm:inset-auto sm:right-0 sm:mt-2 sm:w-[480px]">
                                    <div className="fixed inset-0 bg-black/50 sm:hidden" onClick={() => setShowCustomDatePicker(false)}></div>

                                    <div className="relative bg-white rounded-xl shadow-xl border border-gray-200 w-full max-w-[90vw] sm:max-w-none sm:w-[480px] mx-auto mt-4 sm:mt-0">
                                        <div className="p-3 max-h-[80vh] overflow-y-auto">
                                            <div className="flex justify-between items-center mb-3 sm:hidden">
                                                <h3 className="text-base font-semibold text-gray-800">Select Time Period</h3>
                                                <button
                                                    onClick={() => setShowCustomDatePicker(false)}
                                                    className="p-1 text-gray-500 hover:text-gray-700"
                                                >
                                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                                    </svg>
                                                </button>
                                            </div>

                                            <div className="flex flex-col sm:flex-row gap-5">
                                                <div className="sm:w-[30%] flex flex-col items-center">
                                                    <h3 className="hidden sm:block text-xs font-semibold text-gray-800 mb-2 text-center">Quick Select</h3>
                                                    <div className="space-y-1.5 w-full">
                                                        <button
                                                            onClick={() => {
                                                                const today = new Date();
                                                                const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
                                                                setCustomStartDate(firstDayOfMonth);
                                                                setCustomEndDate(today);
                                                                setShowCustomDatePicker(false);
                                                            }}
                                                            className={`w-full px-2 py-1.5 rounded-lg text-xs font-medium transition-all text-center bg-gray-50 text-gray-700 hover:bg-gray-100 border border-gray-200`}
                                                        >
                                                            Current Month
                                                        </button>
                                                        <button
                                                            onClick={() => {
                                                                handleTimePeriodChange('month');
                                                                setShowCustomDatePicker(false);
                                                            }}
                                                            className={`w-full px-2 py-1.5 rounded-lg text-xs font-medium transition-all text-center ${timePeriod === 'month'
                                                                ? 'bg-[#2f3192] text-white'
                                                                : 'bg-gray-50 text-gray-700 hover:bg-gray-100 border border-gray-200'
                                                                }`}
                                                        >
                                                            Last Month
                                                        </button>
                                                        <button
                                                            onClick={() => {
                                                                handleTimePeriodChange('3months');
                                                                setShowCustomDatePicker(false);
                                                            }}
                                                            className={`w-full px-2 py-1.5 rounded-lg text-xs font-medium transition-all text-center ${timePeriod === '3months'
                                                                ? 'bg-[#2f3192] text-white'
                                                                : 'bg-gray-50 text-gray-700 hover:bg-gray-100 border border-gray-200'
                                                                }`}
                                                        >
                                                            Last Quarter
                                                        </button>
                                                        <button
                                                            onClick={() => {
                                                                handleTimePeriodChange('6months');
                                                                setShowCustomDatePicker(false);
                                                            }}
                                                            className={`w-full px-2 py-1.5 rounded-lg text-xs font-medium transition-all text-center ${timePeriod === '6months'
                                                                ? 'bg-[#2f3192] text-white'
                                                                : 'bg-gray-50 text-gray-700 hover:bg-gray-100 border border-gray-200'
                                                                }`}
                                                        >
                                                            Last 6 Months
                                                        </button>
                                                        <button
                                                            onClick={() => {
                                                                handleTimePeriodChange('year');
                                                                setShowCustomDatePicker(false);
                                                            }}
                                                            className={`w-full px-2 py-1.5 rounded-lg text-xs font-medium transition-all text-center ${timePeriod === 'year'
                                                                ? 'bg-[#2f3192] text-white'
                                                                : 'bg-gray-50 text-gray-700 hover:bg-gray-100 border border-gray-200'
                                                                }`}
                                                        >
                                                            Last 1 Year
                                                        </button>
                                                        <button
                                                            onClick={() => {
                                                                handleTimePeriodChange('all');
                                                                setShowCustomDatePicker(false);
                                                            }}
                                                            className={`w-full px-2 py-1.5 rounded-lg text-xs font-medium transition-all text-center ${timePeriod === 'all'
                                                                ? 'bg-[#2f3192] text-white'
                                                                : 'bg-gray-50 text-gray-700 hover:bg-gray-100 border border-gray-200'
                                                                }`}
                                                        >
                                                            Calendar
                                                        </button>
                                                    </div>
                                                </div>

                                                <div className="sm:w-[60%] flex justify-center">
                                                    <div className="w-full">
                                                        <h3 className="hidden sm:block text-xs font-semibold text-gray-800 mb-2 text-center">Custom Range</h3>

                                                        <div className="flex gap-2 mb-2">
                                                            <div className="flex-1">
                                                                <label className="block text-[11px] text-gray-500 mb-0.5 text-center">Start Date</label>
                                                                <div className="px-1.5 py-1 bg-gray-50 border border-gray-200 rounded-lg text-xs text-center truncate">
                                                                    {customStartDate ? formatDDMMYYYY(customStartDate) : 'Not selected'}
                                                                </div>
                                                            </div>
                                                            <div className="flex-1">
                                                                <label className="block text-[11px] text-gray-500 mb-0.5 text-center">End Date</label>
                                                                <div className="px-1.5 py-1 bg-gray-50 border border-gray-200 rounded-lg text-xs text-center truncate">
                                                                    {customEndDate ? formatDDMMYYYY(customEndDate) : 'Not selected'}
                                                                </div>
                                                            </div>
                                                        </div>

                                                        <div className="border border-gray-200 rounded-lg p-1 bg-gray-50/50">
                                                            <DatePicker
                                                                selected={customStartDate}
                                                                onChange={(dates) => {
                                                                    const [start, end] = dates;
                                                                    setCustomStartDate(start);
                                                                    setCustomEndDate(end);
                                                                }}
                                                                startDate={customStartDate}
                                                                endDate={customEndDate}
                                                                selectsRange
                                                                inline
                                                                maxDate={new Date()}
                                                                calendarClassName="custom-calendar"
                                                                dateFormat="dd/MM/yyyy"
                                                            />
                                                        </div>

                                                        <div className="flex gap-2 mt-2.5">
                                                            <button
                                                                onClick={() => {
                                                                    setShowCustomDatePicker(false);
                                                                    if (timePeriod !== 'custom') {
                                                                        setCustomStartDate(null);
                                                                        setCustomEndDate(null);
                                                                    }
                                                                }}
                                                                className="flex-1 px-2 py-1.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-xs font-medium"
                                                            >
                                                                Cancel
                                                            </button>
                                                            <button
                                                                onClick={handleCustomDateApply}
                                                                disabled={!customStartDate || !customEndDate}
                                                                className="flex-1 px-2 py-1.5 bg-[#2f3192] text-white rounded-lg hover:bg-[#335478] transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-xs font-medium"
                                                            >
                                                                Apply
                                                            </button>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}

                            <style jsx>{`
.custom-calendar {
    border: none !important;
    font-size: 0.7rem !important;
    width: 100% !important;
}
.custom-calendar .react-datepicker__header {
    background-color: white;
    border-bottom: 1px solid #e5e7eb;
    font-size: 0.7rem;
    padding-top: 0.3rem;
}
.custom-calendar .react-datepicker__current-month {
    font-size: 0.7rem;
    font-weight: 500;
}
.custom-calendar .react-datepicker__day-name {
    font-size: 0.65rem;
    width: 1.7rem;
    line-height: 1.7rem;
    margin: 0.08rem;
}
.custom-calendar .react-datepicker__day {
    font-size: 0.65rem;
    width: 1.7rem;
    line-height: 1.7rem;
    margin: 0.08rem;
}
.custom-calendar .react-datepicker__day--selected {
    background-color: #2f3192;
}
.custom-calendar .react-datepicker__day--in-range {
    background-color: #e0e7f0;
}
.custom-calendar .react-datepicker__day--range-start,
.custom-calendar .react-datepicker__day--range-end {
    background-color: #2f3192;
    color: white;
}
.custom-calendar .react-datepicker__day--keyboard-selected {
    background-color: #e0e7f0;
}
.custom-calendar .react-datepicker__month-container {
    width: 100%;
}
.custom-calendar .react-datepicker__day-names,
.custom-calendar .react-datepicker__week {
    display: flex;
    justify-content: space-around;
}
.custom-calendar .react-datepicker__navigation {
    top: 0.3rem;
}
.custom-calendar .react-datepicker__navigation-icon::before {
    border-color: #2f3192;
}
`}</style>
                        </div>
                    </div>

                </div>
            </div>

            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 max-md:px-2">
                {isFilterLoading && (
                    <div className="mb-4 flex justify-center">
                        <div className="bg-white rounded-lg shadow-sm px-4 py-2 flex items-center gap-2">
                            <div className="w-4 h-4 border-2 border-[#2f3192] border-t-transparent rounded-full animate-spin"></div>
                            <span className="text-xs text-black">Loading data for selected period...</span>
                        </div>
                    </div>
                )}

                {/* Tabs for different roles */}
                {(isMasterAdmin || isITAdmin || isBranchAdmin) && (
                    <div className="mb-6">
                        <button
                            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                            className="lg:hidden w-full flex items-center justify-between px-4 py-3 bg-white rounded-xl shadow-sm border border-gray-200 mb-2"
                        >
                            <span className="font-medium text-gray-700">
                                {activeTab === 'overall' ? getPerformanceTitle() :
                                    activeTab === 'branches' ? 'Branch Overview & Drive Reports' :
                                        activeTab === 'branch-report' ? 'Employee Progress' :
                                            activeTab === 'campaign-success' ? 'Drive Overview' :
                                                activeTab === 'activity' ? 'Activity Frequency' :
                                                    activeTab === 'rejected-reason' ? 'Rejected Reasons Reports' : 'Status Stats'}
                            </span>
                            <svg className={`w-5 h-5 transition-transform ${isMobileMenuOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                            </svg>
                        </button>

                        <div className={`${isMobileMenuOpen ? 'block' : 'hidden'} lg:block`}>
                            <nav className="dash-tabs flex flex-col lg:flex-row lg:space-x-2 max-lg:gap-2">
                                {/* Overall Performance Tab */}
                                <button
                                    onClick={() => {
                                        setActiveTab('overall');
                                        setIsMobileMenuOpen(false);
                                    }}
                                    className={`px-4 py-2 rounded-[24px] font-medium transition-all duration-200 text-sm
                        ${activeTab === 'overall'
                                            ? 'text-white font-bold shadow-md'
                                            : 'text-black bg-white border border-gray-200 hover:bg-gray-50 hover:border-gray-300'
                                        }`}
                                    style={activeTab === 'overall' ? { backgroundColor: "#2f3192" } : {}}
                                >
                                    {getPerformanceTitle()}
                                </button>

                                {/* Branch Overview Tab */}
                                {(isMasterAdmin || isITAdmin || isBranchAdmin) && (
                                    <button
                                        onClick={() => {
                                            setActiveTab('branches');
                                            setIsMobileMenuOpen(false);
                                        }}
                                        className={`px-4 py-2 rounded-[24px] font-medium transition-all duration-200 text-sm
                            ${activeTab === 'branches'
                                                ? 'text-white shadow-md'
                                                : 'text-black bg-white border border-gray-200 hover:bg-gray-50 hover:border-gray-300'
                                            }`}
                                        style={activeTab === 'branches' ? { backgroundColor: "#2f3192" } : {}}
                                    >
                                        Branch Overview & Drive Reports
                                    </button>
                                )}

                                {/* Employee Progress Tab */}
                                {(isMasterAdmin || isITAdmin || isBranchAdmin) && (
                                    <button
                                        onClick={() => {
                                            setActiveTab('branch-report');
                                            setIsMobileMenuOpen(false);
                                        }}
                                        className={`px-4 py-2 rounded-[24px] font-medium transition-all duration-200 text-sm
                            ${activeTab === 'branch-report'
                                                ? 'text-white shadow-md'
                                                : 'text-black bg-white border border-gray-200 hover:bg-gray-50 hover:border-gray-300'
                                            }`}
                                        style={activeTab === 'branch-report' ? { backgroundColor: "#2f3192" } : {}}
                                    >
                                        Employee Progress
                                    </button>
                                )}

                                {/* Campaign Overview Tab - Master/IT Admin only */}
                                {(isMasterAdmin || isITAdmin) && (
                                    <>
                                        <button
                                            onClick={() => {
                                                setActiveTab('campaign-success');
                                                setIsMobileMenuOpen(false);
                                            }}
                                            className={`px-4 py-2 rounded-[24px] font-medium transition-all duration-200 text-sm
                                ${activeTab === 'campaign-success'
                                                    ? 'text-white shadow-md'
                                                    : 'text-black bg-white border border-gray-200 hover:bg-gray-50 hover:border-gray-300'
                                                }`}
                                            style={activeTab === 'campaign-success' ? { backgroundColor: "#2f3192" } : {}}
                                        >
                                            Drive Overview
                                        </button>
                                    </>
                                )}
                                {/* Activity Frequency Tab - For Master, IT, AND Branch Admin */}
                                {(isMasterAdmin || isITAdmin || isBranchAdmin) && (
                                    <button
                                        onClick={() => {
                                            setActiveTab('activity');
                                            setIsMobileMenuOpen(false);
                                        }}
                                        className={`px-5 py-2.5 rounded-[24px] font-medium transition-all duration-200 text-sm
            ${activeTab === 'activity'
                                                ? 'text-white shadow-md'
                                                : 'text-black font-bold bg-white border border-gray-200 hover:bg-gray-50 hover:border-gray-300'
                                            }`}
                                        style={activeTab === 'activity' ? { backgroundColor: "#2f3192" } : {}}
                                    >
                                        Activity Frequency
                                    </button>
                                )}

                                {/* Rejected Reasons Tab - For Master, IT, AND Branch Admin */}
                                {(isMasterAdmin || isITAdmin || isBranchAdmin) && (
                                    <button
                                        onClick={() => {
                                            setActiveTab('rejected-reason');
                                            setIsMobileMenuOpen(false);
                                        }}
                                        className={`px-5 py-2.5 rounded-[24px] font-medium transition-all duration-200 text-sm
            ${activeTab === 'rejected-reason'
                                                ? 'text-white shadow-md'
                                                : 'text-black bg-white border border-gray-200 hover:bg-gray-50 hover:border-gray-300'
                                            }`}
                                        style={activeTab === 'rejected-reason' ? { backgroundColor: "#2f3192" } : {}}
                                    >
                                        Rejected Reasons Reports
                                    </button>
                                )}
                            </nav>
                        </div>
                    </div>
                )}

                {/* Overall Performance Tab (for Master Admin and IT Admin) */}
                {activeTab === 'overall' && (isMasterAdmin || isITAdmin) && shouldLoadTab('overall') && (
                    <div>
                        {/* Each section paints independently: it shows its own
                            skeleton until its own data lands, then fades in —
                            no box waits for another box's request. */}

                                {/* 3 Summary Cards */}
                                {!summaryStats ? <SummaryCardsSkeleton /> : (
                                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-3 dash-fade-in">
                                        {/* 1st Card */}
                                        <div className="bg-gray-100 rounded-2xl shadow-sm border border-gray-200 p-3">
                                            <h3 className="text-[11px] font-semibold text-black uppercase mb-2">
                                                Total Active Customers
                                            </h3>
                                            <div className="flex items-center justify-between">
                                                <div className="w-[30%] flex justify-center">
                                                    <p className="text-lg font-bold text-gray-900">
                                                        {summaryStats?.total_customers || 0}
                                                    </p>
                                                </div>
                                                <div className="w-px h-12 bg-gradient-to-b from-transparent via-gray-400 to-transparent"></div>
                                                <div className="w-[60%] flex flex-col text-xs font-semibold space-y-1">
                                                    <div className="flex flex-row justify-between items-baseline">
                                                        <span>Attended:</span>
                                                        <span className="font-bold text-lg whitespace-nowrap"><TimeValue>{summaryStats?.attended_customers || 0}</TimeValue></span>
                                                    </div>
                                                    <div className="flex flex-row justify-between items-baseline">
                                                        <span>Remaining:</span>
                                                        <span className="font-bold text-lg whitespace-nowrap"><TimeValue>{summaryStats?.remaining_customers || 0}</TimeValue></span>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        {/* 2nd Card */}
                                        <div className="bg-gray-100 rounded-2xl shadow-sm border border-gray-200 p-3">
                                            <h3 className="text-[11px] font-semibold text-black uppercase mb-2">
                                                Total Active Assets
                                            </h3>
                                            <div className="flex items-center justify-between">
                                                <div className="w-[30%] flex justify-center">
                                                    <p className="text-lg font-bold text-gray-900">
                                                        {summaryStats?.total_assets || 0}
                                                    </p>
                                                </div>
                                                <div className="w-px h-12 bg-gradient-to-b from-transparent via-gray-400 to-transparent"></div>
                                                <div className="w-[60%] flex flex-col text-xs font-semibold space-y-1">
                                                    <div className="flex flex-row justify-between items-baseline">
                                                        <span>Attended:</span>
                                                        <span className="font-bold text-lg whitespace-nowrap"><TimeValue>{summaryStats?.attended_assets || 0}</TimeValue></span>
                                                    </div>
                                                    <div className="flex flex-row justify-between items-baseline">
                                                        <span>Remaining:</span>
                                                        <span className="font-bold text-lg whitespace-nowrap"><TimeValue>{summaryStats?.remaining_assets || 0}</TimeValue></span>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        {/* 3rd Card */}
                                        <div className="bg-gray-100 rounded-2xl shadow-sm border border-gray-200 p-3">
                                            <h3 className="text-[11px] font-semibold text-black uppercase mb-2">
                                                Attended Total Active Assets Last Status
                                            </h3>
                                            <div className="flex items-center justify-between">
                                                <div className="w-[30%] flex justify-center">
                                                    <p className="text-lg font-bold text-gray-900">
                                                        {summaryStats?.attended_assets || 0}
                                                    </p>
                                                </div>
                                                <div className="w-px h-12 bg-gradient-to-b from-transparent via-gray-400 to-transparent"></div>
                                                <div className="w-[60%] grid grid-cols-3 gap-x-2 gap-y-1 text-xs font-semibold max-sm:grid-cols-2">
                                                    <div className="flex flex-row justify-between items-baseline">
                                                        <span>WIP:</span>
                                                        <span className="font-bold text-base whitespace-nowrap"><TimeValue>{summaryStats?.wip_assets || 0}</TimeValue></span>
                                                    </div>
                                                    <div className="flex flex-row justify-between items-baseline">
                                                        <span>FR:</span>
                                                        <span className="font-bold text-base whitespace-nowrap"><TimeValue>{summaryStats?.rescheduled_assets || 0}</TimeValue></span>
                                                    </div>
                                                    <div className="flex flex-row justify-between items-baseline">
                                                        <span>R:</span>
                                                        <span className="font-bold text-base whitespace-nowrap"><TimeValue>{summaryStats?.rejected_assets || 0}</TimeValue></span>
                                                    </div>
                                                    <div className="flex flex-row justify-between items-baseline">
                                                        <span>NC:</span>
                                                        <span className="font-bold text-base whitespace-nowrap"><TimeValue>{summaryStats?.not_connected_assets || 0}</TimeValue></span>
                                                    </div>
                                                    <div className="flex flex-row justify-between items-baseline">
                                                        <span>C:</span>
                                                        <span className="font-bold text-base whitespace-nowrap"><TimeValue>{summaryStats?.completed_assets || 0}</TimeValue></span>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* Two Graphs Row — skeleton until drive data is ready */}
                                {!campaignPerformance?.length && (loading || campaignLoading) ? (
                                    <GraphsSkeleton />
                                ) : (
                                <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 mb-3 dash-fade-in">
                                    {/* Campaign-wise Customer Breakdown - 65% width */}
                                    <div className="lg:col-span-8 bg-white rounded-xl shadow-sm p-3 border border-gray-100 max-lg:w-full max-lg:min-w-0">
                                        <h3 className="text-base font-semibold text-gray-800 mb-4">
                                            Drive-wise Customer Breakdown
                                        </h3>
                                        <div className="h-[420px] w-full overflow-x-auto">
                                            {campaignBreakdownChartData ? (
                                                <Bar data={campaignBreakdownChartData} options={campaignBreakdownChartOptions} />
                                            ) : (
                                                <div className="h-64 flex items-center justify-center text-gray-500">
                                                    No drive data available
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {/* Asset Status Distribution - 35% width */}
                                    <div className="lg:col-span-4 bg-white rounded-xl shadow-sm p-3 border border-gray-100 flex flex-col max-lg:w-full max-lg:min-w-0">
                                        <h3 className="text-base font-semibold text-gray-800 mb-4">
                                            Asset Status Distribution
                                        </h3>
                                        <div className="flex-1 flex items-center justify-center">
                                            <div className="w-full max-w-[280px] mx-auto">
                                                <Pie data={assetStatusPieData} options={assetStatusPieOptions} />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                )}

                                {branchPerformance && branchPerformance.length > 0 ? (() => {
                                    const sortedBranchPerformance = sortedBranchPerformanceMemo;
                                    return (
                                        <div className="w-full mb-2 dash-fade-in">
                                            <div className="bg-white rounded-xl shadow-sm p-3 border border-gray-100">
                                                <div className="mb-2">
                                                    <h3 className="text-base font-semibold text-black flex justify-between items-center">
                                                        <span>Branch-wise Asset Progress</span>
                                                        <span className="font-semibold text-black text-sm">
                                                            Total Branches: {branchPerformance?.length || 0}
                                                        </span>
                                                    </h3>
                                                    <p className="text-sm text-gray-500 mt-1">
                                                        Total Assets vs Completed Assets
                                                    </p>
                                                </div>

                                                <div className="h-[600px] w-full overflow-y-auto">
                                                    {sortedBranchPerformance.length > 0 ? (
                                                        <Bar
                                                            data={{
                                                                labels: sortedBranchPerformance.map(branch => {
                                                                    const branchName = branchNameMap[branch.branch] || branch.branch;
                                                                    return branchName.length > 25
                                                                        ? branchName.substring(0, 22) + '...'
                                                                        : branchName;
                                                                }),
                                                                datasets: [
                                                                    {
                                                                        label: 'Total Assets',
                                                                        data: sortedBranchPerformance.map(branch => {
                                                                            const engagedData = branchEngagedData[branch.branch];
                                                                            const remainingData = branchRemainingData[branch.branch];

                                                                            if (!engagedData || !remainingData || !engagedData.campaigns || !remainingData.campaigns) return 0;

                                                                            const getCampaignTotalAllocate = (campaign) => {
                                                                                if (campaign.total_allocate) return campaign.total_allocate;
                                                                                const engagedCustomers = campaign.total_customers || 0;
                                                                                const campaignRemainingData = remainingData.campaigns.find(
                                                                                    c => Number(c.campaign_id) === Number(campaign.campaign_id)
                                                                                );
                                                                                const remainingFromAssets = campaignRemainingData?.remaining_customers || 0;
                                                                                return engagedCustomers + remainingFromAssets;
                                                                            };

                                                                            const campaignsWithAllocate = engagedData.campaigns.filter(campaign => {
                                                                                const totalAllocate = getCampaignTotalAllocate(campaign);
                                                                                return totalAllocate > 0;
                                                                            });

                                                                            const totalBranchAssets = campaignsWithAllocate.reduce((sum, campaign) => {
                                                                                return sum + getCampaignTotalAllocate(campaign);
                                                                            }, 0);

                                                                            return totalBranchAssets;
                                                                        }),
                                                                        backgroundColor: 'rgba(59, 130, 246, 0.85)',
                                                                        borderColor: '#3b82f6',
                                                                        borderWidth: 1,
                                                                        borderRadius: 4,
                                                                        barPercentage: 0.7,
                                                                        categoryPercentage: 0.8
                                                                    },
                                                                    {
                                                                        label: 'Completed Assets',
                                                                        data: sortedBranchPerformance.map(branch => {
                                                                            const engagedData = branchEngagedData[branch.branch];
                                                                            return engagedData?.completed_followups || 0;
                                                                        }),
                                                                        backgroundColor: 'rgba(34, 197, 94, 0.85)',
                                                                        borderColor: '#16a34a',
                                                                        borderWidth: 1,
                                                                        borderRadius: 4,
                                                                        barPercentage: 0.7,
                                                                        categoryPercentage: 0.8
                                                                    }
                                                                ]
                                                            }}
                                                            options={{
                                                                indexAxis: 'y',
                                                                responsive: true,
                                                                maintainAspectRatio: false,
                                                                layout: {
                                                                    padding: {
                                                                        left: 10,
                                                                        right: 120,
                                                                        top: 10,
                                                                        bottom: 10
                                                                    }
                                                                },
                                                                plugins: {
                                                                    legend: {
                                                                        position: 'top',
                                                                        labels: {
                                                                            usePointStyle: true,
                                                                            boxWidth: 12,
                                                                            font: { size: 11 },
                                                                            padding: 10
                                                                        }
                                                                    },
                                                                    tooltip: {
                                                                        backgroundColor: 'rgba(0, 0, 0, 0.95)',
                                                                        titleColor: '#ffffff',
                                                                        bodyColor: '#e5e7eb',
                                                                        borderColor: '#374151',
                                                                        borderWidth: 1,
                                                                        padding: 12,
                                                                        callbacks: {
                                                                            title: function (tooltipItems) {
                                                                                const branch = sortedBranchPerformance[tooltipItems[0].dataIndex];
                                                                                const branchName = branchNameMap[branch.branch] || branch.branch;
                                                                                return branchName;
                                                                            },
                                                                            label: function (context) {
                                                                                const label = context.dataset.label || '';
                                                                                const value = context.raw || 0;
                                                                                return `${label}: ${value.toLocaleString()}`;
                                                                            },
                                                                            afterBody: function (tooltipItems) {
                                                                                const branch = sortedBranchPerformance[tooltipItems[0].dataIndex];
                                                                                const engagedData = branchEngagedData[branch.branch];
                                                                                const remainingData = branchRemainingData[branch.branch];

                                                                                if (!engagedData || !remainingData) return [];

                                                                                const getCampaignTotalAllocate = (campaign) => {
                                                                                    if (campaign.total_allocate) return campaign.total_allocate;
                                                                                    const engagedCustomers = campaign.total_customers || 0;
                                                                                    const campaignRemainingData = remainingData.campaigns.find(
                                                                                        c => Number(c.campaign_id) === Number(campaign.campaign_id)
                                                                                    );
                                                                                    const remainingFromAssets = campaignRemainingData?.remaining_customers || 0;
                                                                                    return engagedCustomers + remainingFromAssets;
                                                                                };

                                                                                const campaignsWithAllocate = engagedData.campaigns.filter(campaign => {
                                                                                    const totalAllocate = getCampaignTotalAllocate(campaign);
                                                                                    return totalAllocate > 0;
                                                                                });

                                                                                const totalBranchAssets = campaignsWithAllocate.reduce((sum, campaign) => {
                                                                                    return sum + getCampaignTotalAllocate(campaign);
                                                                                }, 0);

                                                                                const totalCompleted = engagedData.completed_followups || 0;
                                                                                const totalWip = engagedData.wip_followups || 0;
                                                                                const totalRejected = engagedData.rejected_followups || 0;
                                                                                const totalNotConnected = engagedData.not_connected_followups || 0;
                                                                                const totalEngagedCustomers = engagedData.total_customers || 0;
                                                                                const totalFR = totalEngagedCustomers - (totalWip + totalCompleted + totalRejected + totalNotConnected);

                                                                                const completedPercent = totalBranchAssets > 0 ? ((totalCompleted / totalBranchAssets) * 100).toFixed(1) : 0;
                                                                                const wipPercent = totalEngagedCustomers > 0 ? ((totalWip / totalEngagedCustomers) * 100).toFixed(1) : 0;
                                                                                const frPercent = totalEngagedCustomers > 0 ? ((totalFR / totalEngagedCustomers) * 100).toFixed(1) : 0;
                                                                                const rejectedPercent = totalEngagedCustomers > 0 ? ((totalRejected / totalEngagedCustomers) * 100).toFixed(1) : 0;
                                                                                const ncPercent = totalEngagedCustomers > 0 ? ((totalNotConnected / totalEngagedCustomers) * 100).toFixed(1) : 0;

                                                                                const campaignDetails = [];
                                                                                engagedData.campaigns.forEach(campaign => {
                                                                                    const totalAllocate = getCampaignTotalAllocate(campaign);
                                                                                    if (totalAllocate > 0) {
                                                                                        const completed = campaign.completed_followups || 0;
                                                                                        const campaignPercent = totalAllocate > 0 ? ((completed / totalAllocate) * 100).toFixed(1) : 0;
                                                                                        const campaignName = campaign.campaign_name || `Campaign ${campaign.campaign_id}`;
                                                                                        const shortName = campaignName.length > 30 ? campaignName.substring(0, 27) + '...' : campaignName;

                                                                                        campaignDetails.push(
                                                                                            `  • ${shortName}: ${completed.toLocaleString()}/${totalAllocate.toLocaleString()} (${campaignPercent}%)`
                                                                                        );
                                                                                    }
                                                                                });

                                                                                return [
                                                                                    `━━━━━━━━━━━━━━━━━━━━`,
                                                                                    `Remaining: ${(totalBranchAssets - totalCompleted).toLocaleString()}`,
                                                                                    `━━━━━━━━━━━━━━━━━━━━`,
                                                                                    `Attended Assets: ${totalEngagedCustomers.toLocaleString()}`,
                                                                                    `Completed: ${totalCompleted.toLocaleString()} (${completedPercent}%)`,
                                                                                    `WIP: ${totalWip.toLocaleString()} (${wipPercent}%)`,
                                                                                    `FR: ${totalFR.toLocaleString()} (${frPercent}%)`,
                                                                                    `Rejected: ${totalRejected.toLocaleString()} (${rejectedPercent}%)`,
                                                                                    `NC: ${totalNotConnected.toLocaleString()} (${ncPercent}%)`,
                                                                                    `━━━━━━━━━━━━━━━━━━━━`,
                                                                                ];
                                                                            }
                                                                        }
                                                                    },
                                                                    datalabels: {
                                                                        display: true,
                                                                        color: '#1f2937',
                                                                        anchor: 'end',
                                                                        align: 'right',
                                                                        offset: 8,
                                                                        font: {
                                                                            weight: 'bold',
                                                                            size: 10
                                                                        },
                                                                        formatter: function (value, context) {
                                                                            if (value === 0) return '';
                                                                            if (context.dataset.label === 'Completed Assets') {
                                                                                const branch = sortedBranchPerformance[context.dataIndex];
                                                                                const engagedData = branchEngagedData[branch.branch];
                                                                                const remainingData = branchRemainingData[branch.branch];

                                                                                if (!engagedData || !remainingData) return '';

                                                                                const getCampaignTotalAllocate = (campaign) => {
                                                                                    if (campaign.total_allocate) return campaign.total_allocate;
                                                                                    const engagedCustomers = campaign.total_customers || 0;
                                                                                    const campaignRemainingData = remainingData.campaigns.find(
                                                                                        c => Number(c.campaign_id) === Number(campaign.campaign_id)
                                                                                    );
                                                                                    const remainingFromAssets = campaignRemainingData?.remaining_customers || 0;
                                                                                    return engagedCustomers + remainingFromAssets;
                                                                                };

                                                                                const campaignsWithAllocate = engagedData.campaigns.filter(campaign => {
                                                                                    const totalAllocate = getCampaignTotalAllocate(campaign);
                                                                                    return totalAllocate > 0;
                                                                                });

                                                                                const totalBranchAssets = campaignsWithAllocate.reduce((sum, campaign) => {
                                                                                    return sum + getCampaignTotalAllocate(campaign);
                                                                                }, 0);

                                                                                const totalCompleted = engagedData.completed_followups || 0;
                                                                                const completedPercentage = totalBranchAssets > 0 ? ((totalCompleted / totalBranchAssets) * 100).toFixed(1) : 0;

                                                                                return `T: ${totalBranchAssets.toLocaleString()} | C: ${totalCompleted.toLocaleString()} (${completedPercentage}%)`;
                                                                            }
                                                                            return '';
                                                                        }
                                                                    }
                                                                },
                                                                scales: {
                                                                    x: {
                                                                        stacked: true,
                                                                        beginAtZero: true,
                                                                        title: {
                                                                            display: true,
                                                                            text: 'Number of Assets',
                                                                            font: { size: 11 }
                                                                        },
                                                                        grid: { color: '#EDF2F7' },
                                                                        ticks: {
                                                                            font: { size: 10 },
                                                                            callback: function (value) {
                                                                                return value.toLocaleString();
                                                                            }
                                                                        }
                                                                    },
                                                                    y: {
                                                                        stacked: true,
                                                                        title: {
                                                                            display: true,
                                                                            text: 'Branches',
                                                                            font: { size: 11 }
                                                                        },
                                                                        grid: { display: false },
                                                                        ticks: {
                                                                            font: { size: 10 }
                                                                        }
                                                                    }
                                                                }
                                                            }}
                                                        />
                                                    ) : (
                                                        <div className="space-y-4 py-2">
                                                            {[90, 72, 80, 58, 66, 45, 52, 34].map((w, i) => (
                                                                <div key={i} className="flex items-center gap-3">
                                                                    <div className="h-3 w-24 rounded dash-shimmer shrink-0" style={{ '--shimmer-delay': `${(i % 5) * 0.1}s` }}></div>
                                                                    <div className="h-4 rounded-r-md dash-shimmer" style={{ width: `${w}%`, '--shimmer-delay': `${(i % 5) * 0.1}s` }}></div>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })() : (
                                    <BranchProgressSkeleton />
                                )}
                    </div>
                )}

                {/* My Performance Tab (for Branch Admin and Employee) */}
                {activeTab === 'overall' && !(isMasterAdmin || isITAdmin) && (
                    <Suspense fallback={<div style={{ padding: '2rem', textAlign: 'center', color: '#6b7280' }}>Loading…</div>}>
                        <MyPerformance
                            userData={userData}
                            timePeriod={timePeriod}
                            customStartDate={customStartDate}
                            customEndDate={customEndDate}
                            isBranchAdmin={isBranchAdmin}
                            isMasterAdmin={isMasterAdmin}
                            isITAdmin={isITAdmin}
                        />
                    </Suspense>
                )}

                {/* Branch Overview Tab */}
                {activeTab === 'branches' && (isMasterAdmin || isITAdmin || isBranchAdmin) && shouldLoadTab('branches') && (
                    <div>
                        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden divide-y divide-gray-200">
                            {branchPerformance.length > 0 ? (
                                sortedBranchPerformanceMemo.map((branch) => {
                                    const isLoading = branchStatsLoading[branch.branch];
                                    const engagedData = branchEngagedData[branch.branch];
                                    const remainingData = branchRemainingData[branch.branch];
                                    const allocationData = allocationSummary?.[branch.branch];

                                    // Heavy computation now memoized in branchComputedStats — no per-render recalc
                                    const _stats = branchComputedStats[branch.branch] || {
                                        totalBranchAssets: 0, totalCampaigns: 0, totalEngagedCustomers: 0,
                                        totalCompleted: 0, totalWip: 0, totalRejected: 0, totalRescheduled: 0,
                                        totalNotConnected: 0,
                                        completionRate: 0, totalRemaining: 0, totalFR: 0
                                    };
                                    const totalBranchAssets = _stats.totalBranchAssets;
                                    const totalCampaigns = _stats.totalCampaigns;
                                    const totalEngagedCustomers = _stats.totalEngagedCustomers;
                                    const totalCompleted = _stats.totalCompleted;
                                    const totalWip = _stats.totalWip;
                                    const totalRejected = _stats.totalRejected;
                                    const totalRescheduled = _stats.totalRescheduled;
                                    const totalNotConnected = _stats.totalNotConnected;
                                    const completionRate = _stats.completionRate;
                                    const totalRemaining = _stats.totalRemaining;
                                    const totalFR = _stats.totalFR;

                                    if (isLoading || !engagedData || !remainingData) {
                                        return (
                                            <div key={branch.branch} className="dash-fade-in">
                                                <div className="px-3 py-2 border-b border-gray-100">
                                                    <div className="flex items-center justify-between">
                                                        <div>
                                                            <h3 className="text-base font-semibold text-black">
                                                                {getBranchDisplayName(branch.branch)}
                                                            </h3>
                                                            <div className="h-3 w-24 rounded dash-shimmer mt-1"></div>
                                                        </div>
                                                        <div className="text-center">
                                                            <p className="text-xs text-gray-500">Employees</p>
                                                            <p className="text-xl font-bold text-gray-900">{branch.total_employees}</p>
                                                        </div>
                                                    </div>
                                                </div>
                                                <BranchStatsSkeleton />
                                            </div>
                                        );
                                    }

                                    return (
                                        <div key={branch.branch} className="hover:bg-gray-50/40 transition-colors dash-fade-in">
                                            {/* Branch Header - Clickable */}
                                            <div
                                                className="px-3 py-2 cursor-pointer hover:bg-gray-50 transition-colors border-b border-gray-100"
                                                onClick={() => handleBranchNameClick(branch)}
                                            >
                                                <div className="flex items-center justify-between gap-3 max-md:flex-wrap">
                                                    <div>
                                                        <h3 className="text-base font-semibold text-[#2f3192] underline hover:font-bold transition-colors">
                                                            {getBranchDisplayName(branch.branch)}
                                                        </h3>
                                                        <p className="text-xs text-blackgray-500 mt-1">
                                                            {totalCampaigns} Active Drives
                                                        </p>
                                                    </div>
                                                    <div className="flex items-center gap-4 max-md:flex-wrap">
                                                        {/* Letter Report — stopPropagation so the branch modal doesn't also open */}
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); handleOpenBranchLetters(branch); }}
                                                            className="px-3 py-1.5 rounded-lg text-white text-xs font-medium hover:opacity-90 transition-opacity flex items-center gap-1.5 whitespace-nowrap max-sm:flex-wrap max-sm:w-full max-sm:justify-center max-sm:px-2"
                                                            style={{ backgroundColor: themeColor }}
                                                            title="View all letters sent from this branch"
                                                        >
                                                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                                                            </svg>
                                                            <span>Letter Report</span>
                                                            <span className="ml-1 inline-flex items-center gap-1">
                                                                <span className="bg-white/20 rounded px-1.5 py-0.5" title="Sent">Sent: {branchLetterCounts[branch.branch]?.sent || 0}</span>
                                                                <span className="bg-white/20 rounded px-1.5 py-0.5" title="Draft">Draft: {branchLetterCounts[branch.branch]?.draft || 0}</span>
                                                            </span>
                                                        </button>
                                                        <div className="text-center">
                                                            <p className="text-xs text-blackgray-500">Employees</p>
                                                            <p className="text-xl font-bold text-gray-900">{branch.total_employees}</p>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Stats Cards - EXACT SAME AS BranchCustomersModal */}
                                            <div className="px-3 py-2 bg-gradient-to-r from-gray-50 to-white">
                                                {/* One combined box — sections separated by vertical lines */}
                                                <div className="bg-gray-100 rounded-2xl shadow-sm border border-gray-200 flex flex-col md:flex-row divide-y md:divide-y-0 md:divide-x divide-gray-300">

                                                    {/* 1st Section - Branch Allocation Summary */}
                                                    <div className="flex-1 p-3">
                                                        <h3 className="text-[11px] font-semibold text-black uppercase mb-2">
                                                            Customers Allocated to Branch
                                                        </h3>
                                                        {!allocationData ? (
                                                            <div className="flex items-center justify-between h-[72px]">
                                                                <div className="w-[30%] flex justify-center">
                                                                    <div className="h-8 w-12 rounded-lg dash-shimmer"></div>
                                                                </div>
                                                                <div className="w-px h-12 bg-gradient-to-b from-transparent via-gray-300 to-transparent"></div>
                                                                <div className="w-[60%] space-y-2">
                                                                    <div className="flex justify-between items-center">
                                                                        <div className="h-3 w-14 rounded dash-shimmer"></div>
                                                                        <div className="h-4 w-10 rounded dash-shimmer"></div>
                                                                    </div>
                                                                    <div className="flex justify-between items-center">
                                                                        <div className="h-3 w-14 rounded dash-shimmer"></div>
                                                                        <div className="h-4 w-10 rounded dash-shimmer"></div>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        ) : (
                                                            <div className="flex items-center justify-between">
                                                                <div className="w-[30%] flex justify-center">
                                                                    <p className="text-2xl font-bold text-black">
                                                                        {allocationData?.total_allocated_customers?.toLocaleString() || 0}
                                                                    </p>
                                                                </div>
                                                                <div className="w-px h-12 bg-gradient-to-b from-transparent via-gray-400 to-transparent"></div>
                                                                <div className="w-[60%] flex flex-col text-xs font-semibold space-y-1">
                                                                    <div className="flex flex-row justify-between items-baseline">
                                                                        <span>Attended:</span>
                                                                        <span className="font-bold text-lg whitespace-nowrap">
                                                                            {allocationData?.attended_customers?.toLocaleString() || 0}
                                                                        </span>
                                                                    </div>
                                                                    <div className="flex flex-row justify-between items-baseline">
                                                                        <span>Remaining:</span>
                                                                        <span className="font-bold text-lg whitespace-nowrap">
                                                                            {allocationData?.total_allocated_customers && allocationData?.attended_customers
                                                                                ? (allocationData.total_allocated_customers - allocationData.attended_customers).toLocaleString()
                                                                                : 0}
                                                                        </span>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>

                                                    {/* 2nd Section - Total Branch Assets */}
                                                    <div className="flex-1 p-3">
                                                        <h3 className="text-[11px] font-semibold text-black uppercase mb-2">
                                                            Assets Allocated to Branch
                                                        </h3>
                                                        <div className="flex items-center justify-between">
                                                            <div className="w-[35%] flex justify-center">
                                                                <p className="text-2xl font-bold text-black">
                                                                    {totalBranchAssets.toLocaleString()}
                                                                </p>
                                                            </div>
                                                            <div className="w-px h-12 bg-gradient-to-b from-transparent via-gray-400 to-transparent"></div>
                                                            <div className="w-[60%] flex flex-col text-xs font-semibold space-y-1">
                                                                <div className="flex flex-row justify-between items-baseline">
                                                                    <span>Attended:</span>
                                                                    <span className="font-bold text-lg whitespace-nowrap">
                                                                        {totalEngagedCustomers.toLocaleString()}
                                                                    </span>
                                                                </div>
                                                                <div className="flex flex-row justify-between items-baseline">
                                                                    <span>Remaining:</span>
                                                                    <span className="font-bold text-lg whitespace-nowrap">
                                                                        {(totalBranchAssets - totalEngagedCustomers).toLocaleString()}
                                                                    </span>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>

                                                    {/* 3rd Section - Engaged Campaign Assets (wider) */}
                                                    <div className="flex-[1.4] p-3">
                                                        <h3 className="text-[11px] font-semibold text-black uppercase mb-2">
                                                            Assets Attended
                                                        </h3>
                                                        <div className="flex items-center justify-between">
                                                            <div className="w-[25%] flex justify-center">
                                                                <p className="text-2xl font-bold text-black">
                                                                    {totalEngagedCustomers.toLocaleString()}
                                                                </p>
                                                            </div>
                                                            <div className="w-px h-12 bg-gradient-to-b from-transparent via-gray-400 to-transparent"></div>
                                                            <div className="w-[65%] min-w-0 grid grid-cols-3 gap-x-2 gap-y-1 pl-2 pr-3 text-xs font-semibold justify-items-start max-sm:grid-cols-2">
                                                                <div className="flex items-baseline gap-1 min-w-0">
                                                                    <span className="w-8 shrink-0">WIP:</span>
                                                                    <span className="font-bold text-base text-black whitespace-nowrap">{totalWip.toLocaleString()}</span>
                                                                </div>
                                                                <div className="flex items-baseline gap-1 min-w-0">
                                                                    <span className="w-8 shrink-0">FR:</span>
                                                                    <span className="font-bold text-base text-black whitespace-nowrap">{totalFR.toLocaleString()}</span>
                                                                </div>
                                                                <div className="flex items-baseline gap-1 min-w-0">
                                                                    <span className="w-8 shrink-0">R:</span>
                                                                    <span className="font-bold text-base text-black whitespace-nowrap">{totalRejected.toLocaleString()}</span>
                                                                </div>
                                                                <div className="flex items-baseline gap-1 min-w-0">
                                                                    <span className="w-8 shrink-0">NC:</span>
                                                                    <span className="font-bold text-base text-black whitespace-nowrap">{totalNotConnected.toLocaleString()}</span>
                                                                </div>
                                                                <div className="flex items-baseline gap-1 min-w-0">
                                                                    <span className="w-8 shrink-0">C:</span>
                                                                    <span className="font-bold text-base text-black whitespace-nowrap">{totalCompleted.toLocaleString()}</span>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>

                                                    {/* 4th Section - Performance */}
                                                    <div className="flex-1 p-3">
                                                        <h3 className="text-[11px] font-semibold text-black uppercase mb-2">
                                                            Performance
                                                        </h3>
                                                        <div className="flex items-center justify-between">
                                                            <div className="w-[35%] flex flex-col items-center justify-center">
                                                                <span className="text-[10px] text-black">Completion Rate</span>
                                                                <p className="text-2xl font-bold text-black">
                                                                    {completionRate}%
                                                                </p>
                                                            </div>
                                                            <div className="w-px h-12 bg-gradient-to-b from-transparent via-gray-400 to-transparent"></div>
                                                            <div className="w-[55%]">
                                                                <div className="w-full bg-gray-200 rounded-full h-2">
                                                                    <div
                                                                        className="h-2 rounded-full bg-gray-800 transition-all"
                                                                        style={{ width: `${completionRate}%` }}
                                                                    ></div>
                                                                </div>
                                                                <div className="mt-2 text-center text-[10px] text-black">
                                                                    Based on Attended vs Completed
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>

                                                </div>
                                            </div>
                                        </div>
                                    );
                                })
                            ) : !branchPerfFetched ? (
                                <BranchOverviewSkeleton />
                            ) : (
                                <div className="p-12 text-center">
                                    <svg className="w-20 h-20 text-gray-300 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                                    </svg>
                                    <h3 className="text-lg font-medium text-gray-700 mb-2">No Branch Data</h3>
                                    <p className="text-gray-500">No branch performance data available for the selected period.</p>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* Employee Progress Tab */}
                {activeTab === 'branch-report' && (isMasterAdmin || isITAdmin || isBranchAdmin) && shouldLoadTab('branch-report') && (
                    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 max-md:p-2">
                        <div className="flex items-center justify-between mb-3 max-md:flex-wrap max-md:gap-2">
                            <h2 className="text-base font-bold text-black">Branch Employee Report</h2>
                            {canViewTimeReport && (
                                <button
                                    onClick={() => setShowEmployeeTimeModal(true)}
                                    className="px-3 py-1.5 text-xs font-medium text-white rounded-lg hover:opacity-90 transition-opacity flex items-center gap-1.5 whitespace-nowrap max-sm:w-full max-sm:justify-center"
                                    style={{ backgroundColor: themeColor }}
                                >
                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                    Employee Login Time
                                </button>
                            )}
                        </div>

                        {(isMasterAdmin || isITAdmin) ? (
                            <div className="mb-4">
                                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 mb-3">
                                    <label className="block text-xs font-medium text-black">
                                        Select Branches
                                    </label>
                                    <div className="flex gap-2 max-md:flex-wrap">
                                        <button
                                            onClick={() => {
                                                const apiBranches = branches || [];
                                                const allBranchCodes = [
                                                    ...BRANCH_ORDER_LIST,
                                                    ...apiBranches.filter(b => !BRANCH_ORDER_LIST.includes(b))
                                                ];
                                                const selectedStr = allBranchCodes.join(',');
                                                setSelectedBranch(selectedStr);
                                                fetchMultipleBranchEmployees(allBranchCodes);
                                            }}
                                            className="px-2.5 py-1.5 text-[11px] bg-gray-100 hover:bg-gray-200 text-black rounded transition-colors"
                                        >
                                            Select All
                                        </button>
                                        <button
                                            onClick={() => {
                                                setSelectedBranch('');
                                                setBranchEmployees([]);
                                            }}
                                            className="px-2.5 py-1.5 text-[11px] bg-gray-100 hover:bg-gray-200 text-black rounded transition-colors"
                                        >
                                            Clear All
                                        </button>
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 mb-4 p-3 border border-gray-200 rounded bg-gray-50 max-h-48 overflow-y-auto max-sm:grid-cols-1">
                                    {(() => {
                                        const branchOrder = BRANCH_ORDER_LIST;
                                        // Render from the static list so branch names appear
                                        // instantly, then append any extra branches the API returned.
                                        const apiBranches = branches || [];
                                        const extras = apiBranches.filter(b => !branchOrder.includes(b));
                                        const sortedBranches = [...branchOrder, ...extras];
                                        return sortedBranches.map((branch) => {
                                            const selectedBranches = selectedBranch ? selectedBranch.split(',') : [];
                                            const isChecked = selectedBranches.includes(branch);

                                            return (
                                                <label key={branch} className="flex items-center gap-2 cursor-pointer hover:bg-white p-2 rounded transition-colors">
                                                    <input
                                                        type="checkbox"
                                                        value={branch}
                                                        checked={isChecked}
                                                        onChange={(e) => {
                                                            const currentSelected = selectedBranch ? selectedBranch.split(',') : [];
                                                            let newSelected;
                                                            let newSelectedStr;

                                                            if (e.target.checked) {
                                                                newSelected = [...currentSelected, branch];
                                                                newSelectedStr = newSelected.join(',');
                                                                setSelectedBranch(newSelectedStr);
                                                                fetchMultipleBranchEmployees(newSelected);
                                                            } else {
                                                                newSelected = currentSelected.filter(b => b !== branch);
                                                                newSelectedStr = newSelected.join(',');
                                                                setSelectedBranch(newSelectedStr);
                                                                if (newSelected.length > 0) {
                                                                    fetchMultipleBranchEmployees(newSelected);
                                                                } else {
                                                                    setBranchEmployees([]);
                                                                }
                                                            }
                                                        }}
                                                        className="w-4 h-4 text-black border-gray-300 rounded focus:ring-black"
                                                    />
                                                    <span className="text-xs text-black">{getBranchDisplayName(branch)}</span>
                                                </label>
                                            );
                                        });
                                    })()}
                                </div>

                                {selectedBranch && (
                                    <div className="flex items-center">
                                        <p className="text-[11px] text-black">
                                            Selected: {selectedBranch.split(',').length} branch(es)
                                        </p>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="mb-4 p-3 bg-gray-50 rounded border border-gray-200">
                                <p className="text-xs text-black">
                                    Showing report for branch: <strong>{getBranchDisplayName(userData?.branch)}</strong>
                                </p>
                            </div>
                        )}

                        {branchEmployeesLoading && selectedBranch && (
                            <div className="text-center py-8">
                                <div className="w-10 h-10 border-2 border-t-2 border-t-black border-gray-200 rounded-full animate-spin mx-auto mb-3"></div>
                                <p className="text-xs text-black">Loading employees data...</p>
                            </div>
                        )}

                        {!branchEmployeesLoading && selectedBranch && branchEmployees.length > 0 ? (
                            <div>
                                <div className="mb-3 flex justify-between items-center max-md:flex-wrap max-md:gap-2">
                                    <h3 className="text-sm font-semibold text-black">
                                        Employees from {selectedBranch.split(',').length} branch(es)
                                    </h3>
                                    <div className="flex items-center gap-3 max-md:flex-wrap">
                                        <p className="text-xs text-black">
                                            Total Employees: {branchEmployees.length}
                                        </p>
                                        {canExport && (
                                            <button
                                                onClick={exportBranchEmployeesTable}
                                                className="export-btn px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white text-xs rounded font-medium transition-colors flex items-center gap-1.5 max-sm:w-full max-sm:justify-center"
                                            >
                                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 8l-4-4m0 0L8 8m4-4v12M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1" />
                                                </svg>
                                                Export to Excel
                                            </button>
                                        )}
                                    </div>
                                </div>
                                <div className="overflow-x-auto border border-gray-300 rounded">
                                    <table className="min-w-full border-collapse">
                                        <thead className="bg-gray-50">
                                            <tr>
                                                <th className="px-3 py-2 text-center text-[11px] font-medium text-black uppercase tracking-wide border border-gray-300 w-10">Sr. No.</th>
                                                <th className="px-3 py-2 text-center text-[11px] font-medium text-black uppercase tracking-wide border border-gray-300 sticky left-0 bg-gray-50 z-10">Employee</th>
                                                <th className="px-3 py-2 text-center text-[11px] font-medium text-black uppercase tracking-wide border border-gray-300">Branch</th>
                                                <th
                                                    onClick={() => handleBranchEmployeeTableSort('totalFollowups')}
                                                    className="px-3 py-2 text-center text-[11px] font-medium text-black uppercase tracking-wide border border-gray-300 cursor-pointer hover:bg-gray-100 transition-colors select-none"
                                                >
                                                    <div className="flex items-center justify-center gap-1">
                                                        Total all Calls and follow-ups
                                                        {renderBranchEmployeeSortIcon('totalFollowups')}
                                                    </div>
                                                </th>
                                                <th
                                                    onClick={() => handleBranchEmployeeTableSort('wipCount')}
                                                    className="px-3 py-2 text-center text-[11px] font-medium text-black uppercase tracking-wide border border-gray-300 cursor-pointer hover:bg-gray-100 transition-colors select-none"
                                                >
                                                    <div className="flex items-center justify-center gap-1">
                                                        WIP
                                                        {renderBranchEmployeeSortIcon('wipCount')}
                                                    </div>
                                                </th>
                                                <th
                                                    onClick={() => handleBranchEmployeeTableSort('rescheduledCount')}
                                                    className="px-3 py-2 text-center text-[11px] font-medium text-black uppercase tracking-wide border border-gray-300 cursor-pointer hover:bg-gray-100 transition-colors select-none"
                                                >
                                                    <div className="flex items-center justify-center gap-1">
                                                        Rescheduled
                                                        {renderBranchEmployeeSortIcon('rescheduledCount')}
                                                    </div>
                                                </th>
                                                <th
                                                    onClick={() => handleBranchEmployeeTableSort('rejectedCount')}
                                                    className="px-3 py-2 text-center text-[11px] font-medium text-black uppercase tracking-wide border border-gray-300 cursor-pointer hover:bg-gray-100 transition-colors select-none"
                                                >
                                                    <div className="flex items-center justify-center gap-1">
                                                        Rejected
                                                        {renderBranchEmployeeSortIcon('rejectedCount')}
                                                    </div>
                                                </th>
                                                <th
                                                    onClick={() => handleBranchEmployeeTableSort('notConnectedCount')}
                                                    className="px-3 py-2 text-center text-[11px] font-medium text-black uppercase tracking-wide border border-gray-300 cursor-pointer hover:bg-gray-100 transition-colors select-none"
                                                >
                                                    <div className="flex items-center justify-center gap-1">
                                                        NC
                                                        {renderBranchEmployeeSortIcon('notConnectedCount')}
                                                    </div>
                                                </th>
                                                <th
                                                    onClick={() => handleBranchEmployeeTableSort('completedCount')}
                                                    className="px-3 py-2 text-center text-[11px] font-medium text-black uppercase tracking-wide border border-gray-300 cursor-pointer hover:bg-gray-100 transition-colors select-none"
                                                >
                                                    <div className="flex items-center justify-center gap-1">
                                                        Completed
                                                        {renderBranchEmployeeSortIcon('completedCount')}
                                                    </div>
                                                </th>
                                                <th className="px-3 py-2 text-center text-[11px] font-medium text-black uppercase tracking-wide border border-gray-300">
                                                    Drive Progress
                                                </th>
                                            </tr>
                                        </thead>
                                        <tbody className="bg-white">
                                            {getSortedBranchEmployeesList().map((employeeRecord, recordIndex) => {
                                                const totalFollowups = employeeRecord.total_followups || 0;
                                                const completedFollowups = employeeRecord.completed_count || 0;

                                                return (
                                                    <tr key={`${employeeRecord.user_id}_${recordIndex}`} className={recordIndex % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                                                        <td className="px-3 py-2 text-xs text-black text-center border border-gray-300">{recordIndex + 1}</td>
                                                        <td className="px-3 py-2 text-center border border-gray-300 sticky left-0 bg-inherit z-10">
                                                            <button
                                                                onClick={() => handleEmployeeNameClick(employeeRecord)}
                                                                className="text-xs font-medium text-[#2f3192] underline hover:font-bold focus:outline-none transition-colors"
                                                            >
                                                                {employeeRecord.user_name}
                                                            </button>
                                                        </td>
                                                        <td className="px-3 py-2 text-xs text-black text-center border border-gray-300">{getBranchDisplayName(employeeRecord.branch)}</td>
                                                        <td className="px-3 py-2 text-xs text-black text-center border border-gray-300"><TimeValue>{totalFollowups}</TimeValue></td>
                                                        <td className="px-3 py-2 text-xs text-black text-center border border-gray-300"><TimeValue>{employeeRecord.wip_count || 0}</TimeValue></td>
                                                        <td className="px-3 py-2 text-xs text-black text-center border border-gray-300"><TimeValue>{employeeRecord.rescheduled_count || 0}</TimeValue></td>
                                                        <td className="px-3 py-2 text-xs text-black text-center border border-gray-300"><TimeValue>{employeeRecord.rejected_count || 0}</TimeValue></td>
                                                        <td className="px-3 py-2 text-xs text-black text-center border border-gray-300"><TimeValue>{employeeRecord.not_connected_count || 0}</TimeValue></td>
                                                        <td className="px-3 py-2 text-xs font-medium text-center border border-gray-300 text-black"><TimeValue>{completedFollowups}</TimeValue></td>
                                                        <td className="px-3 py-2 text-center border border-gray-300">
                                                            <button
                                                                onClick={() => handleCampaignProgressClick(employeeRecord)}
                                                                className="px-2 py-1 text-[10px] font-semibold text-white rounded-lg hover:opacity-90 transition-opacity whitespace-nowrap"
                                                                style={{ backgroundColor: '#2f3192' }}
                                                            >
                                                                View
                                                            </button>
                                                        </td>
                                                    </tr>
                                                );
                                            })}

                                            {/* TOTAL ROW */}
                                            {getSortedBranchEmployeesList().length > 0 && (() => {
                                                const totals = calculateSelectedEmployeesTotals();
                                                return (
                                                    <tr className="bg-gray-100 font-bold border-t-2 border-gray-400">
                                                        <td className="px-3 py-2 text-xs text-black text-center border border-gray-300 font-bold">TOTAL</td>
                                                        <td className="px-3 py-2 text-xs text-black text-center border border-gray-300 font-bold">
                                                            {totals.totalEmployees} Employees
                                                        </td>
                                                        <td className="px-3 py-2 text-xs text-black text-center border border-gray-300 font-bold">-</td>
                                                        <td className="px-3 py-2 text-xs text-black text-center border border-gray-300 font-bold"><TimeValue>{totals.totalFollowups.toLocaleString()}</TimeValue></td>
                                                        <td className="px-3 py-2 text-xs text-black text-center border border-gray-300 font-bold"><TimeValue>{totals.totalWip.toLocaleString()}</TimeValue></td>
                                                        <td className="px-3 py-2 text-xs text-black text-center border border-gray-300 font-bold"><TimeValue>{totals.totalRescheduled.toLocaleString()}</TimeValue></td>
                                                        <td className="px-3 py-2 text-xs text-black text-center border border-gray-300 font-bold"><TimeValue>{totals.totalRejected.toLocaleString()}</TimeValue></td>
                                                        <td className="px-3 py-2 text-xs text-black text-center border border-gray-300 font-bold"><TimeValue>{totals.totalNotConnected.toLocaleString()}</TimeValue></td>
                                                        <td className="px-3 py-2 text-xs text-black text-center border border-gray-300 font-bold"><TimeValue>{totals.totalCompleted.toLocaleString()}</TimeValue></td>
                                                        <td className="px-3 py-2 text-center border border-gray-300">—</td>
                                                    </tr>
                                                );
                                            })()}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        ) : !branchEmployeesLoading && selectedBranch && branchEmployees.length === 0 ? (
                            <div className="text-center py-8">
                                <svg className="w-12 h-12 text-black mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                                </svg>
                                <p className="text-xs text-black">No employees found for selected branches.</p>
                            </div>
                        ) : !selectedBranch ? (
                            <div className="text-center py-8">
                                <svg className="w-12 h-12 text-black mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                                </svg>
                                <p className="text-xs text-black">Select branches from the list above to view employee data.</p>
                            </div>
                        ) : null}
                    </div>
                )}

                {/* Campaign Success Tab */}
                {activeTab === 'campaign-success' && (isMasterAdmin || isITAdmin || isBranchAdmin) && shouldLoadTab('campaign-success') && (
                    <div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-3">

                            {/* 1st Card */}
                            <div className="bg-gray-100 rounded-2xl shadow-sm border border-gray-200 p-3">
                                <h3 className="text-[11px] font-semibold text-gray-600 uppercase mb-2">
                                    Total Drives
                                </h3>

                                <div className="flex items-center justify-between">

                                    {/* LEFT */}
                                    <div className="w-[30%] flex justify-center">
                                        <p className="text-lg font-bold text-gray-900">
                                            {campaignPerformance.length}
                                        </p>
                                    </div>

                                    <div className="w-px h-12 bg-gradient-to-b from-transparent via-gray-400 to-transparent"></div>

                                    {/* RIGHT */}
                                    <div className="w-[60%] flex flex-col text-xs font-semibold space-y-1">
                                        <div className="flex flex-row justify-between items-baseline">
                                            <span>Active:</span>
                                            <span className="font-bold text-lg whitespace-nowrap">
                                                {campaignSuccessTotals.activeCount}
                                            </span>
                                        </div>
                                        <div className="flex flex-row justify-between items-baseline">
                                            <span>Inactive:</span>
                                            <span className="font-bold text-lg whitespace-nowrap">
                                                {campaignPerformance.length - campaignSuccessTotals.activeCount}
                                            </span>
                                        </div>
                                    </div>

                                </div>
                            </div>

                            {/* 2nd Card */}
                            <div className="bg-gray-100 rounded-2xl shadow-sm border border-gray-200 p-3">
                                <h3 className="text-[11px] font-semibold text-gray-600 uppercase mb-2">
                                    Total Attended
                                </h3>

                                <div className="flex items-center justify-between">

                                    {/* LEFT */}
                                    <div className="w-[30%] flex justify-center">
                                        <p className="text-lg font-bold text-gray-900">
                                            <TimeValue>{campaignSuccessTotals.attendedTotal}</TimeValue>
                                        </p>
                                    </div>

                                    <div className="w-px h-12 bg-gradient-to-b from-transparent via-gray-400 to-transparent"></div>

                                    {/* RIGHT */}
                                    <div className="w-[60%] flex flex-col text-xs font-semibold space-y-1">
                                        <div className="flex flex-row justify-between items-baseline">
                                            <span>Active Drive:</span>
                                            <span className="font-bold text-lg whitespace-nowrap">
                                                <TimeValue>{campaignSuccessTotals.attendedActive}</TimeValue>
                                            </span>
                                        </div>
                                        <div className="flex flex-row justify-between items-baseline">
                                            <span>Inactive Drive:</span>
                                            <span className="font-bold text-lg whitespace-nowrap">
                                                <TimeValue>{campaignSuccessTotals.attendedInactive}</TimeValue>
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* 3rd Card */}
                            <div className="bg-gray-100 rounded-2xl shadow-sm border border-gray-200 p-3">
                                <h3 className="text-[11px] font-semibold text-gray-600 uppercase mb-2">
                                    Total Completed
                                </h3>

                                <div className="flex items-center justify-between">

                                    {/* LEFT */}
                                    <div className="w-[30%] flex justify-center">
                                        <p className="text-lg font-bold text-gray-900">
                                            <TimeValue>{campaignSuccessTotals.completedTotal}</TimeValue>
                                        </p>
                                    </div>

                                    <div className="w-px h-12 bg-gradient-to-b from-transparent via-gray-400 to-transparent"></div>

                                    {/* RIGHT */}
                                    <div className="w-[60%] flex flex-col text-xs font-semibold space-y-1">
                                        <div className="flex flex-row justify-between items-baseline">
                                            <span>Active Drive:</span>
                                            <span className="font-bold text-lg whitespace-nowrap">
                                                <TimeValue>{campaignSuccessTotals.completedActive}</TimeValue>
                                            </span>
                                        </div>
                                        <div className="flex flex-row justify-between items-baseline">
                                            <span>Inactive Drive:</span>
                                            <span className="font-bold text-lg whitespace-nowrap">
                                                <TimeValue>{campaignSuccessTotals.completedInactive}</TimeValue>
                                            </span>
                                        </div>
                                    </div>

                                </div>
                            </div>

                            {/* 4th Card */}
                            <div className="bg-gray-100 rounded-2xl shadow-sm border border-gray-200 p-3">
                                <h3 className="text-[11px] font-semibold text-gray-600 uppercase mb-2">
                                    Avg. Success Rate
                                </h3>

                                <div className="flex items-center justify-between">

                                    {/* LEFT */}
                                    <div className="w-[30%] flex justify-center">
                                        <p className="text-lg font-bold text-gray-900">
                                            <TimeValue>{campaignSuccessTotals.avgSuccessRateDisplay}%</TimeValue>
                                        </p>
                                    </div>

                                    <div className="w-px h-12 bg-gradient-to-b from-transparent via-gray-400 to-transparent"></div>

                                    {/* RIGHT */}
                                    <div className="w-[60%] flex flex-col items-center text-xs font-semibold space-y-1">
                                        <div className="text-center">
                                            Based on
                                        </div>
                                        <div className="text-center">
                                            Attended vs Completed
                                        </div>
                                    </div>

                                </div>
                            </div>

                        </div>

                        {campaignLoading ? (
                            <div className="flex justify-center py-12">
                                <div className="w-12 h-12 border-4 border-t-4 border-t-[#2f3192] border-gray-200 rounded-full animate-spin"></div>
                            </div>
                        ) : campaignPerformance.length > 0 ? (
                            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                                <div className="p-2 border-b border-gray-100 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                                    <div>
                                        <h3 className="text-base font-semibold text-black">Drive Performance</h3>
                                        <p className="text-sm text-black mt-1">Drive-wise success metrics and flag breakdown</p>
                                    </div>
                                    <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
                                        <button
                                            onClick={() => setShowAllCampaignReport(true)}
                                            className="w-full sm:w-auto px-3 py-1.5 bg-[#2f3192] text-white text-sm rounded-lg hover:bg-[#252780] transition-colors flex items-center justify-center gap-2 whitespace-nowrap"
                                        >
                                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                            </svg>
                                            All Drive Report
                                        </button>
                                        <button
                                            onClick={() => setShowOtherFollowupModal(true)}
                                            className="w-full sm:w-auto px-3 py-1.5 bg-[#2f3192] text-white text-sm rounded-lg hover:bg-[#252780] transition-colors flex items-center justify-center gap-2 whitespace-nowrap"
                                        >
                                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                                            </svg>
                                            Non Drive Followup Data
                                        </button>
                                        {canExport && (
                                            <button
                                                onClick={exportCampaignPerformanceToExcel}
                                                disabled={campaignLoading || campaignPerformance.length === 0}
                                                className="export-btn w-full sm:w-auto px-3 py-1.5 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 transition-colors flex items-center justify-center gap-2 disabled:opacity-50 whitespace-nowrap"
                                            >
                                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 8l-4-4m0 0L8 8m4-4v12M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1" />
                                                </svg>
                                                Export to Excel
                                            </button>
                                        )}
                                    </div>
                                </div>

                                <div className="relative">
                                    <div
                                        ref={campaignTopScrollBarRef}
                                        className="hidden sm:block sticky top-0 z-10 bg-gray-50 border-b border-gray-200 overflow-x-auto"
                                        style={{
                                            scrollbarWidth: 'thin',
                                            overflowY: 'hidden',
                                            height: '12px'
                                        }}
                                    >
                                        <div style={{ height: '1px' }}></div>
                                    </div>

                                    <div
                                        ref={campaignTableContainerRef}
                                        className="overflow-x-auto scrollbar-thin"
                                        style={{
                                            maxWidth: '100%',
                                            overflowX: 'auto'
                                        }}
                                    >
                                        <table className="min-w-full divide-y divide-gray-200 border border-gray-200 whitespace-nowrap" style={{ width: 'max-content', minWidth: '100%' }}>
                                            <thead className="bg-gray-50">
                                                <tr>
                                                    <th className="px-2 py-1 text-center text-xs font-medium text-black uppercase tracking-wider w-12 border-r border-gray-200">
                                                        <div className="font-bold">Sr. No.</div>
                                                    </th>
                                                    <th className="px-2 py-1 text-center text-xs font-medium text-black uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition-colors duration-200 border-r border-gray-200"
                                                        onClick={() => handleCampaignSort('campaign_name')}>
                                                        <div className="flex items-center justify-center gap-2 font-bold">
                                                            Drive
                                                            <span className="text-blue-600 font-bold">
                                                                {campaignSortConfig.key === 'campaign_name' ? (campaignSortConfig.direction === 'asc' ? '↑' : '↓') : '↕'}
                                                            </span>
                                                        </div>
                                                    </th>
                                                    <th className="px-2 py-1 text-center text-xs font-medium text-black uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition-colors duration-200 border-r border-gray-200"
                                                        onClick={() => handleCampaignSort('created_by_name')}>
                                                        <div className="flex items-center justify-center gap-2 font-bold">
                                                            Created By
                                                            <span className="text-blue-600 font-bold">
                                                                {campaignSortConfig.key === 'created_by_name' ? (campaignSortConfig.direction === 'asc' ? '↑' : '↓') : '↕'}
                                                            </span>
                                                        </div>
                                                    </th>
                                                    <th className="px-2 py-1 text-center text-xs font-medium text-black uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition-colors duration-200 border-r border-gray-200"
                                                        onClick={() => handleCampaignSort('service')}>
                                                        <div className="flex items-center justify-center gap-2 font-bold">
                                                            Service/Product
                                                            <span className="text-blue-600 font-bold">
                                                                {campaignSortConfig.key === 'service' ? (campaignSortConfig.direction === 'asc' ? '↑' : '↓') : '↕'}
                                                            </span>
                                                        </div>
                                                    </th>
                                                    <th className="px-2 py-1 text-center text-xs font-medium text-black uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition-colors duration-200 border-r border-gray-200"
                                                        onClick={() => handleCampaignSort('status')}>
                                                        <div className="flex items-center justify-center gap-2 font-bold">
                                                            Status
                                                            <span className="text-blue-600 font-bold">
                                                                {campaignSortConfig.key === 'status' ? (campaignSortConfig.direction === 'asc' ? '↑' : '↓') : '↕'}
                                                            </span>
                                                        </div>
                                                    </th>
                                                    <th className="px-2 py-1 text-center text-xs font-medium text-black uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition-colors duration-200 border-r border-gray-200"
                                                        onClick={() => handleCampaignSort('total_customers')}>
                                                        <div className="flex items-center justify-center gap-2 font-bold">
                                                            Total Assets
                                                            <span className="text-blue-600 font-bold">
                                                                {campaignSortConfig.key === 'total_customers' ? (campaignSortConfig.direction === 'asc' ? '↑' : '↓') : '↕'}
                                                            </span>
                                                        </div>
                                                    </th>
                                                    <th className="px-2 py-1 text-center text-xs font-medium text-black uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition-colors duration-200 border-r border-gray-200"
                                                        onClick={() => handleCampaignSort('asset_numbers_count')}>
                                                        <div className="flex items-center justify-center gap-2 font-bold">
                                                            Remaining
                                                            <span className="text-blue-600 font-bold">
                                                                {campaignSortConfig.key === 'asset_numbers_count' ? (campaignSortConfig.direction === 'asc' ? '↑' : '↓') : '↕'}
                                                            </span>
                                                        </div>
                                                    </th>
                                                    <th className="px-2 py-1 text-center text-xs font-medium text-black uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition-colors duration-200 border-r border-gray-200"
                                                        onClick={() => handleCampaignSort('attended_customers')}>
                                                        <div className="flex items-center justify-center gap-2 font-bold">
                                                            Attended
                                                            <span className="text-blue-600 font-bold">
                                                                {campaignSortConfig.key === 'attended_customers' ? (campaignSortConfig.direction === 'asc' ? '↑' : '↓') : '↕'}
                                                            </span>
                                                        </div>
                                                    </th>
                                                    <th className="px-2 py-1 text-center text-xs font-medium text-black uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition-colors duration-200 border-r border-gray-200"
                                                        onClick={() => handleCampaignSort('wip_count')}>
                                                        <div className="flex items-center justify-center gap-2 font-bold">
                                                            WIP
                                                            <span className="text-blue-600 font-bold">
                                                                {campaignSortConfig.key === 'wip_count' ? (campaignSortConfig.direction === 'asc' ? '↑' : '↓') : '↕'}
                                                            </span>
                                                        </div>
                                                    </th>
                                                    <th className="px-2 py-1 text-center text-xs font-medium text-black uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition-colors duration-200 border-r border-gray-200"
                                                        onClick={() => handleCampaignSort('rescheduled_count')}>
                                                        <div className="flex items-center justify-center gap-2 font-bold">
                                                            FR
                                                            <span className="text-blue-600 font-bold">
                                                                {campaignSortConfig.key === 'rescheduled_count' ? (campaignSortConfig.direction === 'asc' ? '↑' : '↓') : '↕'}
                                                            </span>
                                                        </div>
                                                    </th>
                                                    <th className="px-2 py-1 text-center text-xs font-medium text-black uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition-colors duration-200 border-r border-gray-200"
                                                        onClick={() => handleCampaignSort('rejected_count')}>
                                                        <div className="flex items-center justify-center gap-2 font-bold">
                                                            Rejected
                                                            <span className="text-blue-600 font-bold">
                                                                {campaignSortConfig.key === 'rejected_count' ? (campaignSortConfig.direction === 'asc' ? '↑' : '↓') : '↕'}
                                                            </span>
                                                        </div>
                                                    </th>
                                                    <th className="px-2 py-1 text-center text-xs font-medium text-black uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition-colors duration-200 border-r border-gray-200"
                                                        onClick={() => handleCampaignSort('not_connected_count')}>
                                                        <div className="flex items-center justify-center gap-2 font-bold">
                                                            NC
                                                            <span className="text-blue-600 font-bold">
                                                                {campaignSortConfig.key === 'not_connected_count' ? (campaignSortConfig.direction === 'asc' ? '↑' : '↓') : '↕'}
                                                            </span>
                                                        </div>
                                                    </th>
                                                    <th className="px-2 py-1 text-center text-xs font-medium text-black uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition-colors duration-200 border-r border-gray-200"
                                                        onClick={() => handleCampaignSort('completed_count')}>
                                                        <div className="flex items-center justify-center gap-2 font-bold">
                                                            Completed
                                                            <span className="text-blue-600 font-bold">
                                                                {campaignSortConfig.key === 'completed_count' ? (campaignSortConfig.direction === 'asc' ? '↑' : '↓') : '↕'}
                                                            </span>
                                                        </div>
                                                    </th>
                                                    <th className="px-2 py-1 text-center text-xs font-medium text-black uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition-colors duration-200 border-r border-gray-200"
                                                        onClick={() => handleCampaignSort('success_percentage')}>
                                                        <div className="flex items-center justify-center gap-2 font-bold">
                                                            Success %
                                                            <span className="text-blue-600 font-bold">
                                                                {campaignSortConfig.key === 'success_percentage' ? (campaignSortConfig.direction === 'asc' ? '↑' : '↓') : '↕'}
                                                            </span>
                                                        </div>
                                                    </th>
                                                    {flagOrder.map(flag => (
                                                        <th key={flag} className="px-2 py-1 text-center text-xs font-medium text-black uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition-colors duration-200 border-r border-gray-200"
                                                            onClick={() => handleCampaignSort(flag)}>
                                                            <div className="flex items-center justify-center gap-2 font-bold">
                                                                {flag}
                                                                <span className="text-blue-600 font-bold">
                                                                    {campaignSortConfig.key === flag ? (campaignSortConfig.direction === 'asc' ? '↑' : '↓') : '↕'}
                                                                </span>
                                                            </div>
                                                        </th>
                                                    ))}
                                                </tr>
                                            </thead>
                                            <tbody className="bg-white divide-y divide-gray-200">
                                                {getSortedCampaignPerformance().map((campaign, index) => {
                                                    const flagBreakdown = campaign.flag_breakdown || {};
                                                    const remaining = campaign.asset_numbers_count || 0;
                                                    const attended = campaign.attended_customers || 0;
                                                    const completed = campaign.completed_count || campaign.total_completed_followups || campaign.completed || 0;
                                                    const wip = campaign.wip_count || 0;
                                                    const rescheduled = campaign.rescheduled_count || 0;
                                                    const rejected = campaign.rejected_count || 0;
                                                    const notConnected = campaign.not_connected_count || 0;
                                                    const totalCustomers = (remaining + completed);
                                                    const remaining2 = (totalCustomers - attended);
                                                    const successPercentage = campaign.success_percentage || 0;
                                                    const createdByName = campaign.created_by_name || 'N/A';

                                                    return (
                                                        <tr key={campaign.campaign_id} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                                                            <td className="px-2 py-1 text-sm text-black text-center border-r border-gray-200">{index + 1}</td>
                                                            <td className="px-2 py-1 text-center border-r border-gray-200">
                                                                <button onClick={() => handleCampaignNameClick(campaign)} className="text-center hover:underline focus:outline-none">
                                                                    <div>
                                                                        <p className="text-sm font-medium text-[#2f3192] underline hover:font-bold transition-colors">
                                                                            {campaign.campaign_name}
                                                                        </p>
                                                                        <p className="text-xs text-black truncate max-w-[200px]">{campaign.description || 'No description'}</p>
                                                                    </div>
                                                                </button>
                                                            </td>
                                                            <td className="px-2 py-1 text-sm text-black text-center border-r border-gray-200">{createdByName}</td>
                                                            <td className="px-2 py-1 text-sm text-black text-center border-r border-gray-200">{campaign.service}</td>
                                                            <td className="px-2 py-1 text-center border-r border-gray-200">
                                                                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${campaign.status === 'active' ? 'text-black' : 'text-black'}`}>
                                                                    {campaign.status === 'active' ? 'Active' : 'Inactive'}
                                                                </span>
                                                            </td>
                                                            <td className="px-2 py-1 text-sm font-medium text-black text-center border-r border-gray-200">{totalCustomers}</td>
                                                            {/* Remaining = totalCustomers − attended; attended is time-filtered, so this is too */}
                                                            <td className="px-2 py-1 text-sm font-medium text-black text-center border-r border-gray-200"><TimeValue>{remaining2}</TimeValue></td>
                                                            <td className="px-2 py-1 text-sm font-medium text-black text-center border-r border-gray-200"><TimeValue>{attended}</TimeValue></td>
                                                            <td className="px-2 py-1 text-sm font-medium text-black text-center border-r border-gray-200"><TimeValue>{wip}</TimeValue></td>
                                                            <td className="px-2 py-1 text-sm font-medium text-black text-center border-r border-gray-200"><TimeValue>{rescheduled}</TimeValue></td>
                                                            <td className="px-2 py-1 text-sm font-medium text-black text-center border-r border-gray-200"><TimeValue>{rejected}</TimeValue></td>
                                                            <td className="px-2 py-1 text-sm font-medium text-black text-center border-r border-gray-200"><TimeValue>{notConnected}</TimeValue></td>
                                                            <td className="px-2 py-1 text-sm font-medium text-black text-center border-r border-gray-200"><TimeValue>{completed}</TimeValue></td>
                                                            <td className="px-2 py-1 text-center border-r border-gray-200">
                                                                <span className={`px-2 py-0.5 rounded-full text-xs font-medium inline-block ${successPercentage >= 70 ? 'bg-green-100 text-black' :
                                                                    successPercentage >= 40 ? 'text-black' : 'text-black'}`}>
                                                                    <TimeValue>{successPercentage}%</TimeValue>
                                                                </span>
                                                            </td>
                                                            {flagOrder.map(flag => (
                                                                <td key={flag} className="px-2 py-1 text-center text-sm text-black border-r border-gray-200">
                                                                    <TimeValue>{flagBreakdown[flag] || 0}</TimeValue>
                                                                </td>
                                                            ))}
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12 text-center">
                                <svg className="w-20 h-20 text-gray-300 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z" />
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20.488 9H15V3.512A9.025 9.025 0 0120.488 9z" />
                                </svg>
                                <h3 className="text-lg font-medium text-black mb-2">No Drive Data</h3>
                                <p className="text-black">There are no drives with follow-up data yet.</p>
                            </div>
                        )}
                    </div>
                )}

                {/* Activity Frequency Tab */}
                {activeTab === 'activity' && (isMasterAdmin || isITAdmin || isBranchAdmin) && shouldLoadTab('activity') && (
                    <div>
                        {/* Campaign Filter Section */}
                        <div className="bg-white rounded-xl shadow-sm border border-gray-200 mb-3 p-4 sm:p-3">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-2">
                                <div>
                                    <h3 className="text-base font-semibold text-black">Drive Filter</h3>
                                    <p className="text-xs text-black mt-1">
                                        Select drives to filter activity statistics
                                    </p>
                                </div>
                                <div className="flex gap-2 max-md:flex-wrap max-sm:w-full">
                                    <button
                                        onClick={selectAllCampaigns}
                                        className="px-3 py-1.5 text-xs bg-gray-100 hover:bg-gray-200 text-black rounded-lg transition-colors"
                                    >
                                        Select All
                                    </button>
                                    <button
                                        onClick={clearCampaignFilters}
                                        className="px-3 py-1.5 text-xs bg-gray-100 hover:bg-gray-200 text-black rounded-lg transition-colors"
                                    >
                                        Clear All
                                    </button>
                                    <button
                                        onClick={() => setShowCampaignFilter(!showCampaignFilter)}
                                        className="px-3 py-1.5 text-xs bg-[#2f3192] text-white rounded-lg hover:bg-[#335478] transition-colors"
                                    >
                                        {showCampaignFilter ? 'Hide Drives' : 'Show Drives'}
                                    </button>
                                </div>
                            </div>

                            {showCampaignFilter && (
                                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 p-3 border border-gray-200 rounded-lg bg-gray-50 max-h-48 overflow-y-auto max-sm:grid-cols-1">
                                    {allCampaigns.map((campaign) => (
                                        <label key={campaign.id} className="flex items-center gap-2 cursor-pointer hover:bg-white p-2 rounded-lg transition-colors">
                                            <input
                                                type="checkbox"
                                                value={campaign.id}
                                                checked={selectedCampaigns.includes(campaign.id)}
                                                onChange={() => handleCampaignFilter(campaign.id)}
                                                className="w-4 h-4 text-[#2f3192] border-gray-300 rounded focus:ring-[#2f3192]"
                                            />
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm text-black truncate" title={campaign.name}>
                                                    {campaign.name}
                                                </p>
                                                <p className="text-xs text-black">{campaign.service}</p>
                                            </div>
                                        </label>
                                    ))}
                                    {allCampaigns.length === 0 && (
                                        <p className="text-sm text-black col-span-full text-center py-4">
                                            No drives available
                                        </p>
                                    )}
                                </div>
                            )}

                            {selectedCampaigns.length > 0 && (
                                <div className="mt-3 flex flex-wrap gap-2">
                                    <span className="text-xs text-black">Selected:</span>
                                    {selectedCampaigns.length > 3 ? (
                                        <span className="text-xs font-medium text-[#2f3192] bg-[#2f3192]/10 px-2 py-0.5 rounded">
                                            {selectedCampaigns.length} drives selected
                                        </span>
                                    ) : (
                                        allCampaigns
                                            .filter(c => selectedCampaigns.includes(c.id))
                                            .map(c => (
                                                <span key={c.id} className="text-xs bg-gray-100 text-black px-2 py-0.5 rounded">
                                                    {c.name.length > 20 ? c.name.substring(0, 17) + '...' : c.name}
                                                </span>
                                            ))
                                    )}
                                </div>
                            )}
                        </div>

                        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                            <div className="p-3 sm:p-4 border-b border-gray-200 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                                <div>
                                    <h3 className="text-base font-semibold text-black">Activity Statistics</h3>
                                </div>
                                <div className="flex flex-wrap gap-2 max-sm:flex-col max-sm:items-stretch max-sm:w-full">
                                    {/* Branch Filter Dropdown */}
                                    {(isMasterAdmin || isITAdmin) && (
                                        <select
                                            value={activitySelectedBranch}
                                            onChange={(e) => setActivitySelectedBranch(e.target.value)}
                                            disabled={activityLoading || !activityStats || activityStats.length === 0}
                                            className="px-2 py-1 border border-gray-300 text-sm rounded-lg focus:outline-none focus:ring-2 focus:ring-[#2f3192] disabled:opacity-50 bg-white text-black max-sm:w-full max-sm:min-w-0"
                                        >
                                            <option value="">All Branches</option>
                                            {activityUniqueBranches.map(branch => (
                                                <option key={branch} value={branch}>{branch}</option>
                                            ))}
                                        </select>
                                    )}

                                    <button
                                        onClick={() => setDetailedView(!detailedView)}
                                        disabled={activityLoading || !activityStats || activityStats.length === 0}
                                        className="px-2 py-1 bg-[#2f3192] text-white text-sm rounded-lg transition-colors flex items-center justify-center gap-2 disabled:opacity-50 whitespace-nowrap max-sm:w-full"
                                    >
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 6v12" />
                                        </svg>
                                        {detailedView ? 'Summary View' : 'Detailed View'}
                                    </button>
                                    {canExport && (
                                        <button
                                            onClick={exportActivityStatsToExcel}
                                            disabled={activityLoading || !activityStats || activityStats.length === 0}
                                            className="export-btn px-2 py-1 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 transition-colors flex items-center justify-center gap-2 disabled:opacity-50 whitespace-nowrap max-sm:w-full"
                                        >
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 8l-4-4m0 0L8 8m4-4v12M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1" />
                                            </svg>
                                            Export to Excel
                                        </button>
                                    )}
                                </div>
                            </div>

                            <div className="relative">
                                <div
                                    ref={activityTopScrollBarRef}
                                    className="hidden sm:block sticky top-0 z-10 bg-gray-50 border-b border-gray-200 overflow-x-auto"
                                    style={{
                                        scrollbarWidth: 'thin',
                                        overflowY: 'hidden',
                                        height: '8px'
                                    }}
                                >
                                    <div style={{ height: '1px' }}></div>
                                </div>

                                <div
                                    ref={activityTableContainerRef}
                                    className="overflow-x-auto scrollbar-thin"
                                    style={{
                                        maxWidth: '100%',
                                        overflowX: 'auto'
                                    }}
                                >
                                    {activityLoading ? (
                                        <div className="flex justify-center py-12">
                                            <div className="w-8 h-8 border-4 border-t-4 border-t-[#2f3192] border-gray-200 rounded-full animate-spin"></div>
                                        </div>
                                    ) : activityStats && activityStats.length > 0 ? (
                                        <>
                                            {detailedView ? (
                                                <table style={{
                                                    tableLayout: 'fixed',
                                                    borderCollapse: 'collapse',
                                                    width: '100%',
                                                    minWidth: '800px'
                                                }}>
                                                    <thead className="bg-gray-50">
                                                        <tr>
                                                            <th style={{ width: '5%', padding: '4px 8px', textAlign: 'center', fontSize: '11px', fontWeight: 'bold', color: 'black', textTransform: 'uppercase', border: '1px solid #E5E7EB', backgroundColor: '#F9FAFB' }}>Sr. No.</th>
                                                            <th
                                                                style={{ width: '25%', padding: '4px 8px', textAlign: 'center', fontSize: '11px', fontWeight: 'bold', color: 'black', textTransform: 'uppercase', border: '1px solid #E5E7EB', cursor: 'pointer', backgroundColor: sortConfig.key === 'activity_name' ? '#E5E7EB' : '#F9FAFB' }}
                                                                onClick={() => requestSort('activity_name')}
                                                                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#F3F4F6'}
                                                                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = sortConfig.key === 'activity_name' ? '#E5E7EB' : '#F9FAFB'}
                                                            >
                                                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px', fontWeight: 'bold' }}>
                                                                    Activity
                                                                    <span style={{ fontSize: '11px', fontWeight: 'bold' }}>
                                                                        {sortConfig.key === 'activity_name' ? (
                                                                            sortConfig.direction === 'asc' ? '↑' : '↓'
                                                                        ) : (
                                                                            '↕'
                                                                        )}
                                                                    </span>
                                                                </div>
                                                            </th>
                                                            <th style={{ width: '20%', padding: '4px 8px', textAlign: 'center', fontSize: '11px', fontWeight: 'bold', color: 'black', textTransform: 'uppercase', border: '1px solid #E5E7EB', backgroundColor: '#F9FAFB' }}><span>Assets From</span> <br /><span>Active Drives</span></th>
                                                            <th style={{ width: '10%', padding: '4px 8px', textAlign: 'center', fontSize: '11px', fontWeight: 'bold', color: 'black', textTransform: 'uppercase', border: '1px solid #E5E7EB', backgroundColor: '#F9FAFB' }}><span>Connected</span><br /><span>Calls</span></th>
                                                            <th
                                                                style={{ width: '10%', padding: '4px 8px', textAlign: 'center', fontSize: '11px', fontWeight: 'bold', color: 'black', textTransform: 'uppercase', border: '1px solid #E5E7EB', cursor: 'pointer', backgroundColor: sortConfig.key === 'total_count' ? '#E5E7EB' : '#F9FAFB' }}
                                                                onClick={() => requestSort('total_count')}
                                                                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#F3F4F6'}
                                                                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = sortConfig.key === 'total_count' ? '#E5E7EB' : '#F9FAFB'}
                                                            >
                                                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px', fontWeight: 'bold' }}>
                                                                    Activity Count
                                                                    <span style={{ fontSize: '11px', fontWeight: 'bold' }}>
                                                                        {sortConfig.key === 'total_count' ? (
                                                                            sortConfig.direction === 'asc' ? '↑' : '↓'
                                                                        ) : (
                                                                            '↕'
                                                                        )}
                                                                    </span>
                                                                </div>
                                                            </th>
                                                            <th style={{ width: '15%', padding: '4px 8px', textAlign: 'center', fontSize: '11px', fontWeight: 'bold', color: 'black', textTransform: 'uppercase', border: '1px solid #E5E7EB', backgroundColor: '#F9FAFB' }}>User Name</th>
                                                            <th style={{ width: '15%', padding: '4px 8px', textAlign: 'center', fontSize: '11px', fontWeight: 'bold', color: 'black', textTransform: 'uppercase', border: '1px solid #E5E7EB', backgroundColor: '#F9FAFB' }}>Branch</th>
                                                            <th style={{ width: '10%', padding: '4px 8px', textAlign: 'center', fontSize: '11px', fontWeight: 'bold', color: 'black', textTransform: 'uppercase', border: '1px solid #E5E7EB', backgroundColor: '#F9FAFB' }}>Individual Count</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody style={{ backgroundColor: 'white' }}>
                                                        {getSortedData(activityStats)
                                                            .map((activity, activityIndex) => {
                                                                // Filter user breakdown by selected branch
                                                                let filteredUsers = activity.user_breakdown || [];
                                                                if (activitySelectedBranch) {
                                                                    filteredUsers = filteredUsers.filter(user =>
                                                                        (user.branch_display || user.branch) === activitySelectedBranch
                                                                    );
                                                                }

                                                                if (filteredUsers.length > 0) {
                                                                    return filteredUsers.map((user, userIndex) => {
                                                                        const serialNo = filteredUsers.slice(0, userIndex).reduce((sum, _, idx) => sum + 1, 0) +
                                                                            getSortedData(activityStats).slice(0, activityIndex).reduce((sum, act) => {
                                                                                let prevUsers = act.user_breakdown || [];
                                                                                if (activitySelectedBranch) {
                                                                                    prevUsers = prevUsers.filter(u =>
                                                                                        (u.branch_display || u.branch) === activitySelectedBranch
                                                                                    );
                                                                                }
                                                                                return sum + (prevUsers.length || 1);
                                                                            }, 0) + 1;

                                                                        return (
                                                                            <tr key={`${activity.activity_id}-${userIndex}`} style={{ backgroundColor: serialNo % 2 === 0 ? '#F9FAFB' : 'white' }}>
                                                                                <td style={{ padding: '4px 8px', fontSize: '12px', color: 'black', textAlign: 'center', border: '1px solid #E5E7EB', wordWrap: 'break-word' }}>
                                                                                    {serialNo}
                                                                                </td>
                                                                                <td style={{ padding: '4px 8px', fontSize: '12px', color: 'black', textAlign: 'left', border: '1px solid #E5E7EB', wordWrap: 'break-word' }}>
                                                                                    {activity.activity_name}
                                                                                </td>
                                                                                <td style={{ padding: '4px 8px', fontSize: '12px', color: 'black', textAlign: 'center', border: '1px solid #E5E7EB', wordWrap: 'break-word' }}>
                                                                                    {campaignTotals?.total_customers || 0}
                                                                                </td>
                                                                                <td style={{ padding: '4px 8px', fontSize: '12px', color: 'black', textAlign: 'center', border: '1px solid #E5E7EB', wordWrap: 'break-word' }}>
                                                                                    <TimeValue>{campaignTotals?.total_followups || 0}</TimeValue>
                                                                                </td>
                                                                                <td style={{ padding: '4px 8px', textAlign: 'center', border: '1px solid #E5E7EB', wordWrap: 'break-word' }}>
                                                                                    <span style={{ padding: '2px 8px', borderRadius: '9999px', fontSize: '12px', fontWeight: '500', backgroundColor: `${themeColor}20`, color: themeColor }}>
                                                                                        <TimeValue>{activity.total_count || 0}</TimeValue>
                                                                                    </span>
                                                                                </td>
                                                                                <td
                                                                                    title={user.user_name || 'N/A'}
                                                                                    style={{
                                                                                        padding: '4px 8px',
                                                                                        fontSize: '12px',
                                                                                        textAlign: 'center',
                                                                                        border: '1px solid #E5E7EB',
                                                                                        maxWidth: '120px',
                                                                                        whiteSpace: 'nowrap',
                                                                                        overflow: 'hidden',
                                                                                        textOverflow: 'ellipsis'
                                                                                    }}
                                                                                >
                                                                                    {user.user_name ? (
                                                                                        <button
                                                                                            onClick={() => handleActivityUserNameClick(user, activity)}
                                                                                            style={{
                                                                                                color: '#2f3192',
                                                                                                textDecoration: 'underline',
                                                                                                background: 'none',
                                                                                                border: 'none',
                                                                                                cursor: 'pointer',
                                                                                                padding: 0,
                                                                                                fontSize: '12px',
                                                                                                fontWeight: 500,
                                                                                                overflow: 'hidden',
                                                                                                textOverflow: 'ellipsis',
                                                                                                maxWidth: '100%',
                                                                                                whiteSpace: 'nowrap'
                                                                                            }}
                                                                                            onMouseEnter={(e) => (e.currentTarget.style.fontWeight = 700)}
                                                                                            onMouseLeave={(e) => (e.currentTarget.style.fontWeight = 500)}
                                                                                        >
                                                                                            {user.user_name}
                                                                                        </button>
                                                                                    ) : 'N/A'}
                                                                                </td>
                                                                                <td style={{ padding: '4px 8px', fontSize: '12px', color: 'black', textAlign: 'center', border: '1px solid #E5E7EB', wordWrap: 'break-word' }}>
                                                                                    {user.branch_display || user.branch || 'N/A'}
                                                                                </td>
                                                                                <td style={{ padding: '4px 8px', fontSize: '12px', fontWeight: '500', textAlign: 'center', border: '1px solid #E5E7EB', color: themeColor, wordWrap: 'break-word' }}>
                                                                                    {user.count}
                                                                                </td>
                                                                            </tr>
                                                                        );
                                                                    });
                                                                } else if (!activity.user_breakdown || activity.user_breakdown.length === 0) {
                                                                    const serialNo = getSortedData(activityStats).slice(0, activityIndex).reduce((sum, act) => {
                                                                        let prevUsers = act.user_breakdown || [];
                                                                        if (activitySelectedBranch) {
                                                                            prevUsers = prevUsers.filter(u =>
                                                                                (u.branch_display || u.branch) === activitySelectedBranch
                                                                            );
                                                                        }
                                                                        return sum + (prevUsers.length || 1);
                                                                    }, 0) + 1;

                                                                    return (
                                                                        <tr key={activity.activity_id} style={{ backgroundColor: serialNo % 2 === 0 ? '#F9FAFB' : 'white' }}>
                                                                            <td style={{ padding: '4px 8px', fontSize: '12px', color: 'black', textAlign: 'center', border: '1px solid #E5E7EB', wordWrap: 'break-word' }}>
                                                                                {serialNo}
                                                                            </td>
                                                                            <td style={{ padding: '4px 8px', fontSize: '12px', color: 'black', textAlign: 'center', border: '1px solid #E5E7EB', wordWrap: 'break-word' }}>
                                                                                {activity.activity_name}
                                                                            </td>
                                                                            <td style={{ padding: '4px 8px', fontSize: '12px', color: 'black', textAlign: 'center', border: '1px solid #E5E7EB', wordWrap: 'break-word' }}>
                                                                                {campaignTotals?.total_customers || 0}
                                                                            </td>
                                                                            <td style={{ padding: '4px 8px', fontSize: '12px', color: 'black', textAlign: 'center', border: '1px solid #E5E7EB', wordWrap: 'break-word' }}>
                                                                                <TimeValue>{campaignTotals?.total_followups || 0}</TimeValue>
                                                                            </td>
                                                                            <td style={{ padding: '4px 8px', textAlign: 'center', border: '1px solid #E5E7EB', wordWrap: 'break-word' }}>
                                                                                <span style={{ padding: '2px 8px', borderRadius: '9999px', fontSize: '12px', fontWeight: '500', backgroundColor: `${themeColor}20`, color: themeColor }}>
                                                                                    <TimeValue>{activity.total_count || 0}</TimeValue>
                                                                                </span>
                                                                            </td>
                                                                            <td style={{ padding: '4px 8px', fontSize: '12px', color: 'black', textAlign: 'center', border: '1px solid #E5E7EB', wordWrap: 'break-word' }}>
                                                                                No data
                                                                            </td>
                                                                            <td style={{ padding: '4px 8px', fontSize: '12px', color: 'black', textAlign: 'center', border: '1px solid #E5E7EB', wordWrap: 'break-word' }}>
                                                                                No data
                                                                            </td>
                                                                            <td style={{ padding: '4px 8px', fontSize: '12px', textAlign: 'center', border: '1px solid #E5E7EB', wordWrap: 'break-word' }}>
                                                                                0
                                                                            </td>
                                                                        </tr>
                                                                    );
                                                                }
                                                                return null;
                                                            })}
                                                    </tbody>
                                                </table>
                                            ) : (
                                                <table style={{
                                                    tableLayout: 'fixed',
                                                    borderCollapse: 'collapse',
                                                    width: '100%',
                                                    minWidth: '700px'
                                                }}>
                                                    <thead className="bg-gray-50">
                                                        <tr>
                                                            <th style={{ width: '5%', padding: '4px 8px', textAlign: 'center', fontSize: '11px', fontWeight: 'bold', color: 'black', textTransform: 'uppercase', border: '1px solid #E5E7EB', backgroundColor: '#F9FAFB' }}>Sr. No.</th>
                                                            <th
                                                                style={{ width: '25%', padding: '4px 8px', textAlign: 'center', fontSize: '11px', fontWeight: 'bold', color: 'black', textTransform: 'uppercase', border: '1px solid #E5E7EB', cursor: 'pointer', backgroundColor: sortConfig.key === 'activity_name' ? '#E5E7EB' : '#F9FAFB' }}
                                                                onClick={() => requestSort('activity_name')}
                                                                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#F3F4F6'}
                                                                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = sortConfig.key === 'activity_name' ? '#E5E7EB' : '#F9FAFB'}
                                                            >
                                                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px', fontWeight: 'bold' }}>
                                                                    Activity
                                                                    <span style={{ fontSize: '11px', fontWeight: 'bold' }}>
                                                                        {sortConfig.key === 'activity_name' ? (
                                                                            sortConfig.direction === 'asc' ? '↑' : '↓'
                                                                        ) : (
                                                                            '↕'
                                                                        )}
                                                                    </span>
                                                                </div>
                                                            </th>
                                                            <th style={{ width: '20%', padding: '4px 8px', textAlign: 'center', fontSize: '11px', fontWeight: 'bold', color: 'black', textTransform: 'uppercase', border: '1px solid #E5E7EB', backgroundColor: '#F9FAFB' }}><span>Assets From</span><br /><span>Active Drives</span></th>
                                                            <th style={{ width: '12%', padding: '4px 8px', textAlign: 'center', fontSize: '11px', fontWeight: 'bold', color: 'black', textTransform: 'uppercase', border: '1px solid #E5E7EB', backgroundColor: '#F9FAFB' }}><span>Connected</span><br /><span>Calls</span></th>
                                                            <th
                                                                style={{ width: '12%', padding: '4px 8px', textAlign: 'center', fontSize: '11px', fontWeight: 'bold', color: 'black', textTransform: 'uppercase', border: '1px solid #E5E7EB', cursor: 'pointer', backgroundColor: sortConfig.key === 'total_count' ? '#E5E7EB' : '#F9FAFB' }}
                                                                onClick={() => requestSort('total_count')}
                                                                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#F3F4F6'}
                                                                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = sortConfig.key === 'total_count' ? '#E5E7EB' : '#F9FAFB'}
                                                            >
                                                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px', fontWeight: 'bold' }}>
                                                                    Total Count
                                                                    <span style={{ fontSize: '11px', fontWeight: 'bold' }}>
                                                                        {sortConfig.key === 'total_count' ? (
                                                                            sortConfig.direction === 'asc' ? '↑' : '↓'
                                                                        ) : (
                                                                            '↕'
                                                                        )}
                                                                    </span>
                                                                </div>
                                                            </th>
                                                            <th style={{ width: '26%', padding: '4px 8px', textAlign: 'center', fontSize: '11px', fontWeight: 'bold', color: 'black', textTransform: 'uppercase', border: '1px solid #E5E7EB', backgroundColor: '#F9FAFB' }}>Branch Breakdown</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody style={{ backgroundColor: 'white' }}>
                                                        {getSortedData(activityStats)
                                                            .filter(activity => {
                                                                // Filter activities based on selected branch
                                                                if (!activitySelectedBranch) return true;
                                                                if (!activity.user_breakdown) return false;
                                                                return activity.user_breakdown.some(user =>
                                                                    (user.branch_display || user.branch) === activitySelectedBranch
                                                                );
                                                            })
                                                            .map((activity, index) => {
                                                                const isExpanded = expandedActivities[activity.activity_id];
                                                                const serialNo = index + 1;

                                                                const branchMap = new Map();
                                                                if (activity.user_breakdown && activity.user_breakdown.length > 0) {
                                                                    activity.user_breakdown.forEach(user => {
                                                                        const branchName = user.branch_display || user.branch;
                                                                        // Apply branch filter
                                                                        if (!activitySelectedBranch || branchName === activitySelectedBranch) {
                                                                            if (branchMap.has(branchName)) {
                                                                                branchMap.set(branchName, branchMap.get(branchName) + user.count);
                                                                            } else {
                                                                                branchMap.set(branchName, user.count);
                                                                            }
                                                                        }
                                                                    });
                                                                }
                                                                const branchBreakdown = Array.from(branchMap, ([branch, count]) => ({ branch, count }));

                                                                if (branchBreakdown.length === 0 && activitySelectedBranch) {
                                                                    return null;
                                                                }

                                                                return (
                                                                    <React.Fragment key={activity.activity_id}>
                                                                        <tr style={{ backgroundColor: index % 2 === 0 ? 'white' : '#F9FAFB' }}>
                                                                            <td style={{ padding: '4px 8px', fontSize: '12px', color: 'black', textAlign: 'center', border: '1px solid #E5E7EB', wordWrap: 'break-word' }}>
                                                                                {serialNo}
                                                                            </td>
                                                                            <td
                                                                                style={{
                                                                                    padding: '4px 8px',
                                                                                    fontSize: '12px',
                                                                                    fontWeight: '500',
                                                                                    color: 'black',
                                                                                    textAlign: 'left',
                                                                                    border: '1px solid #E5E7EB',
                                                                                    maxWidth: '200px'
                                                                                }}
                                                                            >
                                                                                <div
                                                                                    style={{
                                                                                        display: 'flex',
                                                                                        alignItems: 'center',
                                                                                        justifyContent: 'space-between',
                                                                                        width: '100%'
                                                                                    }}
                                                                                >
                                                                                    {/* Left Text with ellipsis + tooltip */}
                                                                                    <span
                                                                                        title={activity.activity_name}
                                                                                        style={{
                                                                                            overflow: 'hidden',
                                                                                            textOverflow: 'ellipsis',
                                                                                            whiteSpace: 'nowrap'
                                                                                        }}
                                                                                    >
                                                                                        {activity.activity_name}
                                                                                    </span>

                                                                                    {/* Right Icon - Hide for Branch Admin */}
                                                                                    {!isBranchAdmin && branchBreakdown && branchBreakdown.length > 0 && (
                                                                                        <button
                                                                                            onClick={() => toggleActivityExpand(activity.activity_id)}
                                                                                            style={{
                                                                                                padding: '2px',
                                                                                                background: 'transparent',
                                                                                                border: 'none',
                                                                                                cursor: 'pointer',
                                                                                                borderRadius: '4px',
                                                                                                marginLeft: '8px'
                                                                                            }}
                                                                                            onMouseEnter={(e) =>
                                                                                                (e.currentTarget.style.backgroundColor = '#F3F4F6')
                                                                                            }
                                                                                            onMouseLeave={(e) =>
                                                                                                (e.currentTarget.style.backgroundColor = 'transparent')
                                                                                            }
                                                                                        >
                                                                                            <svg
                                                                                                style={{
                                                                                                    width: '14px',
                                                                                                    height: '14px',
                                                                                                    transition: 'transform 0.2s',
                                                                                                    transform: isExpanded ? 'rotate(90deg)' : 'none'
                                                                                                }}
                                                                                                fill="none"
                                                                                                stroke="currentColor"
                                                                                                viewBox="0 0 24 24"
                                                                                            >
                                                                                                <path
                                                                                                    strokeLinecap="round"
                                                                                                    strokeLinejoin="round"
                                                                                                    strokeWidth={2}
                                                                                                    d="M9 5l7 7-7 7"
                                                                                                />
                                                                                            </svg>
                                                                                        </button>
                                                                                    )}
                                                                                </div>
                                                                            </td>
                                                                            <td style={{ padding: '4px 8px', fontSize: '12px', color: 'black', textAlign: 'center', border: '1px solid #E5E7EB', wordWrap: 'break-word' }}>
                                                                                {campaignTotals?.total_customers || 0}
                                                                            </td>
                                                                            <td style={{ padding: '4px 8px', fontSize: '12px', color: 'black', textAlign: 'center', border: '1px solid #E5E7EB', wordWrap: 'break-word' }}>
                                                                                <TimeValue>{campaignTotals?.total_followups || 0}</TimeValue>
                                                                            </td>
                                                                            <td style={{ padding: '4px 8px', textAlign: 'center', border: '1px solid #E5E7EB', wordWrap: 'break-word' }}>
                                                                                <span style={{ padding: '2px 8px', borderRadius: '9999px', fontSize: '12px', fontWeight: '500', backgroundColor: `${themeColor}20`, color: themeColor }}>
                                                                                    <TimeValue>{activity.total_count || 0}</TimeValue>
                                                                                </span>
                                                                            </td>
                                                                            <td style={{ padding: '4px 8px', textAlign: 'center', border: '1px solid #E5E7EB', wordWrap: 'break-word' }}>
                                                                                {branchBreakdown && branchBreakdown.length > 0 ? (
                                                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                                                                        {branchBreakdown.slice(0, isExpanded ? undefined : 1).map((branch, idx) => (
                                                                                            <div key={idx} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '12px', paddingBottom: '3px', borderBottom: '1px solid #F3F4F6' }}>
                                                                                                <div style={{ flex: 1, minWidth: 0 }}>
                                                                                                    <span style={{ fontWeight: '500', color: 'black' }}>{branch.branch}</span>
                                                                                                </div>
                                                                                                <span style={{ fontWeight: '500', marginLeft: '10px', color: themeColor }}>
                                                                                                    {branch.count}
                                                                                                </span>
                                                                                            </div>
                                                                                        ))}
                                                                                        {branchBreakdown.length > 1 && !isExpanded && (
                                                                                            <button
                                                                                                onClick={() => toggleActivityExpand(activity.activity_id)}
                                                                                                style={{ fontSize: '11px', color: '#2f3192', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', marginTop: '2px' }}
                                                                                            >
                                                                                                Show {branchBreakdown.length - 1} more...
                                                                                            </button>
                                                                                        )}
                                                                                        {branchBreakdown.length > 1 && isExpanded && (
                                                                                            <button
                                                                                                onClick={() => toggleActivityExpand(activity.activity_id)}
                                                                                                style={{ fontSize: '11px', color: '#2f3192', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', marginTop: '2px' }}
                                                                                            >
                                                                                                Show less
                                                                                            </button>
                                                                                        )}
                                                                                    </div>
                                                                                ) : (
                                                                                    <span style={{ fontSize: '12px', color: 'black' }}>No breakdown data</span>
                                                                                )}
                                                                            </td>
                                                                        </tr>
                                                                    </React.Fragment>
                                                                );
                                                            })}
                                                    </tbody>
                                                </table>
                                            )}
                                        </>
                                    ) : (
                                        <div className="text-center py-12">
                                            <svg className="w-16 h-16 text-black mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                                            </svg>
                                            <p className="text-black text-sm">
                                                {selectedCampaigns.length > 0
                                                    ? 'No activity data available for selected drives.'
                                                    : 'No activity data available for this time period. Select drives to filter data.'}
                                            </p>
                                            {selectedCampaigns.length > 0 && (
                                                <button
                                                    onClick={clearCampaignFilters}
                                                    className="mt-4 px-4 py-2 bg-[#2f3192] text-white rounded-lg hover:bg-[#335478] transition-colors text-sm"
                                                >
                                                    Clear Filters
                                                </button>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Rejected Reasons Tab */}
                {activeTab === 'rejected-reason' && (isMasterAdmin || isITAdmin || isBranchAdmin) && shouldLoadTab('rejected-reason') && (
                    <div>
                        <div className="bg-white rounded-xl shadow-sm border border-gray-200 mb-3 p-4 sm:p-3">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                                <div>
                                    <h3 className="text-base font-semibold text-black">Drive Filter</h3>
                                    <p className="text-xs text-black mt-1">
                                        Select drives to filter rejected reason statistics
                                    </p>
                                </div>
                                <div className="flex gap-2 max-md:flex-wrap max-sm:w-full">
                                    <button
                                        onClick={selectAllCampaigns}
                                        className="px-3 py-1.5 text-xs bg-gray-100 hover:bg-gray-200 text-black rounded-lg transition-colors"
                                    >
                                        Select All
                                    </button>
                                    <button
                                        onClick={clearCampaignFilters}
                                        className="px-3 py-1.5 text-xs bg-gray-100 hover:bg-gray-200 text-black rounded-lg transition-colors"
                                    >
                                        Clear All
                                    </button>
                                    <button
                                        onClick={() => setShowCampaignFilter(!showCampaignFilter)}
                                        className="px-3 py-1.5 text-xs bg-[#2f3192] text-white rounded-lg hover:bg-[#335478] transition-colors"
                                    >
                                        {showCampaignFilter ? 'Hide Drives' : 'Show Drives'}
                                    </button>
                                </div>
                            </div>

                            {showCampaignFilter && (
                                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 p-3 border border-gray-200 rounded-lg bg-gray-50 max-h-48 overflow-y-auto max-sm:grid-cols-1">
                                    {allCampaigns.map((campaign) => (
                                        <label key={campaign.id} className="flex items-center gap-2 cursor-pointer hover:bg-white p-2 rounded-lg transition-colors">
                                            <input
                                                type="checkbox"
                                                value={campaign.id}
                                                checked={selectedCampaigns.includes(campaign.id)}
                                                onChange={() => handleCampaignFilter(campaign.id)}
                                                className="w-4 h-4 text-[#2f3192] border-gray-300 rounded focus:ring-[#2f3192]"
                                            />
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm text-black truncate" title={campaign.name}>
                                                    {campaign.name}
                                                </p>
                                                <p className="text-xs text-black">{campaign.service}</p>
                                            </div>
                                        </label>
                                    ))}
                                    {allCampaigns.length === 0 && (
                                        <p className="text-sm text-black col-span-full text-center py-4">
                                            No drives available
                                        </p>
                                    )}
                                </div>
                            )}

                            {selectedCampaigns.length > 0 && (
                                <div className="mt-3 flex flex-wrap gap-2">
                                    <span className="text-xs text-black">Selected:</span>
                                    {selectedCampaigns.length > 3 ? (
                                        <span className="text-xs font-medium text-[#2f3192] bg-[#2f3192]/10 px-2 py-0.5 rounded">
                                            {selectedCampaigns.length} drives selected
                                        </span>
                                    ) : (
                                        allCampaigns
                                            .filter(c => selectedCampaigns.includes(c.id))
                                            .map(c => (
                                                <span key={c.id} className="text-xs bg-gray-100 text-black px-2 py-0.5 rounded">
                                                    {c.name.length > 20 ? c.name.substring(0, 17) + '...' : c.name}
                                                </span>
                                            ))
                                    )}
                                </div>
                            )}
                        </div>
                        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                            <div className="p-3 sm:p-4 border-b border-gray-200 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                                <div>
                                    <h3 className="text-base font-semibold text-black">Rejected Reasons Statistics</h3>
                                </div>
                                <div className="flex flex-wrap gap-2 max-sm:flex-col max-sm:items-stretch max-sm:w-full">
                                    {/* Branch Filter Dropdown */}
                                    {(isMasterAdmin || isITAdmin) && (
                                        <select
                                            value={rrSelectedBranch}
                                            onChange={(e) => setRrSelectedBranch(e.target.value)}
                                            disabled={rrLoading || !rrStats || rrStats.length === 0}
                                            className="px-2 py-1 border border-gray-300 text-sm rounded-lg focus:outline-none focus:ring-2 focus:ring-[#2f3192] disabled:opacity-50 bg-white text-black max-sm:w-full max-sm:min-w-0"
                                        >
                                            <option value="">All Branches</option>
                                            {rrUniqueBranches.map(branch => (
                                                <option key={branch} value={branch}>{branch}</option>
                                            ))}
                                        </select>
                                    )}

                                    <button
                                        onClick={() => setRrDetailedView(!rrDetailedView)}
                                        disabled={rrLoading || !rrStats || rrStats.length === 0}
                                        className="px-2 py-1 bg-[#2f3192] text-white text-sm rounded-lg transition-colors flex items-center justify-center gap-2 disabled:opacity-50 whitespace-nowrap max-sm:w-full"
                                    >
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 6v12" />
                                        </svg>
                                        {rrDetailedView ? 'Summary View' : 'Detailed View'}
                                    </button>
                                    {canExport && (
                                        <button
                                            onClick={exportRrStatsToExcel}
                                            disabled={rrLoading || !rrStats || rrStats.length === 0}
                                            className="export-btn px-2 py-1 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 transition-colors flex items-center justify-center gap-2 disabled:opacity-50 whitespace-nowrap max-sm:w-full"
                                        >
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 8l-4-4m0 0L8 8m4-4v12M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1" />
                                            </svg>
                                            Export to Excel
                                        </button>
                                    )}
                                </div>
                            </div>

                            <div className="relative">
                                <div
                                    ref={topScrollBarRef}
                                    className="hidden sm:block sticky top-0 z-10 bg-gray-50 border-b border-gray-200 overflow-x-auto"
                                    style={{
                                        scrollbarWidth: 'thin',
                                        overflowY: 'hidden',
                                        height: '8px'
                                    }}
                                >
                                    <div style={{ height: '1px' }}></div>
                                </div>

                                <div
                                    ref={tableContainerRef}
                                    className="overflow-x-auto scrollbar-thin"
                                    style={{
                                        maxWidth: '100%',
                                        overflowX: 'auto'
                                    }}
                                >
                                    {rrLoading ? (
                                        <div className="flex justify-center py-12">
                                            <div className="w-8 h-8 border-4 border-t-4 border-t-[#2f3192] border-gray-200 rounded-full animate-spin"></div>
                                        </div>
                                    ) : rrStats && rrStats.length > 0 ? (
                                        <>
                                            {rrDetailedView ? (
                                                <table style={{
                                                    tableLayout: 'fixed',
                                                    borderCollapse: 'collapse',
                                                    width: '100%',
                                                    minWidth: '800px'
                                                }}>
                                                    <thead className="bg-gray-50">
                                                        <tr>
                                                            <th style={{ width: '5%', padding: '4px 8px', textAlign: 'center', fontSize: '11px', fontWeight: 'bold', color: 'black', textTransform: 'uppercase', border: '1px solid #E5E7EB', backgroundColor: '#F9FAFB' }}>Sr. No.</th>
                                                            <th
                                                                style={{ width: '25%', padding: '4px 8px', textAlign: 'center', fontSize: '11px', fontWeight: 'bold', color: 'black', textTransform: 'uppercase', border: '1px solid #E5E7EB', cursor: 'pointer', backgroundColor: rrSortConfig.key === 'rr_name' ? '#E5E7EB' : '#F9FAFB' }}
                                                                onClick={() => requestRrSort('rr_name')}
                                                                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#F3F4F6'}
                                                                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = rrSortConfig.key === 'rr_name' ? '#E5E7EB' : '#F9FAFB'}
                                                            >
                                                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px', fontWeight: 'bold' }}>
                                                                    Rejected Reason
                                                                    <span style={{ fontSize: '11px', fontWeight: 'bold' }}>
                                                                        {rrSortConfig.key === 'rr_name' ? (
                                                                            rrSortConfig.direction === 'asc' ? '↑' : '↓'
                                                                        ) : (
                                                                            '↕'
                                                                        )}
                                                                    </span>
                                                                </div>
                                                            </th>
                                                            <th style={{ width: '15%', padding: '4px 8px', textAlign: 'center', fontSize: '11px', fontWeight: 'bold', color: 'black', textTransform: 'uppercase', border: '1px solid #E5E7EB', backgroundColor: '#F9FAFB' }}><span>Assets From</span> <br /><span>Active Drives </span></th>
                                                            <th style={{ width: '10%', padding: '4px 8px', textAlign: 'center', fontSize: '11px', fontWeight: 'bold', color: 'black', textTransform: 'uppercase', border: '1px solid #E5E7EB', backgroundColor: '#F9FAFB' }}><span>Connected</span><br /><span>Calls</span></th>
                                                            <th
                                                                style={{ width: '10%', padding: '4px 8px', textAlign: 'center', fontSize: '11px', fontWeight: 'bold', color: 'black', textTransform: 'uppercase', border: '1px solid #E5E7EB', cursor: 'pointer', backgroundColor: rrSortConfig.key === 'total_count' ? '#E5E7EB' : '#F9FAFB' }}
                                                                onClick={() => requestRrSort('total_count')}
                                                                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#F3F4F6'}
                                                                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = rrSortConfig.key === 'total_count' ? '#E5E7EB' : '#F9FAFB'}
                                                            >
                                                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px', fontWeight: 'bold' }}>
                                                                    Total Count
                                                                    <span style={{ fontSize: '11px', fontWeight: 'bold' }}>
                                                                        {rrSortConfig.key === 'total_count' ? (
                                                                            rrSortConfig.direction === 'asc' ? '↑' : '↓'
                                                                        ) : (
                                                                            '↕'
                                                                        )}
                                                                    </span>
                                                                </div>
                                                            </th>
                                                            <th style={{ width: '15%', padding: '4px 8px', textAlign: 'center', fontSize: '11px', fontWeight: 'bold', color: 'black', textTransform: 'uppercase', border: '1px solid #E5E7EB', backgroundColor: '#F9FAFB' }}>User Name</th>
                                                            <th style={{ width: '10%', padding: '4px 8px', textAlign: 'center', fontSize: '11px', fontWeight: 'bold', color: 'black', textTransform: 'uppercase', border: '1px solid #E5E7EB', backgroundColor: '#F9FAFB' }}>Branch</th>
                                                            <th style={{ width: '10%', padding: '4px 8px', textAlign: 'center', fontSize: '11px', fontWeight: 'bold', color: 'black', textTransform: 'uppercase', border: '1px solid #E5E7EB', backgroundColor: '#F9FAFB' }}>Individual Count</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody style={{ backgroundColor: 'white' }}>
                                                        {getSortedRrData(rrStats)
                                                            .map((reason, reasonIndex) => {
                                                                // Filter user breakdown by selected branch
                                                                let filteredUsers = reason.user_breakdown || [];
                                                                if (rrSelectedBranch) {
                                                                    filteredUsers = filteredUsers.filter(user =>
                                                                        (user.branch_display || user.branch) === rrSelectedBranch
                                                                    );
                                                                }

                                                                if (filteredUsers.length > 0) {
                                                                    return filteredUsers.map((user, userIndex) => {
                                                                        const serialNo = filteredUsers.slice(0, userIndex).reduce((sum, _, idx) => sum + 1, 0) +
                                                                            getSortedRrData(rrStats).slice(0, reasonIndex).reduce((sum, r) => {
                                                                                let prevUsers = r.user_breakdown || [];
                                                                                if (rrSelectedBranch) {
                                                                                    prevUsers = prevUsers.filter(u =>
                                                                                        (u.branch_display || u.branch) === rrSelectedBranch
                                                                                    );
                                                                                }
                                                                                return sum + (prevUsers.length || 1);
                                                                            }, 0) + 1;

                                                                        return (
                                                                            <tr key={`${reason.rr_id}-${userIndex}`} style={{ backgroundColor: serialNo % 2 === 0 ? '#F9FAFB' : 'white' }}>
                                                                                <td style={{ padding: '4px 8px', fontSize: '12px', color: 'black', textAlign: 'center', border: '1px solid #E5E7EB', wordWrap: 'break-word' }}>
                                                                                    {serialNo}
                                                                                </td>
                                                                                <td style={{ padding: '4px 8px', fontSize: '12px', color: 'black', textAlign: 'left', border: '1px solid #E5E7EB', wordWrap: 'break-word' }}>
                                                                                    {reason.rr_name}
                                                                                </td>
                                                                                <td style={{ padding: '4px 8px', fontSize: '12px', color: 'black', textAlign: 'center', border: '1px solid #E5E7EB', wordWrap: 'break-word' }}>
                                                                                    {rrCampaignTotals?.total_customers || 0}
                                                                                </td>
                                                                                <td style={{ padding: '4px 8px', fontSize: '12px', color: 'black', textAlign: 'center', border: '1px solid #E5E7EB', wordWrap: 'break-word' }}>
                                                                                    <TimeValue>{rrCampaignTotals?.total_followups || 0}</TimeValue>
                                                                                </td>
                                                                                <td style={{ padding: '4px 8px', textAlign: 'center', border: '1px solid #E5E7EB', wordWrap: 'break-word' }}>
                                                                                    <span style={{ padding: '2px 8px', borderRadius: '9999px', fontSize: '12px', fontWeight: '500', backgroundColor: `${themeColor}20`, color: themeColor }}>
                                                                                        <TimeValue>{reason.total_count || 0}</TimeValue>
                                                                                    </span>
                                                                                </td>
                                                                                <td
                                                                                    title={user.user_name || 'N/A'}
                                                                                    style={{
                                                                                        padding: '4px 8px',
                                                                                        fontSize: '12px',
                                                                                        textAlign: 'center',
                                                                                        border: '1px solid #E5E7EB',
                                                                                        maxWidth: '120px',
                                                                                        whiteSpace: 'nowrap',
                                                                                        overflow: 'hidden',
                                                                                        textOverflow: 'ellipsis'
                                                                                    }}
                                                                                >
                                                                                    {user.user_name ? (
                                                                                        <button
                                                                                            onClick={() => handleRRUserNameClick(user, reason)}
                                                                                            style={{
                                                                                                color: '#2f3192',
                                                                                                textDecoration: 'underline',
                                                                                                background: 'none',
                                                                                                border: 'none',
                                                                                                cursor: 'pointer',
                                                                                                padding: 0,
                                                                                                fontSize: '12px',
                                                                                                fontWeight: 500,
                                                                                                overflow: 'hidden',
                                                                                                textOverflow: 'ellipsis',
                                                                                                maxWidth: '100%',
                                                                                                whiteSpace: 'nowrap'
                                                                                            }}
                                                                                            onMouseEnter={(e) => (e.currentTarget.style.fontWeight = 700)}
                                                                                            onMouseLeave={(e) => (e.currentTarget.style.fontWeight = 500)}
                                                                                        >
                                                                                            {user.user_name}
                                                                                        </button>
                                                                                    ) : 'N/A'}
                                                                                </td>
                                                                                <td style={{ padding: '4px 8px', fontSize: '12px', color: 'black', textAlign: 'center', border: '1px solid #E5E7EB', wordWrap: 'break-word' }}>
                                                                                    {user.branch_display || user.branch || 'N/A'}
                                                                                </td>
                                                                                <td style={{ padding: '4px 8px', fontSize: '12px', fontWeight: '500', textAlign: 'center', border: '1px solid #E5E7EB', color: themeColor, wordWrap: 'break-word' }}>
                                                                                    {user.count}
                                                                                </td>
                                                                            </tr>
                                                                        );
                                                                    });
                                                                } else if (!reason.user_breakdown || reason.user_breakdown.length === 0) {
                                                                    const serialNo = getSortedRrData(rrStats).slice(0, reasonIndex).reduce((sum, r) => {
                                                                        let prevUsers = r.user_breakdown || [];
                                                                        if (rrSelectedBranch) {
                                                                            prevUsers = prevUsers.filter(u =>
                                                                                (u.branch_display || u.branch) === rrSelectedBranch
                                                                            );
                                                                        }
                                                                        return sum + (prevUsers.length || 1);
                                                                    }, 0) + 1;

                                                                    return (
                                                                        <tr key={reason.rr_id} style={{ backgroundColor: serialNo % 2 === 0 ? '#F9FAFB' : 'white' }}>
                                                                            <td style={{ padding: '4px 8px', fontSize: '12px', color: 'black', textAlign: 'center', border: '1px solid #E5E7EB', wordWrap: 'break-word' }}>
                                                                                {serialNo}
                                                                            </td>
                                                                            <td style={{ padding: '4px 8px', fontSize: '12px', color: 'black', textAlign: 'center', border: '1px solid #E5E7EB', wordWrap: 'break-word' }}>
                                                                                {reason.rr_name}
                                                                            </td>
                                                                            <td style={{ padding: '4px 8px', fontSize: '12px', color: 'black', textAlign: 'center', border: '1px solid #E5E7EB', wordWrap: 'break-word' }}>
                                                                                {rrCampaignTotals?.total_customers || 0}
                                                                            </td>
                                                                            <td style={{ padding: '4px 8px', fontSize: '12px', color: 'black', textAlign: 'center', border: '1px solid #E5E7EB', wordWrap: 'break-word' }}>
                                                                                <TimeValue>{rrCampaignTotals?.total_followups || 0}</TimeValue>
                                                                            </td>
                                                                            <td style={{ padding: '4px 8px', textAlign: 'center', border: '1px solid #E5E7EB', wordWrap: 'break-word' }}>
                                                                                <span style={{ padding: '2px 8px', borderRadius: '9999px', fontSize: '12px', fontWeight: '500', backgroundColor: `${themeColor}20`, color: themeColor }}>
                                                                                    <TimeValue>{reason.total_count || 0}</TimeValue>
                                                                                </span>
                                                                            </td>
                                                                            <td style={{ padding: '4px 8px', fontSize: '12px', color: 'black', textAlign: 'center', border: '1px solid #E5E7EB', wordWrap: 'break-word' }}>
                                                                                No data
                                                                            </td>
                                                                            <td style={{ padding: '4px 8px', fontSize: '12px', color: 'black', textAlign: 'center', border: '1px solid #E5E7EB', wordWrap: 'break-word' }}>
                                                                                No data
                                                                            </td>
                                                                            <td style={{ padding: '4px 8px', fontSize: '12px', textAlign: 'center', border: '1px solid #E5E7EB', wordWrap: 'break-word' }}>
                                                                                0
                                                                            </td>
                                                                        </tr>
                                                                    );
                                                                }
                                                                return null;
                                                            })}
                                                    </tbody>
                                                </table>
                                            ) : (
                                                <table style={{
                                                    tableLayout: 'fixed',
                                                    borderCollapse: 'collapse',
                                                    width: '100%',
                                                    minWidth: '700px'
                                                }}>
                                                    <thead className="bg-gray-50">
                                                        <tr>
                                                            <th style={{ width: '5%', padding: '4px 8px', textAlign: 'center', fontSize: '11px', fontWeight: 'bold', color: 'black', textTransform: 'uppercase', border: '1px solid #E5E7EB', backgroundColor: '#F9FAFB' }}>Sr. No.</th>
                                                            <th
                                                                style={{ width: '25%', padding: '4px 8px', textAlign: 'center', fontSize: '11px', fontWeight: 'bold', color: 'black', textTransform: 'uppercase', border: '1px solid #E5E7EB', cursor: 'pointer', backgroundColor: rrSortConfig.key === 'rr_name' ? '#E5E7EB' : '#F9FAFB' }}
                                                                onClick={() => requestRrSort('rr_name')}
                                                                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#F3F4F6'}
                                                                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = rrSortConfig.key === 'rr_name' ? '#E5E7EB' : '#F9FAFB'}
                                                            >
                                                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px', fontWeight: 'bold' }}>
                                                                    Rejected Reason
                                                                    <span style={{ fontSize: '11px', fontWeight: 'bold' }}>
                                                                        {rrSortConfig.key === 'rr_name' ? (
                                                                            rrSortConfig.direction === 'asc' ? '↑' : '↓'
                                                                        ) : (
                                                                            '↕'
                                                                        )}
                                                                    </span>
                                                                </div>
                                                            </th>
                                                            <th style={{ width: '20%', padding: '4px 8px', textAlign: 'center', fontSize: '11px', fontWeight: 'bold', color: 'black', textTransform: 'uppercase', border: '1px solid #E5E7EB', backgroundColor: '#F9FAFB' }}><span>Assets From</span><br /><span>Active Drives</span></th>
                                                            <th style={{ width: '12%', padding: '4px 8px', textAlign: 'center', fontSize: '11px', fontWeight: 'bold', color: 'black', textTransform: 'uppercase', border: '1px solid #E5E7EB', backgroundColor: '#F9FAFB' }}><span>Connected</span><br /><span>Calls</span></th>
                                                            <th
                                                                style={{ width: '12%', padding: '4px 8px', textAlign: 'center', fontSize: '11px', fontWeight: 'bold', color: 'black', textTransform: 'uppercase', border: '1px solid #E5E7EB', cursor: 'pointer', backgroundColor: rrSortConfig.key === 'total_count' ? '#E5E7EB' : '#F9FAFB' }}
                                                                onClick={() => requestRrSort('total_count')}
                                                                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#F3F4F6'}
                                                                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = rrSortConfig.key === 'total_count' ? '#E5E7EB' : '#F9FAFB'}
                                                            >
                                                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px', fontWeight: 'bold' }}>
                                                                    Total Count
                                                                    <span style={{ fontSize: '11px', fontWeight: 'bold' }}>
                                                                        {rrSortConfig.key === 'total_count' ? (
                                                                            rrSortConfig.direction === 'asc' ? '↑' : '↓'
                                                                        ) : (
                                                                            '↕'
                                                                        )}
                                                                    </span>
                                                                </div>
                                                            </th>
                                                            <th style={{ width: '26%', padding: '4px 8px', textAlign: 'center', fontSize: '11px', fontWeight: 'bold', color: 'black', textTransform: 'uppercase', border: '1px solid #E5E7EB', backgroundColor: '#F9FAFB' }}>Branch Breakdown</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody style={{ backgroundColor: 'white' }}>
                                                        {getSortedRrData(rrStats)
                                                            .filter(reason => {
                                                                // Filter reasons based on selected branch
                                                                if (!rrSelectedBranch) return true;
                                                                if (!reason.user_breakdown) return false;
                                                                return reason.user_breakdown.some(user =>
                                                                    (user.branch_display || user.branch) === rrSelectedBranch
                                                                );
                                                            })
                                                            .map((reason, index) => {
                                                                const isExpanded = expandedReasons[reason.rr_id];
                                                                const serialNo = index + 1;

                                                                const branchMap = new Map();
                                                                if (reason.user_breakdown && reason.user_breakdown.length > 0) {
                                                                    reason.user_breakdown.forEach(user => {
                                                                        const branchName = user.branch_display || user.branch;
                                                                        // Apply branch filter
                                                                        if (!rrSelectedBranch || branchName === rrSelectedBranch) {
                                                                            if (branchMap.has(branchName)) {
                                                                                branchMap.set(branchName, branchMap.get(branchName) + user.count);
                                                                            } else {
                                                                                branchMap.set(branchName, user.count);
                                                                            }
                                                                        }
                                                                    });
                                                                }
                                                                const branchBreakdown = Array.from(branchMap, ([branch, count]) => ({ branch, count }));

                                                                if (branchBreakdown.length === 0 && rrSelectedBranch) {
                                                                    return null;
                                                                }

                                                                return (
                                                                    <React.Fragment key={reason.rr_id}>
                                                                        <tr style={{ backgroundColor: index % 2 === 0 ? 'white' : '#F9FAFB' }}>
                                                                            <td style={{ padding: '4px 8px', fontSize: '12px', color: 'black', textAlign: 'center', border: '1px solid #E5E7EB', wordWrap: 'break-word' }}>
                                                                                {serialNo}
                                                                            </td>
                                                                            <td
                                                                                style={{
                                                                                    padding: '4px 8px',
                                                                                    fontSize: '12px',
                                                                                    fontWeight: '500',
                                                                                    color: 'black',
                                                                                    textAlign: 'left',
                                                                                    border: '1px solid #E5E7EB',
                                                                                    maxWidth: '200px'
                                                                                }}
                                                                            >
                                                                                <div
                                                                                    style={{
                                                                                        display: 'flex',
                                                                                        alignItems: 'center',
                                                                                        justifyContent: 'space-between',
                                                                                        width: '100%'
                                                                                    }}
                                                                                >
                                                                                    {/* Left Text with ellipsis */}
                                                                                    <span
                                                                                        title={reason.rr_name}
                                                                                        style={{
                                                                                            overflow: 'hidden',
                                                                                            textOverflow: 'ellipsis',
                                                                                            whiteSpace: 'nowrap'
                                                                                        }}
                                                                                    >
                                                                                        {reason.rr_name}
                                                                                    </span>

                                                                                    {/* Right Icon - Hide for Branch Admin */}
                                                                                    {!isBranchAdmin && branchBreakdown && branchBreakdown.length > 0 && (
                                                                                        <button
                                                                                            onClick={() => toggleReasonExpand(reason.rr_id)}
                                                                                            style={{
                                                                                                padding: '2px',
                                                                                                background: 'transparent',
                                                                                                border: 'none',
                                                                                                cursor: 'pointer',
                                                                                                borderRadius: '4px',
                                                                                                marginLeft: '8px'
                                                                                            }}
                                                                                            onMouseEnter={(e) =>
                                                                                                (e.currentTarget.style.backgroundColor = '#F3F4F6')
                                                                                            }
                                                                                            onMouseLeave={(e) =>
                                                                                                (e.currentTarget.style.backgroundColor = 'transparent')
                                                                                            }
                                                                                        >
                                                                                            <svg
                                                                                                style={{
                                                                                                    width: '14px',
                                                                                                    height: '14px',
                                                                                                    transition: 'transform 0.2s',
                                                                                                    transform: isExpanded ? 'rotate(90deg)' : 'none'
                                                                                                }}
                                                                                                fill="none"
                                                                                                stroke="currentColor"
                                                                                                viewBox="0 0 24 24"
                                                                                            >
                                                                                                <path
                                                                                                    strokeLinecap="round"
                                                                                                    strokeLinejoin="round"
                                                                                                    strokeWidth={2}
                                                                                                    d="M9 5l7 7-7 7"
                                                                                                />
                                                                                            </svg>
                                                                                        </button>
                                                                                    )}
                                                                                </div>
                                                                            </td>
                                                                            <td style={{ padding: '4px 8px', fontSize: '12px', color: 'black', textAlign: 'center', border: '1px solid #E5E7EB', wordWrap: 'break-word' }}>
                                                                                {rrCampaignTotals?.total_customers || 0}
                                                                            </td>
                                                                            <td style={{ padding: '4px 8px', fontSize: '12px', color: 'black', textAlign: 'center', border: '1px solid #E5E7EB', wordWrap: 'break-word' }}>
                                                                                <TimeValue>{rrCampaignTotals?.total_followups || 0}</TimeValue>
                                                                            </td>
                                                                            <td style={{ padding: '4px 8px', textAlign: 'center', border: '1px solid #E5E7EB', wordWrap: 'break-word' }}>
                                                                                <span style={{ padding: '2px 8px', borderRadius: '9999px', fontSize: '12px', fontWeight: '500', backgroundColor: `${themeColor}20`, color: themeColor }}>
                                                                                    <TimeValue>{reason.total_count || 0}</TimeValue>
                                                                                </span>
                                                                            </td>
                                                                            <td style={{ padding: '4px 8px', textAlign: 'center', border: '1px solid #E5E7EB', wordWrap: 'break-word' }}>
                                                                                {branchBreakdown && branchBreakdown.length > 0 ? (
                                                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                                                                        {branchBreakdown.slice(0, isExpanded ? undefined : 1).map((branch, idx) => (
                                                                                            <div key={idx} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '12px', paddingBottom: '3px', borderBottom: '1px solid #F3F4F6' }}>
                                                                                                <div style={{ flex: 1, minWidth: 0 }}>
                                                                                                    <span style={{ fontWeight: '500', color: 'black' }}>{branch.branch}</span>
                                                                                                </div>
                                                                                                <span style={{ fontWeight: '500', marginLeft: '10px', color: themeColor }}>
                                                                                                    {branch.count}
                                                                                                </span>
                                                                                            </div>
                                                                                        ))}
                                                                                        {branchBreakdown.length > 1 && !isExpanded && (
                                                                                            <button
                                                                                                onClick={() => toggleReasonExpand(reason.rr_id)}
                                                                                                style={{ fontSize: '11px', color: '#2f3192', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', marginTop: '2px' }}
                                                                                            >
                                                                                                Show {branchBreakdown.length - 1} more...
                                                                                            </button>
                                                                                        )}
                                                                                        {branchBreakdown.length > 1 && isExpanded && (
                                                                                            <button
                                                                                                onClick={() => toggleReasonExpand(reason.rr_id)}
                                                                                                style={{ fontSize: '11px', color: '#2f3192', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', marginTop: '2px' }}
                                                                                            >
                                                                                                Show less
                                                                                            </button>
                                                                                        )}
                                                                                    </div>
                                                                                ) : (
                                                                                    <span style={{ fontSize: '12px', color: 'black' }}>No breakdown data</span>
                                                                                )}
                                                                            </td>
                                                                        </tr>
                                                                    </React.Fragment>
                                                                );
                                                            })}
                                                    </tbody>
                                                </table>
                                            )}
                                        </>
                                    ) : (
                                        <div className="text-center py-12">
                                            <svg className="w-16 h-16 text-black mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                                            </svg>
                                            <p className="text-black text-sm">
                                                {selectedCampaigns.length > 0
                                                    ? 'No rejected reasons data available for selected drives.'
                                                    : 'No rejected reasons data available for this time period. Select drives to filter data.'}
                                            </p>
                                            {selectedCampaigns.length > 0 && (
                                                <button
                                                    onClick={clearCampaignFilters}
                                                    className="mt-4 px-4 py-2 bg-[#2f3192] text-white rounded-lg hover:bg-[#335478] transition-colors text-sm"
                                                >
                                                    Clear Filters
                                                </button>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            <Suspense fallback={null}>
            <CampaignCustomersFollowupModal
                isOpen={showCustomersModal || showAllCampaignReport}
                onClose={() => {
                    setShowCustomersModal(false);
                    setShowAllCampaignReport(false);
                    setSelectedCampaign(null);
                }}
                campaign={showAllCampaignReport ? null : selectedCampaign}
                apiBaseUrl={API_BASE_URL}
                allReportCampaigns={showAllCampaignReport ? getSortedCampaignPerformance() : null}
            />

            <EmployeePerformanceModal
                isOpen={showEmployeeModal}
                onClose={() => {
                    setShowEmployeeModal(false);
                    setSelectedEmployee(null);
                }}
                employee={selectedEmployee}
                userData={userData}
                timePeriod={timePeriod}
                customStartDate={customStartDate}
                customEndDate={customEndDate}
            />

            <BranchCustomersModal
                isOpen={showBranchCustomersModal}
                onClose={() => {
                    setShowBranchCustomersModal(false);
                    setSelectedBranchForModal(null);
                }}
                branch={selectedBranchForModal}
                apiBaseUrl={API_BASE_URL}
                userData={userData}
                preloadedEngaged={selectedBranchForModal ? branchEngagedData[selectedBranchForModal.branch] : null}
                preloadedRemaining={selectedBranchForModal ? branchRemainingData[selectedBranchForModal.branch] : null}
                preloadedAllocation={selectedBranchForModal ? allocationSummary[selectedBranchForModal.branch] : null}
                canExportProp={canExport}
            />

            <BranchLetterReportModal
                isOpen={showBranchLetterModal}
                onClose={() => { setShowBranchLetterModal(false); setSelectedBranchForLetters(null); }}
                branch={selectedBranchForLetters}
                branchDisplayName={selectedBranchForLetters ? getBranchDisplayName(selectedBranchForLetters.branch) : ''}
                apiBaseUrl={API_BASE_URL}
                userData={userData}
                canExport={canExport}
            />
            <OtherFollowupModal
                isOpen={showOtherFollowupModal}
                onClose={() => setShowOtherFollowupModal(false)}
                apiBaseUrl={API_BASE_URL}
                userData={userData}
            />
            <EmployeeCampaignProgress
                isOpen={showCampaignProgressModal}
                onClose={() => {
                    setShowCampaignProgressModal(false);
                    setSelectedEmployeeForProgress(null);
                }}
                employee={selectedEmployeeForProgress}
                userData={userData}
            />
            <EmployeeActivityModal
                isOpen={showEmployeeActivityModal}
                onClose={() => {
                    setShowEmployeeActivityModal(false);
                    setSelectedActivityUser(null);
                    setSelectedActivityName('');
                }}
                employee={selectedActivityUser}
                activityName={selectedActivityName}
                apiBaseUrl={API_BASE_URL}
                timePeriod={timePeriod}
                customStartDate={customStartDate}
                customEndDate={customEndDate}
                selectedCampaigns={selectedCampaigns}
                allCampaigns={allCampaigns}
            />
            <EmployeeRRModal
                isOpen={showEmployeeRRModal}
                onClose={() => {
                    setShowEmployeeRRModal(false);
                    setSelectedRRUser(null);
                    setSelectedRRName('');
                }}
                employee={selectedRRUser}
                rrName={selectedRRName}
                apiBaseUrl={API_BASE_URL}
                timePeriod={timePeriod}
                customStartDate={customStartDate}
                customEndDate={customEndDate}
                selectedCampaigns={selectedCampaigns}
                allCampaigns={allCampaigns}
            />
            <EmployeeTime
                isOpen={showEmployeeTimeModal}
                onClose={() => setShowEmployeeTimeModal(false)}
                userData={userData}
            />
            </Suspense>
        </div>
    );
};

export default Dashboard;