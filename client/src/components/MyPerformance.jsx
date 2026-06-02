import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import ReactDOM from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { Bar, Pie, Line } from 'react-chartjs-2';
import axios from 'axios';
import * as XLSX from 'xlsx';

const themeColor = '#2f3192';
const API_BASE_URL = import.meta.env.VITE_BACKEND_URL;
const DEFAULT_PERFORMANCE = {
    total_followups: 0,
    wip_count: 0,
    completed_count: 0,
    rejected_count: 0,
    rescheduled_count: 0,
    followup_type_breakdown: {},
    recent_activities: [],
    top_campaigns: []
};

// Helper function - Convert UTC to IST
const convertUTCToIST = (dateTimeString) => {
    if (!dateTimeString) return '-';
    const date = new Date(dateTimeString);
    const hours = date.getUTCHours();
    const minutes = date.getUTCMinutes();
    const period = hours >= 12 ? 'PM' : 'AM';
    let displayHours = hours % 12;
    displayHours = displayHours === 0 ? 12 : displayHours;
    const formattedMinutes = minutes.toString().padStart(2, '0');
    return `${displayHours}:${formattedMinutes} ${period}`;
};

const MyPerformance = ({ userData, timePeriod, customStartDate, customEndDate, isBranchAdmin, isMasterAdmin, isITAdmin }) => {
    const navigate = useNavigate();

    // Yellow highlight for time-dependent counts. 'all' (Calendar) = no highlight.
    const isTimeFiltered = timePeriod !== 'all';
    const TimeValue = ({ children }) => (
        isTimeFiltered
            ? <span style={{ backgroundColor: '#fde047', borderRadius: '4px', padding: '0 4px' }}>{children}</span>
            : <>{children}</>
    );

    const handleOpenCustomerFromFollowup = (followup) => {
        if (!followup) return;
        setShowAllFollowupsModal(false);
        navigate('/customer-engagement', {
            state: {
                openCustomerInstanceId: followup.customer_instance_id,
                openCustomerId: followup.customer_id || null
            }
        });
    };

    const handleOpenCustomerFromCsp = (row) => {
        if (!row || !row.instance_id) return;
        setShowCspModal(false);
        setShowOpenCspModal(false);
        navigate('/customer-engagement', {
            state: {
                openCustomerInstanceId: row.instance_id,
                openCustomerId: null
            }
        });
    };

    const [performance, setPerformance] = useState(DEFAULT_PERFORMANCE);
    const [dailyPerformance, setDailyPerformance] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [tableTimeFilter, setTableTimeFilter] = useState('all');
    const fetchingRef = useRef(false);
    const topScrollRef = useRef(null);
    const bottomScrollRef = useRef(null);
    const tableRef = useRef(null);
    const tableWidthRef = useRef('100%');
    const [nonFollowupCount, setNonFollowupCount] = useState(0);
    const [branchAssetCount, setBranchAssetCount] = useState(0);
    const [nonFollowupCustomerStats, setNonFollowupCustomerStats] = useState(null);
    const [createdFromDate, setCreatedFromDate] = useState('');
    const [createdToDate, setCreatedToDate] = useState('');
    const [quotationFilterActive, setQuotationFilterActive] = useState(false);
    const [quotationSentFilterActive, setQuotationSentFilterActive] = useState(false);
    const [canExport, setCanExport] = useState(false);

    const [showAllFollowupsModal, setShowAllFollowupsModal] = useState(false);
    const [allFollowupsData, setAllFollowupsData] = useState([]);
    const [loadingAllFollowups, setLoadingAllFollowups] = useState(false);
    const [followupSearchTerm, setFollowupSearchTerm] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');
    const [showCancelledCspModal, setShowCancelledCspModal] = useState(false);

    // Non-Campaign Customers modal
    const [showNonCampaignModal, setShowNonCampaignModal] = useState(false);
    const [nonCampaignData, setNonCampaignData] = useState({ total_customers: 0, customers: [] });
    const [loadingNonCampaign, setLoadingNonCampaign] = useState(false);
    const [nonCampaignSearchTerm, setNonCampaignSearchTerm] = useState('');
    const [nonCampaignStatusFilter, setNonCampaignStatusFilter] = useState('all');
    const [nonCampaignServiceFilter, setNonCampaignServiceFilter] = useState('all');

    const [showCspModal, setShowCspModal] = useState(false);
    const [cspData, setCspData] = useState({ total_instances: 0, total_rows: 0, rows: [] });
    const [loadingCsp, setLoadingCsp] = useState(false);
    const [cspSearchTerm, setCspSearchTerm] = useState('');
    const [cspDueFromDate, setCspDueFromDate] = useState('');
    const [cspDueToDate, setCspDueToDate] = useState('');
    const [cspSegmentFilter, setCspSegmentFilter] = useState('all');

    // Open CSP modal
    const [showOpenCspModal, setShowOpenCspModal] = useState(false);
    const [openCspSearchTerm, setOpenCspSearchTerm] = useState('');
    const [openCspDueFromDate, setOpenCspDueFromDate] = useState('');
    const [openCspDueToDate, setOpenCspDueToDate] = useState('');
    const [openCspSegmentFilter, setOpenCspSegmentFilter] = useState('all');
    const [cspQuotationFilterActive, setCspQuotationFilterActive] = useState(false);
    const [cspDaysSort, setCspDaysSort] = useState('desc'); // 'desc' = overdue first, 'asc' = due last first
    const [openCspDaysSort, setOpenCspDaysSort] = useState('desc');
    const [cspQuotationSentFilterActive, setCspQuotationSentFilterActive] = useState(false);

    // Add SR in CSP modal
    const [showAddSrModal, setShowAddSrModal] = useState(false);
    const [openCspCampaigns, setOpenCspCampaigns] = useState([]);
    const [selectedCspCampaignId, setSelectedCspCampaignId] = useState('');
    const [addSrLoading, setAddSrLoading] = useState(false);
    const [userCspSrCount, setUserCspSrCount] = useState(0);
    const [srForm, setSrForm] = useState({
        asset_number: '',
        branch_id: '',   // ← was userData?.branch || ''
        goem_oem: '',
        sr_number: '',
        sr_open_date: '',
        sr_close_date: '',
        sr_type: 'CSP',
        sr_subtype: '',
        sr_status: 'Open',
        segment: '',
        application_code: ''
    });
    // Debounce search input by 250ms
    useEffect(() => {
        const t = setTimeout(() => setDebouncedSearch(followupSearchTerm), 250);
        return () => clearTimeout(t);
    }, [followupSearchTerm]);

    // Format date for API — use LOCAL (IST) date parts so the chosen day isn't
    // shifted to the previous day by UTC conversion (toISOString shifts IST dates back).
    const formatDateForAPI = useCallback((date) => {
        if (!date) return null;
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }, []);

    // Get date range text for display (for the stats section)
    const getDateRangeText = useCallback(() => {
        if (timePeriod === 'custom' && customStartDate && customEndDate) {
            return `${formatDateForAPI(customStartDate)} to ${formatDateForAPI(customEndDate)}`;
        }
        switch (timePeriod) {
            case 'month': return 'Last 30 Days';
            case '3months': return 'Last 3 Months';
            case '6months': return 'Last 6 Months';
            case 'year': return 'Last 12 Months';
            default: return 'All Time';
        }
    }, [timePeriod, customStartDate, customEndDate, formatDateForAPI]);

    // Fetch daily details - ALWAYS WITH NO TIME FILTER (ALL TIME)
    const fetchDailyDetails = useCallback(async () => {
        if (!userData || !userData.user_id) return [];

        try {
            const payload = {
                user_id: userData.user_id || userData.id,
                name: userData.name,
                role: userData.role,
                branch: userData.branch
            };

            let url = `${API_BASE_URL}/performance/my-performance/daily-details?time_period=all`;

            const response = await axios.post(url, payload);

            if (response.data && response.data.length > 0) {
                const dailyData = response.data.map(day => ({
                    date: day.date,
                    first_followup_time: day.first_followup_time,
                    last_followup_time: day.last_followup_time,
                    total_working_hours: day.total_working_hours,
                    total_followups: day.total_followups || 0,
                    completed_count: day.completed_count || 0,
                    followup_by_call: day.followup_by_call || 0,
                    followup_by_whatsapp: day.followup_by_whatsapp || 0,
                    followup_by_email: day.followup_by_email || 0,
                    followup_by_visit: day.followup_by_visit || 0,
                    call_completed: day.call_completed || 0,
                    call_wip: day.call_wip || 0,
                    call_rejected: day.call_rejected || 0,
                    call_rescheduled: day.call_rescheduled || 0,
                    whatsapp_completed: day.whatsapp_completed || 0,
                    whatsapp_wip: day.whatsapp_wip || 0,
                    whatsapp_rejected: day.whatsapp_rejected || 0,
                    whatsapp_rescheduled: day.whatsapp_rescheduled || 0,
                    email_completed: day.email_completed || 0,
                    email_wip: day.email_wip || 0,
                    email_rejected: day.email_rejected || 0,
                    email_rescheduled: day.email_rescheduled || 0,
                    visit_completed: day.visit_completed || 0,
                    visit_wip: day.visit_wip || 0,
                    visit_rejected: day.visit_rejected || 0,
                    visit_rescheduled: day.visit_rescheduled || 0,
                    campaign_name: day.campaign_name || 'N/A'
                }));
                setDailyPerformance(dailyData);
                return dailyData;
            } else {
                setDailyPerformance([]);
                return [];
            }
        } catch (error) {
            console.error('Error fetching daily details:', error);
            setDailyPerformance([]);
            return [];
        }
    }, [userData]);

    // Fetch main performance data - THIS respects the time filter
    const fetchMyPerformance = useCallback(async () => {
        // NOTE: do NOT early-return on fetchingRef here. A filter change can fire while
        // the initial-mount fetch is still in flight; bailing out silently dropped the
        // refetch, so counts only updated after a tab switch remounted the component.
        if (!userData || !userData.user_id) {
            setLoading(false);
            return;
        }

        try {
            fetchingRef.current = true;
            setLoading(true);
            setError(null);

            const payload = {
                user_id: userData.user_id || userData.id,
                name: userData.name,
                role: userData.role,
                branch: userData.branch
            };

            let url = `${API_BASE_URL}/performance/my-performance?time_period=${timePeriod}`;

            if (timePeriod === 'custom' && customStartDate && customEndDate) {
                const startDate = formatDateForAPI(customStartDate);
                const endDate = formatDateForAPI(customEndDate);
                if (startDate && endDate) {
                    url += `&start_date=${startDate}&end_date=${endDate}`;
                }
            }

            const response = await axios.post(url, payload);
            const data = response.data || DEFAULT_PERFORMANCE;
            setPerformance(data);
            setDailyPerformance(data.daily_performance || []);

        } catch (error) {
            console.error('Error fetching performance:', error);
            setError(error.response?.data?.detail || error.message);
            setPerformance(DEFAULT_PERFORMANCE);
        } finally {
            setLoading(false);
            fetchingRef.current = false;
        }
    }, [userData, timePeriod, customStartDate, customEndDate, formatDateForAPI, fetchDailyDetails]);

    // Add custom scrollbar styles
    useEffect(() => {
        const styleId = 'custom-scrollbar-styles';
        if (!document.getElementById(styleId)) {
            const style = document.createElement('style');
            style.id = styleId;
            style.textContent = `
                .custom-scrollbar-top::-webkit-scrollbar {
                    height: 8px;
                }
                .custom-scrollbar-top::-webkit-scrollbar-track {
                    background: #f1f1f1;
                    border-radius: 4px;
                }
                .custom-scrollbar-top::-webkit-scrollbar-thumb {
                    background: #888;
                    border-radius: 4px;
                }
                .custom-scrollbar-top::-webkit-scrollbar-thumb:hover {
                    background: #555;
                }
            `;
            document.head.appendChild(style);
        }
        return () => {
            const styleElement = document.getElementById(styleId);
            if (styleElement) {
                styleElement.remove();
            }
        };
    }, []);

    const fetchBranchAssetCount = useCallback(async () => {
        if (!userData || !userData.user_id) return;
        try {
            const response = await axios.get(`${API_BASE_URL}/v1/engagement/customers`);
            const data = response.data;
            const allCustomers = (data.customers || []).filter(c => c.campaigns && c.campaigns.length > 0);
            const activeCampaigns = data.active_campaigns || [];
            const isMaster = userData.role === 'master_admin' || userData.role === 'it_admin';
            const userBranch = userData.branch;

            let filtered = allCustomers;
            if (!isMaster && userBranch) {
                filtered = allCustomers.filter(c => !c.branch_id || String(c.branch_id) === String(userBranch));
            }

            // Asset count = sum of campaign memberships (same as the Assets button in CustomerEng)
            const assetCount = activeCampaigns.reduce((sum, campaign) => {
                return sum + filtered.filter(c => c.campaigns?.includes(campaign)).length;
            }, 0);

            setBranchAssetCount(assetCount);
        } catch (err) {
            console.error('Error fetching branch asset count:', err);
        }
    }, [userData]);

    const fetchAllFollowups = useCallback(async () => {
        if (!userData || !userData.user_id) return;
        setLoadingAllFollowups(true);
        try {
            const payload = {
                user_id: userData.user_id || userData.id,
                name: userData.name,
                role: userData.role,
                branch: userData.branch
            };

            let url = `${API_BASE_URL}/performance/my-performance/all-followups?time_period=${timePeriod}`;

            if (timePeriod === 'custom' && customStartDate && customEndDate) {
                const sd = formatDateForAPI(customStartDate);
                const ed = formatDateForAPI(customEndDate);
                if (sd && ed) url += `&start_date=${sd}&end_date=${ed}`;
            }

            const response = await axios.post(url, payload);
            setAllFollowupsData(response.data?.followups || []);
        } catch (error) {
            console.error('Error fetching all followups:', error);
            setAllFollowupsData([]);
        } finally {
            setLoadingAllFollowups(false);
        }
    }, [userData, timePeriod, customStartDate, customEndDate, formatDateForAPI]);

    const handleOpenAllFollowups = () => {
        setQuotationFilterActive(false);
        setQuotationSentFilterActive(false);
        setCspQuotationFilterActive(false);
        setCspQuotationSentFilterActive(false);
        setShowAllFollowupsModal(true);
        setFollowupSearchTerm('');
        setCreatedFromDate('');
        setCreatedToDate('');
        setStatusFilter('all');
        fetchAllFollowups();
    };

    const handleOpenQuotationFollowups = () => {
        setQuotationFilterActive(true);
        setQuotationSentFilterActive(false);
        setShowAllFollowupsModal(true);
        setFollowupSearchTerm('');
        setCreatedFromDate('');
        setCreatedToDate('');
        if (allFollowupsData.length === 0) {
            fetchAllFollowups();
        }
    };

    const handleOpenQuotationSentFollowups = () => {
        setQuotationFilterActive(false);
        setQuotationSentFilterActive(true);
        setShowAllFollowupsModal(true);
        setFollowupSearchTerm('');
        setCreatedFromDate('');
        setCreatedToDate('');
        if (allFollowupsData.length === 0) {
            fetchAllFollowups();
        }
    };

    const handleOpenCspQuotationFollowups = () => {
        setQuotationFilterActive(false);
        setQuotationSentFilterActive(false);
        setCspQuotationFilterActive(true);
        setCspQuotationSentFilterActive(false);
        setShowAllFollowupsModal(true);
        setFollowupSearchTerm('');
        setCreatedFromDate('');
        setCreatedToDate('');
        setStatusFilter('all');
        if (allFollowupsData.length === 0) {
            fetchAllFollowups();
        }
    };

    const handleOpenCspQuotationSentFollowups = () => {
        setQuotationFilterActive(false);
        setQuotationSentFilterActive(false);
        setCspQuotationFilterActive(false);
        setCspQuotationSentFilterActive(true);
        setShowAllFollowupsModal(true);
        setFollowupSearchTerm('');
        setCreatedFromDate('');
        setCreatedToDate('');
        setStatusFilter('all');
        if (allFollowupsData.length === 0) {
            fetchAllFollowups();
        }
    };

    // Get latest followup per unique (instance_id + campaign_name) combination
    const getLatestFollowupsPerInstanceCampaign = (followups) => {
        const map = new Map();
        followups.forEach(fu => {
            const key = `${fu.customer_instance_id || ''}__${fu.campaign_name || ''}`;
            const existing = map.get(key);
            if (!existing) {
                map.set(key, fu);
            } else {
                const existingDate = new Date(existing.created_at || existing.followup_date || 0);
                const currentDate = new Date(fu.created_at || fu.followup_date || 0);
                if (currentDate > existingDate) {
                    map.set(key, fu);
                }
            }
        });
        return Array.from(map.values());
    };

    const fetchCspStatus = useCallback(async () => {
        if (!userData || !userData.user_id) return;
        setLoadingCsp(true);
        try {
            const params = new URLSearchParams({
                branch_id: userData.branch || '',
                role: userData.role || ''
            });
            const response = await axios.get(`${API_BASE_URL}/v1/engagement/csp-status?${params.toString()}`);
            setCspData(response.data || { total_instances: 0, total_rows: 0, rows: [] });
        } catch (error) {
            console.error('Error fetching CSP status:', error);
            setCspData({ total_instances: 0, total_rows: 0, rows: [] });
        } finally {
            setLoadingCsp(false);
        }
    }, [userData]);

    // Format a yyyy-mm-dd input into DD-MMM-YYYY (matches bulk-upload format)
    const formatSrDate = (val) => {
        if (!val) return null;
        const d = new Date(val);
        if (isNaN(d.getTime())) return val;
        const day = String(d.getDate()).padStart(2, '0');
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        return `${day}-${months[d.getMonth()]}-${d.getFullYear()}`;
    };

    const fetchUserCspSrCount = useCallback(async () => {
        if (!userData?.user_id && !userData?.id) return;
        try {
            const uid = userData.user_id || userData.id;
            const res = await axios.get(`${API_BASE_URL}/v1/campaigns/csp/user-sr-count`, {
                params: { user_id: uid }
            });
            setUserCspSrCount(res.data?.count || 0);
        } catch (e) {
            console.error('Error fetching user CSP SR count:', e);
            setUserCspSrCount(0);
        }
    }, [userData]);

    const handleOpenAddSrModal = async () => {
        setSrForm({
            asset_number: '', branch_id: '', goem_oem: '',   // ← was branch_id: userData?.branch || ''
            sr_number: '', sr_open_date: '', sr_close_date: '', sr_type: 'CSP',
            sr_subtype: '', sr_status: 'Open', segment: '', application_code: ''
        });
        setSelectedCspCampaignId('');
        setShowAddSrModal(true);
        try {
            const res = await axios.get(`${API_BASE_URL}/v1/campaigns/csp/open-campaigns`);
            const list = res.data || [];
            setOpenCspCampaigns(list);
            if (list.length === 1) setSelectedCspCampaignId(String(list[0].id));
        } catch (e) {
            console.error('Error fetching open CSP campaigns:', e);
            setOpenCspCampaigns([]);
        }
    };

    // Auto-fill GOEM/OEM + Segment from asset_detailed when Asset No. is entered
    useEffect(() => {
        if (!showAddSrModal) return;
        const term = srForm.asset_number.trim();
        if (!term) return;

        const handle = setTimeout(async () => {
            try {
                const res = await axios.get(`${API_BASE_URL}/performance/asset-lookup`, {
                    params: { instance_id: term }
                });
                if (res.data?.found) {
                    setSrForm(prev => ({
                        ...prev,
                        goem_oem: res.data.goem_oem || prev.goem_oem,
                        segment: res.data.segment || prev.segment,
                        branch_id: res.data.branch_id || prev.branch_id
                    }));
                }
            } catch (e) {
                console.error('Asset lookup failed:', e);
            }
        }, 500);

        return () => clearTimeout(handle);
    }, [srForm.asset_number, showAddSrModal]);

    const handleSubmitSr = async () => {
        if (!selectedCspCampaignId) {
            alert('Please select which CSP campaign to add this SR into.');
            return;
        }
        if (!srForm.asset_number.trim()) { alert('Asset Number is required.'); return; }
        if (!srForm.sr_number.trim()) { alert('SR Number is required.'); return; }

        setAddSrLoading(true);
        try {
            const payload = {
                ...srForm,
                instance_id: srForm.asset_number.trim(),
                sr_open_date: formatSrDate(srForm.sr_open_date),
                sr_close_date: formatSrDate(srForm.sr_close_date)
            };
            const headers = {
                'X-User-Id': userData.user_id || userData.id || '',
                'X-User-Name': userData.name || ''
            };
            await axios.post(
                `${API_BASE_URL}/v1/campaigns/${selectedCspCampaignId}/csp/add-sr`,
                payload,
                { headers }
            );
            setShowAddSrModal(false);
            fetchUserCspSrCount();
            fetchCspStatus();
        } catch (e) {
            alert(e.response?.data?.detail || 'Failed to add SR.');
        } finally {
            setAddSrLoading(false);
        }
    };

    const handleOpenCspModal = () => {
        setShowCspModal(true);
        setCspSearchTerm('');
        setCspDueFromDate('');
        setCspDueToDate('');
        setCspSegmentFilter('all');
        fetchCspStatus();
    };

    const handleOpenOpenCspModal = () => {
        setShowOpenCspModal(true);
        setOpenCspSearchTerm('');
        setOpenCspDueFromDate('');
        setOpenCspDueToDate('');
        setOpenCspSegmentFilter('all');
        if (!cspData.rows || cspData.rows.length === 0) {
            fetchCspStatus();
        }
    };
    // Parse a "DD-MM-YYYY" due-date string (the backend's output format) into a Date
    const parseCspDueDate = (str) => {
        if (!str) return null;
        const m = String(str).trim().match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
        if (m) return new Date(+m[3], +m[2] - 1, +m[1]);
        const d = new Date(str);
        return isNaN(d.getTime()) ? null : d;
    };

    // Due/Overdue Days relative to due date. Positive = overdue, negative = days left.
    // todayMs is computed once per render cycle, not inside every call
    const todayStartMs = useMemo(() => {
        const t = new Date();
        t.setHours(0, 0, 0, 0);
        return t.getTime();
    }, []);

    const getCspDaysPass = useCallback((str) => {
        const due = parseCspDueDate(str);
        if (!due) return null;
        due.setHours(0, 0, 0, 0);
        return Math.round((todayStartMs - due.getTime()) / (1000 * 60 * 60 * 24));
    }, [todayStartMs]);

    // Shared filter: search + segment + due-date range
    const applyCspFilters = useCallback((rows, search, segment, fromDate, toDate) => {
        return (rows || []).filter(row => {
            if (search.trim()) {
                const t = search.toLowerCase();
                const matches =
                    (row.instance_id || '').toString().toLowerCase().includes(t) ||
                    (row.customer_name || '').toLowerCase().includes(t) ||
                    (row.branch_id || '').toString().toLowerCase().includes(t) ||
                    (row.sr_number || '').toString().toLowerCase().includes(t) ||
                    (row.goem_oem || '').toLowerCase().includes(t) ||
                    (row.segment || '').toLowerCase().includes(t) ||
                    (row.application_code || '').toLowerCase().includes(t);
                if (!matches) return false;
            }
            if (segment && segment !== 'all') {
                if ((row.segment || '') !== segment) return false;
            }
            if (fromDate || toDate) {
                const due = parseCspDueDate(row.due_date);
                if (!due) return false;
                due.setHours(0, 0, 0, 0);
                if (fromDate) {
                    const from = new Date(fromDate);
                    from.setHours(0, 0, 0, 0);
                    if (due < from) return false;
                }
                if (toDate) {
                    const to = new Date(toDate);
                    to.setHours(23, 59, 59, 999);
                    if (due > to) return false;
                }
            }
            return true;
        });
    }, []);

    // Segment options (shared by both modals) — derived from the already-fetched rows
    const cspSegmentOptions = useMemo(() => {
        const set = new Set();
        (cspData.rows || []).forEach(r => { if (r.segment) set.add(r.segment); });
        return Array.from(set).sort();
    }, [cspData.rows]);

    // Open-only rows (SR Status === open), from the same fetched cspData
    const openCspRows = useMemo(
        () => (cspData.rows || []).filter(r => (r.sr_status || '').trim().toLowerCase() === 'open'),
        [cspData.rows]
    );

    // Unique open instances (parallels Total CSP = total_instances)
    const openCspInstanceCount = useMemo(
        () => new Set(openCspRows.map(r => r.instance_id).filter(Boolean)).size,
        [openCspRows]
    );

    // Total CSP modal rows (now also segment-filtered)
    const filteredCspRows = useMemo(
        () => applyCspFilters(cspData.rows, cspSearchTerm, cspSegmentFilter, cspDueFromDate, cspDueToDate),
        [cspData.rows, cspSearchTerm, cspSegmentFilter, cspDueFromDate, cspDueToDate, applyCspFilters]
    );

    // Open CSP modal rows
    const filteredOpenCspRows = useMemo(
        () => applyCspFilters(openCspRows, openCspSearchTerm, openCspSegmentFilter, openCspDueFromDate, openCspDueToDate),
        [openCspRows, openCspSearchTerm, openCspSegmentFilter, openCspDueFromDate, openCspDueToDate, applyCspFilters]
    );
    // Sorted CSP rows for Total CSP modal
    const sortedCspRows = useMemo(() => {
        return [...filteredCspRows].sort((a, b) => {
            const da = getCspDaysPass(a.due_date);
            const db = getCspDaysPass(b.due_date);
            const valA = da === null ? -Infinity : da;
            const valB = db === null ? -Infinity : db;
            return cspDaysSort === 'desc' ? valB - valA : valA - valB;
        });
    }, [filteredCspRows, cspDaysSort]);

    // Sorted CSP rows for Open CSP modal
    const sortedOpenCspRows = useMemo(() => {
        return [...filteredOpenCspRows].sort((a, b) => {
            const da = getCspDaysPass(a.due_date);
            const db = getCspDaysPass(b.due_date);
            const valA = da === null ? -Infinity : da;
            const valB = db === null ? -Infinity : db;
            return openCspDaysSort === 'desc' ? valB - valA : valA - valB;
        });
    }, [filteredOpenCspRows, openCspDaysSort]);

    // Latest unique followups (one per instance_id + campaign_name)
    const latestUniqueFollowups = useMemo(
        () => getLatestFollowupsPerInstanceCampaign(allFollowupsData),
        [allFollowupsData]
    );

    // IDs of latest rows that have "quotation" in activity_content,
    // quotation NOT yet sent, AND status is 'rescheduled'
    const quotationFollowupIds = useMemo(() => new Set(
        latestUniqueFollowups
            .filter(fu =>
                (fu.activity_content || '').toLowerCase().includes('quotation') &&
                !fu.quotation_sent &&
                fu.status === 'rescheduled'
            )
            .map(fu => fu.id)
    ), [latestUniqueFollowups]);

    // Count for the front box
    const quotationCount = quotationFollowupIds.size;

    // Count of all rows where quotation_sent is true (Yes)
    const quotationSentCount = useMemo(
        () => allFollowupsData.filter(fu => fu.quotation_sent).length,
        [allFollowupsData]
    );

    // True if a follow-up belongs to a CSP campaign / service
    const isCspFollowup = useCallback((fu) =>
        (fu.campaign_service || '').toLowerCase().includes('csp') ||
        (fu.campaign_name || '').toLowerCase().includes('csp'),
        []);
    // CSP "Quotation Required" — same rule as quotationFollowupIds but CSP-only
    const cspQuotationFollowupIds = useMemo(() => new Set(
        latestUniqueFollowups
            .filter(fu =>
                (fu.activity_content || '').toLowerCase().includes('quotation') &&
                !fu.quotation_sent &&
                fu.status === 'rescheduled' &&
                isCspFollowup(fu)
            )
            .map(fu => fu.id)
    ), [latestUniqueFollowups]);

    const cspQuotationCount = cspQuotationFollowupIds.size;

    // CSP "Quotation Sent" — quotation_sent true AND CSP service
    const cspQuotationSentCount = useMemo(
        () => allFollowupsData.filter(fu => fu.quotation_sent && isCspFollowup(fu)).length,
        [allFollowupsData]
    );

    // Memoized filtered follow-ups for the All-Follow-ups modal
    const visibleFollowups = useMemo(() => {
        return allFollowupsData.filter(fu => {
            if (quotationFilterActive && !quotationFollowupIds.has(fu.id)) return false;
            if (quotationSentFilterActive && !fu.quotation_sent) return false;
            if (cspQuotationFilterActive && !cspQuotationFollowupIds.has(fu.id)) return false;
            if (cspQuotationSentFilterActive && !(fu.quotation_sent && isCspFollowup(fu))) return false;
            if (statusFilter !== 'all') {
                if ((fu.status || '').toLowerCase() !== statusFilter) return false;
            }
            if (debouncedSearch.trim()) {
                const t = debouncedSearch.toLowerCase();
                const matchesSearch = (
                    (fu.customer_name || '').toLowerCase().includes(t) ||
                    (fu.campaign_name || '').toLowerCase().includes(t) ||
                    (fu.followup_remark || '').toLowerCase().includes(t) ||
                    (fu.customer_instance_id || '').toString().toLowerCase().includes(t) ||
                    (fu.phone_number || '').toString().toLowerCase().includes(t) ||
                    (fu.email || '').toLowerCase().includes(t)
                );
                if (!matchesSearch) return false;
            }
            if (createdFromDate || createdToDate) {
                if (!fu.created_at) return false;
                const created = new Date(fu.created_at);
                created.setHours(0, 0, 0, 0);
                if (createdFromDate) {
                    const from = new Date(createdFromDate);
                    from.setHours(0, 0, 0, 0);
                    if (created < from) return false;
                }
                if (createdToDate) {
                    const to = new Date(createdToDate);
                    to.setHours(23, 59, 59, 999);
                    if (created > to) return false;
                }
            }
            return true;
        });
    }, [allFollowupsData, quotationFilterActive, quotationSentFilterActive,
        cspQuotationFilterActive, cspQuotationSentFilterActive, statusFilter,
        debouncedSearch, createdFromDate, createdToDate,
        quotationFollowupIds, cspQuotationFollowupIds, isCspFollowup]);

    // Quotation sent count grouped by local date (YYYY-MM-DD) — derived from allFollowupsData
    const quotationSentByDate = useMemo(() => {
        const toLocalDateKey = (dateInput) => {
            if (!dateInput) return null;
            const d = new Date(dateInput);
            if (isNaN(d.getTime())) return null;
            return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        };
        const map = {};
        allFollowupsData.forEach(fu => {
            if (fu.quotation_sent) {
                const key = toLocalDateKey(fu.followup_date || fu.created_at);
                if (key) map[key] = (map[key] || 0) + 1;
            }
        });
        return map;
    }, [allFollowupsData]);

    // Helper for a specific daily row
    const getQuotationSentForDay = useCallback((dayDate) => {
        if (!dayDate) return 0;
        const d = new Date(dayDate);
        if (isNaN(d.getTime())) return 0;
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        return quotationSentByDate[key] || 0;
    }, [quotationSentByDate]);

    const fetchNonFollowupCount = useCallback(async () => {
        if (!userData || !userData.user_id) return;

        try {
            const payload = {
                user_id: userData.user_id || userData.id,
                name: userData.name,
                role: userData.role,
                branch: userData.branch
            };

            const response = await axios.post(`${API_BASE_URL}/performance/my-performance/non-followup-count`, payload);
            setNonFollowupCount(response.data.non_followup_count || 0);
        } catch (error) {
            console.error('Error fetching non-followup count:', error);
            setNonFollowupCount(0);
        }
    }, [userData]);

    const statusBarData = useMemo(() => ({
        labels: ['Completed', 'WIP', 'Rejected', 'Rescheduled'],
        datasets: [{
            label: 'Status Count',
            data: [
                performance.completed_count || 0,
                performance.wip_count || 0,
                performance.rejected_count || 0,
                performance.rescheduled_count || 0
            ],
            backgroundColor: [
                'rgba(34, 197, 94, 0.85)',
                'rgba(234, 179, 8, 0.85)',
                'rgba(239, 68, 68, 0.85)',
                'rgba(168, 85, 247, 0.85)'
            ],
            borderColor: ['#22c55e', '#eab308', '#ef4444', '#a855f7'],
            borderWidth: 2,
            borderRadius: 12,
            barPercentage: 0.7,
            categoryPercentage: 0.8,
            shadowOffsetX: 2,
            shadowOffsetY: 2,
            shadowBlur: 4,
            shadowColor: 'rgba(0, 0, 0, 0.1)'
        }]
    }), [performance.completed_count, performance.wip_count, performance.rejected_count, performance.rescheduled_count]);

    const statusBarOptions = useMemo(() => ({
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: {
                position: 'bottom',
                labels: {
                    usePointStyle: true,
                    boxWidth: 10,
                    boxHeight: 10,
                    font: { size: 11, weight: '500' },
                    padding: 12
                }
            },
            tooltip: {
                backgroundColor: 'rgba(0, 0, 0, 0.9)',
                titleColor: '#fff',
                bodyColor: '#e5e7eb',
                borderColor: '#3b82f6',
                borderWidth: 1,
                cornerRadius: 8,
                callbacks: {
                    label: function (context) {
                        const value = context.raw;
                        const total = performance.completed_count + performance.wip_count +
                            performance.rejected_count + performance.rescheduled_count;
                        const percentage = total > 0 ? ((value / total) * 100).toFixed(1) : 0;
                        return `${value.toLocaleString()} (${percentage}%)`;
                    }
                }
            }
        },
        scales: {
            x: {
                grid: { display: false },
                ticks: { font: { size: 12, weight: '600' }, color: '#374151' }
            },
            y: {
                beginAtZero: true,
                grid: { color: '#f0f0f0', dash: [5, 5] },
                ticks: {
                    font: { size: 11 },
                    callback: function (value) { return value.toLocaleString(); }
                }
            }
        }
    }), [performance.completed_count, performance.wip_count, performance.rejected_count, performance.rescheduled_count]);

    const followupTypeChartData = useMemo(() => {
        const breakdown = performance?.followup_type_breakdown || {};
        const hasData = Object.keys(breakdown).length > 0;

        const labels = hasData
            ? Object.keys(breakdown).map(t => t.charAt(0).toUpperCase() + t.slice(1))
            : ['Call', 'WhatsApp', 'Email', 'Visit'];
        const data = hasData ? Object.values(breakdown) : [0, 0, 0, 0];

        const colors = {
            'call': '#2563EB',
            'whatsapp': '#10B981',
            'email': '#F97316',
            'visit': '#7C3AED',
        };

        return {
            labels,
            datasets: [{
                data,
                backgroundColor: labels.map(l => colors[l.toLowerCase()] || '#A0AEC0'),
                borderWidth: 0
            }]
        };
    }, [performance?.followup_type_breakdown]);

    const fetchExportPermission = useCallback(async () => {
        if (!userData || !userData.user_id) return;
        try {
            const payload = {
                user_id: userData.user_id || userData.id,
                name: userData.name,
                role: userData.role,
                branch: userData.branch
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
    }, [userData]);

    // Handle scroll synchronization
    const handleTopScroll = (e) => {
        if (bottomScrollRef.current && topScrollRef.current) {
            bottomScrollRef.current.scrollLeft = topScrollRef.current.scrollLeft;
        }
    };

    const handleBottomScroll = (e) => {
        if (topScrollRef.current && bottomScrollRef.current) {
            topScrollRef.current.scrollLeft = bottomScrollRef.current.scrollLeft;
        }
    };

    // Update table width on mount and resize
    useEffect(() => {
        const updateTableWidth = () => {
            if (tableRef.current) {
                tableWidthRef.current = `${tableRef.current.scrollWidth}px`;
            }
        };
        updateTableWidth();
        window.addEventListener('resize', updateTableWidth);
        return () => window.removeEventListener('resize', updateTableWidth);
    }, [dailyPerformance]);

    // Export to Excel
    const exportToExcel = () => {
        if (!filteredDailyPerformance.length) return;

        const exportData = filteredDailyPerformance.map((day, idx) => ({
            'S.NO': idx + 1,
            'Date': new Date(day.date).toLocaleDateString('en-IN', {
                day: '2-digit',
                month: 'short',
                year: 'numeric'
            }),
            'Campaign Name': day.campaign_name || 'N/A',
            'Start Time (IST)': day.first_followup_time ? convertUTCToIST(day.first_followup_time) : '-',
            'End Time (IST)': day.last_followup_time ? convertUTCToIST(day.last_followup_time) : '-',
            'Working Hours': day.total_working_hours ? `${day.total_working_hours} hrs` : '-',
            'Toal Calls and Follow-ups': day.total_followups || 0,
            'By Call': day.followup_by_call || 0,
            'Call Completed': day.call_completed || 0,
            'Call WIP': day.call_wip || 0,
            'Call Rejected': day.call_rejected || 0,
            'Call Rescheduled': day.call_rescheduled || 0,
            'By WhatsApp': day.followup_by_whatsapp || 0,
            'WhatsApp Completed': day.whatsapp_completed || 0,
            'WhatsApp WIP': day.whatsapp_wip || 0,
            'WhatsApp Rejected': day.whatsapp_rejected || 0,
            'WhatsApp Rescheduled': day.whatsapp_rescheduled || 0,
            'By Email': day.followup_by_email || 0,
            'Email Completed': day.email_completed || 0,
            'Email WIP': day.email_wip || 0,
            'Email Rejected': day.email_rejected || 0,
            'Email Rescheduled': day.email_rescheduled || 0,
            'By Visit': day.followup_by_visit || 0,
            'Visit Completed': day.visit_completed || 0,
            'Visit WIP': day.visit_wip || 0,
            'Visit Rejected': day.visit_rejected || 0,
            'Visit Rescheduled': day.visit_rescheduled || 0,
            'Quotation Sent': getQuotationSentForDay(day.date)
        }));

        // Add total row
        const totalRow = {
            'S.NO': '',
            'Date': 'TOTAL',
            'Campaign Name': '',
            'Start Time (IST)': '',
            'End Time (IST)': '',
            'Working Hours': '',
            'Toal Calls and Follow-ups': dailyTotals.total_followups,
            'By Call': dailyTotals.by_call,
            'Call Completed': dailyTotals.call_completed,
            'Call WIP': dailyTotals.call_wip,
            'Call Rejected': dailyTotals.call_rejected,
            'Call Rescheduled': dailyTotals.call_rescheduled,
            'By WhatsApp': dailyTotals.by_whatsapp,
            'WhatsApp Completed': dailyTotals.whatsapp_completed,
            'WhatsApp WIP': dailyTotals.whatsapp_wip,
            'WhatsApp Rejected': dailyTotals.whatsapp_rejected,
            'WhatsApp Rescheduled': dailyTotals.whatsapp_rescheduled,
            'By Email': dailyTotals.by_email,
            'Email Completed': dailyTotals.email_completed,
            'Email WIP': dailyTotals.email_wip,
            'Email Rejected': dailyTotals.email_rejected,
            'Email Rescheduled': dailyTotals.email_rescheduled,
            'By Visit': dailyTotals.by_visit,
            'Visit Completed': dailyTotals.visit_completed,
            'Visit WIP': dailyTotals.visit_wip,
            'Visit Rejected': dailyTotals.visit_rejected,
            'Visit Rescheduled': dailyTotals.visit_rescheduled,
            'Quotation Sent': dailyTotals.quotation_sent
        };

        exportData.push(totalRow);

        const ws = XLSX.utils.json_to_sheet(exportData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Daily Performance');
        ws['!cols'] = Object.keys(exportData[0]).map(() => ({ wch: 20 }));

        XLSX.writeFile(wb, `daily_performance_${filterLabel}_${new Date().toISOString().split('T')[0]}.xlsx`);
    };

    const fetchNonCampaignCustomers = useCallback(async () => {
        if (!userData || !userData.user_id) return;
        setLoadingNonCampaign(true);
        try {
            const payload = {
                user_id: userData.user_id || userData.id,
                name: userData.name,
                role: userData.role,
                branch: userData.branch
            };
            const response = await axios.post(
                `${API_BASE_URL}/performance/my-performance/non-campaign-customers`,
                payload
            );
            setNonCampaignData(response.data || { total_customers: 0, customers: [] });
        } catch (error) {
            console.error('Error fetching non-campaign customers:', error);
            setNonCampaignData({ total_customers: 0, customers: [] });
        } finally {
            setLoadingNonCampaign(false);
        }
    }, [userData]);

    const handleOpenNonCampaignModal = () => {
        setShowNonCampaignModal(true);
        setNonCampaignSearchTerm('');
        setNonCampaignStatusFilter('all');
        setNonCampaignServiceFilter('all');
        fetchNonCampaignCustomers();
    };

    // Service/product dropdown options
    const nonCampaignServiceOptions = useMemo(() => {
        const set = new Set();
        (nonCampaignData.customers || []).forEach(c => {
            if (c.service && c.service !== 'N/A') set.add(c.service);
        });
        return Array.from(set).sort();
    }, [nonCampaignData.customers]);

    // Search + status + service filtered rows
    const filteredNonCampaignCustomers = useMemo(() => {
        return (nonCampaignData.customers || []).filter(c => {
            if (nonCampaignStatusFilter !== 'all') {
                if ((c.last_status || '').toLowerCase() !== nonCampaignStatusFilter) return false;
            }
            if (nonCampaignServiceFilter !== 'all') {
                if ((c.service || '') !== nonCampaignServiceFilter) return false;
            }
            if (nonCampaignSearchTerm.trim()) {
                const t = nonCampaignSearchTerm.toLowerCase();
                const m = (
                    (c.customer_name || '').toLowerCase().includes(t) ||
                    (c.instance_id || '').toString().toLowerCase().includes(t) ||
                    (c.phone_number || '').toString().toLowerCase().includes(t) ||
                    (c.email || '').toLowerCase().includes(t) ||
                    (c.service || '').toLowerCase().includes(t) ||
                    (c.latest_remark || '').toLowerCase().includes(t)
                );
                if (!m) return false;
            }
            return true;
        });
    }, [nonCampaignData.customers, nonCampaignStatusFilter, nonCampaignServiceFilter, nonCampaignSearchTerm]);

    const exportNonCampaignToExcel = () => {
        if (!filteredNonCampaignCustomers.length) return;
        const exportData = filteredNonCampaignCustomers.map((c, idx) => ({
            'S.No': idx + 1,
            'Instance ID': c.instance_id || '-',
            'Customer Name': c.customer_name || '-',
            'Phone': c.phone_number || '-',
            'Email': c.email || '-',
            'Branch': c.branch_id || '-',
            'Service / Product': c.service || '-',
            'Remark Type': c.remark_type || '-',
            'Follow-up By': c.followup_by || '-',
            'Status': c.last_status || '-',
            'Flag': c.latest_flag || '-',
            'Remark': c.latest_remark || '-',
            'Quotation Sent': c.quotation_sent ? 'Yes' : 'No',
            'Quotation No': c.quotation_no || '-',
            'Quotation Value': c.quotation_value || 0,
            'Last Follow-up': c.last_followup_date
                ? new Date(c.last_followup_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
                : '-',
            'Next Follow-up': c.next_followup_date
                ? new Date(c.next_followup_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
                : '-',
        }));
        const ws = XLSX.utils.json_to_sheet(exportData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Non-Campaign Customers');
        ws['!cols'] = Object.keys(exportData[0]).map(() => ({ wch: 20 }));
        XLSX.writeFile(wb, `non_campaign_customers_${new Date().toISOString().split('T')[0]}.xlsx`);
    };

    const fetchNonFollowupCustomerStats = useCallback(async () => {
        if (!userData || !userData.user_id) return;
        try {
            const payload = {
                user_id: userData.user_id || userData.id,
                name: userData.name,
                role: userData.role,
                branch: userData.branch
            };
            const response = await axios.post(
                `${API_BASE_URL}/performance/my-performance/non-followup-unique-customer-stats`,
                payload
            );
            setNonFollowupCustomerStats(response.data);
        } catch (error) {
            console.error('Error fetching non-followup customer stats:', error);
            setNonFollowupCustomerStats(null);
        }
    }, [userData]);

    useEffect(() => {
        if (!userData?.user_id) return;
        Promise.all([
            fetchMyPerformance(),
            fetchNonFollowupCount(),
            fetchBranchAssetCount(),
            fetchNonFollowupCustomerStats(),
            fetchExportPermission(),
            fetchCspStatus(),
            fetchUserCspSrCount(),
        ]).catch(err => console.error('Parallel fetch error:', err));
    }, [userData?.user_id, timePeriod, customStartDate, customEndDate]);

    // Always load all follow-ups on mount / filter change so the
    // Quotation Sent / CSP quotation counts show without opening a modal
    useEffect(() => {
        if (!userData?.user_id) return;
        fetchAllFollowups();
    }, [userData?.user_id, timePeriod, customStartDate, customEndDate, fetchAllFollowups]);

    const { filteredDailyPerformance, filterLabel } = useMemo(() => {
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

        if (tableTimeFilter === 'all') {
            return { filteredDailyPerformance: dailyPerformance, filterLabel: 'All Time' };
        }

        const days = tableTimeFilter === 'lastMonth' ? 30 : 90;
        const startDate = new Date(today);
        startDate.setDate(today.getDate() - days);

        const filtered = dailyPerformance.filter(day => {
            const d = new Date(day.date);
            d.setHours(0, 0, 0, 0);
            return d >= startDate && d <= today;
        });

        const fmt = (date) => date.toLocaleDateString('en-IN', {
            day: '2-digit', month: 'short', year: 'numeric'
        });

        return {
            filteredDailyPerformance: filtered,
            filterLabel: `Last ${days} Days (${fmt(startDate)} to ${fmt(today)})`
        };
    }, [dailyPerformance, tableTimeFilter]);

    const getFilterLabel = useCallback(() => filterLabel, [filterLabel]);

    // Precomputed daily-table totals (used by <tfoot> and exportToExcel)
    const dailyTotals = useMemo(() => {
        const sum = (fn) => filteredDailyPerformance.reduce((s, day) => s + fn(day), 0);
        return {
            total_followups:      sum(d => d.total_followups || 0),
            completed_all:        sum(d => (d.call_completed || 0) + (d.whatsapp_completed || 0) + (d.email_completed || 0) + (d.visit_completed || 0)),
            wip_all:              sum(d => (d.call_wip || 0) + (d.whatsapp_wip || 0) + (d.email_wip || 0) + (d.visit_wip || 0)),
            rejected_all:         sum(d => (d.call_rejected || 0) + (d.whatsapp_rejected || 0) + (d.email_rejected || 0) + (d.visit_rejected || 0)),
            rescheduled_all:      sum(d => (d.call_rescheduled || 0) + (d.whatsapp_rescheduled || 0) + (d.email_rescheduled || 0) + (d.visit_rescheduled || 0)),
            by_call:              sum(d => d.followup_by_call || 0),
            call_completed:       sum(d => d.call_completed || 0),
            call_wip:             sum(d => d.call_wip || 0),
            call_rejected:        sum(d => d.call_rejected || 0),
            call_rescheduled:     sum(d => d.call_rescheduled || 0),
            by_whatsapp:          sum(d => d.followup_by_whatsapp || 0),
            whatsapp_completed:   sum(d => d.whatsapp_completed || 0),
            whatsapp_wip:         sum(d => d.whatsapp_wip || 0),
            whatsapp_rejected:    sum(d => d.whatsapp_rejected || 0),
            whatsapp_rescheduled: sum(d => d.whatsapp_rescheduled || 0),
            by_email:             sum(d => d.followup_by_email || 0),
            email_completed:      sum(d => d.email_completed || 0),
            email_wip:            sum(d => d.email_wip || 0),
            email_rejected:       sum(d => d.email_rejected || 0),
            email_rescheduled:    sum(d => d.email_rescheduled || 0),
            by_visit:             sum(d => d.followup_by_visit || 0),
            visit_completed:      sum(d => d.visit_completed || 0),
            visit_wip:            sum(d => d.visit_wip || 0),
            visit_rejected:       sum(d => d.visit_rejected || 0),
            visit_rescheduled:    sum(d => d.visit_rescheduled || 0),
            quotation_sent:       filteredDailyPerformance.reduce((s, day) => s + getQuotationSentForDay(day.date), 0),
        };
    }, [filteredDailyPerformance, getQuotationSentForDay]);

    const chartOptions = useMemo(() => ({
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: {
                position: 'top',
                labels: {
                    usePointStyle: true,
                    boxWidth: 8,
                    font: { size: 11 }
                }
            },
            tooltip: {
                backgroundColor: 'rgba(255, 255, 255, 0.95)',
                titleColor: '#2D4059',
                bodyColor: '#4A5568',
                borderColor: '#E2E8F0',
                borderWidth: 1,
                padding: 8,
                boxPadding: 4,
                usePointStyle: true,
                titleFont: { size: 12 },
                bodyFont: { size: 11 }
            }
        },
        scales: {
            x: {
                grid: { display: false },
                ticks: { font: { size: 10 } }
            },
            y: {
                beginAtZero: true,
                grid: { color: '#EDF2F7' },
                ticks: { font: { size: 10 } }
            }
        }
    }), []);

    // Loading state — show skeleton cards instead of full-page spinner
    if (loading) {
        return (
            <div>
                {/* Skeleton stat cards */}
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-2.5 sm:gap-3 mb-4">
                    {Array.from({ length: 7 }).map((_, i) => (
                        <div key={i} className="bg-white rounded-lg shadow-sm p-3 border border-gray-200 min-h-[90px] flex flex-col justify-between animate-pulse">
                            <div className="h-3 bg-gray-200 rounded w-3/4 mx-auto"></div>
                            <div className="h-6 bg-gray-200 rounded w-1/2 mx-auto mt-2"></div>
                        </div>
                    ))}
                </div>

                {/* Skeleton charts */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-5">
                    {Array.from({ length: 2 }).map((_, i) => (
                        <div key={i} className="bg-white rounded-xl shadow-lg p-5 border border-gray-100 animate-pulse">
                            <div className="h-4 bg-gray-200 rounded w-1/3 mb-4"></div>
                            <div className="h-56 bg-gray-100 rounded"></div>
                        </div>
                    ))}
                </div>

                {/* Skeleton table */}
                <div className="bg-white rounded-lg shadow-sm border border-gray-200 mt-5 animate-pulse">
                    <div className="px-4 py-3 border-b border-gray-200">
                        <div className="h-4 bg-gray-200 rounded w-1/4"></div>
                    </div>
                    <div className="p-4 space-y-2">
                        {Array.from({ length: 6 }).map((_, i) => (
                            <div key={i} className="h-8 bg-gray-100 rounded"></div>
                        ))}
                    </div>
                </div>
            </div>
        );
    }

    // Error state
    if (error) {
        return (
            <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
                <svg className="w-14 h-14 text-red-400 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <h3 className="text-base font-semibold text-red-800 mb-1.5">Error</h3>
                <p className="text-xs text-red-600">{error}</p>
                <button
                    onClick={() => fetchMyPerformance()}
                    className="mt-3 px-3 py-1.5 bg-red-600 text-white rounded-lg text-xs hover:bg-red-700 transition-colors"
                >
                    Retry
                </button>
            </div>
        );
    }

    // Main render
    return (
        <div>
            {/* Stats Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-2.5 sm:gap-3 mb-4">
                <div
                    onClick={handleOpenAllFollowups}
                    className="group relative bg-white rounded-lg shadow-sm p-3 border border-gray-200 hover:shadow-md hover:border-[#2f3192] transition-all text-center cursor-pointer flex flex-col justify-between min-h-[90px]"
                >
                    <h3 className="text-[11px] sm:text-[12px] font-semibold leading-tight group-hover:font-bold transition-all" style={{ color: themeColor }}>
                        Total Calls and Follow-ups
                        {branchAssetCount > 0 && (
                            <span className="block text-[10px] text-black font-semibold mt-0.5">
                                ({branchAssetCount} assets)
                            </span>
                        )}
                    </h3>
                    <p className="text-lg sm:text-xl font-bold text-black mt-1">
                        <TimeValue>{performance.total_followups || 0}</TimeValue>
                    </p>

                    {/* Hover Tooltip */}
                    <div className="pointer-events-none absolute left-1/2 -translate-x-1/2 -top-8 opacity-0 group-hover:opacity-100 transition-opacity duration-150 z-20">
                        <div className="bg-black text-white text-[10px] font-medium rounded-md px-2 py-1 whitespace-nowrap shadow-lg">
                            Click to view all follow-ups
                            <div className="absolute left-1/2 -translate-x-1/2 top-full w-0 h-0 border-l-4 border-r-4 border-t-4 border-l-transparent border-r-transparent border-t-black"></div>
                        </div>
                    </div>
                </div>

                <div className="bg-white rounded-lg shadow-sm p-3 border border-gray-200 hover:shadow-md transition-shadow text-center flex flex-col justify-between min-h-[90px]">
                    <h3 className="text-[11px] sm:text-[12px] font-semibold text-black leading-tight">Work In Progress</h3>
                    <p className="text-lg sm:text-xl font-bold text-black mt-1"><TimeValue>{performance.wip_count || 0}</TimeValue></p>
                </div>

                <div className="bg-white rounded-lg shadow-sm p-3 border border-gray-200 hover:shadow-md transition-shadow text-center flex flex-col justify-between min-h-[90px]">
                    <h3 className="text-[11px] sm:text-[12px] font-semibold text-black leading-tight">Rescheduled</h3>
                    <p className="text-lg sm:text-xl font-bold text-black mt-1"><TimeValue>{performance.rescheduled_count || 0}</TimeValue></p>
                </div>

                <div className="bg-white rounded-lg shadow-sm p-3 border border-gray-200 hover:shadow-md transition-shadow text-center flex flex-col justify-between min-h-[90px]">
                    <h3 className="text-[11px] sm:text-[12px] font-semibold text-black leading-tight">Rejected</h3>
                    <p className="text-lg sm:text-xl font-bold text-black mt-1"><TimeValue>{performance.rejected_count || 0}</TimeValue></p>
                </div>

                <div className="bg-white rounded-lg shadow-sm p-3 border border-gray-200 hover:shadow-md transition-shadow text-center flex flex-col justify-between min-h-[90px]">
                    <h3 className="text-[11px] sm:text-[12px] font-semibold text-black leading-tight">Completed</h3>
                    <p className="text-lg sm:text-xl font-bold text-black mt-1"><TimeValue>{performance.completed_count || 0}</TimeValue></p>
                </div>

                <div
                    onClick={handleOpenQuotationFollowups}
                    className="group relative bg-white rounded-lg shadow-sm p-3 border border-gray-200 hover:shadow-md hover:border-[#2f3192] transition-all text-center cursor-pointer flex flex-col justify-between min-h-[90px]"
                >
                    <h3 className="text-[11px] sm:text-[12px] font-semibold leading-tight group-hover:font-bold transition-all" style={{ color: themeColor }}>
                        Quotation Required
                    </h3>
                    <p className="text-lg sm:text-xl font-bold text-black mt-1">
                        <TimeValue>{quotationCount}</TimeValue>
                    </p>

                    {/* Hover Tooltip */}
                    <div className="pointer-events-none absolute left-1/2 -translate-x-1/2 -top-8 opacity-0 group-hover:opacity-100 transition-opacity duration-150 z-20">
                        <div className="bg-black text-white text-[10px] font-medium rounded-md px-2 py-1 whitespace-nowrap shadow-lg">
                            Click to view quotation follow-ups
                            <div className="absolute left-1/2 -translate-x-1/2 top-full w-0 h-0 border-l-4 border-r-4 border-t-4 border-l-transparent border-r-transparent border-t-black"></div>
                        </div>
                    </div>
                </div>
                <div
                    onClick={handleOpenQuotationSentFollowups}
                    className="group relative bg-white rounded-lg shadow-sm p-3 border border-gray-200 hover:shadow-md hover:border-[#2f3192] transition-all text-center cursor-pointer flex flex-col justify-between min-h-[90px]"
                >
                    <h3 className="text-[11px] sm:text-[12px] font-semibold leading-tight group-hover:font-bold transition-all" style={{ color: themeColor }}>
                        Quotation Sent
                    </h3>
                    <p className="text-lg sm:text-xl font-bold text-black mt-1">
                        <TimeValue>{quotationSentCount}</TimeValue>
                    </p>

                    {/* Hover Tooltip */}
                    <div className="pointer-events-none absolute left-1/2 -translate-x-1/2 -top-8 opacity-0 group-hover:opacity-100 transition-opacity duration-150 z-20">
                        <div className="bg-black text-white text-[10px] font-medium rounded-md px-2 py-1 whitespace-nowrap shadow-lg">
                            Click to view quotation sent customers
                            <div className="absolute left-1/2 -translate-x-1/2 top-full w-0 h-0 border-l-4 border-r-4 border-t-4 border-l-transparent border-r-transparent border-t-black"></div>
                        </div>
                    </div>
                </div>
                <div
                    onClick={handleOpenAddSrModal}
                    className="group relative bg-white rounded-lg shadow-sm p-3 border border-gray-200 hover:shadow-md hover:border-[#2f3192] transition-all text-center cursor-pointer flex flex-col justify-between min-h-[90px]"
                >
                    <h3 className="text-[11px] sm:text-[12px] font-semibold leading-tight group-hover:font-bold transition-all" style={{ color: themeColor }}>
                        Add New CSP SR
                    </h3>
                    <p className="text-lg sm:text-xl font-bold text-black mt-1">
                        {userCspSrCount}
                    </p>

                    <div className="pointer-events-none absolute left-1/2 -translate-x-1/2 -top-8 opacity-0 group-hover:opacity-100 transition-opacity duration-150 z-20">
                        <div className="bg-black text-white text-[10px] font-medium rounded-md px-2 py-1 whitespace-nowrap shadow-lg">
                            Click to manually add an SR to a CSP campaign
                            <div className="absolute left-1/2 -translate-x-1/2 top-full w-0 h-0 border-l-4 border-r-4 border-t-4 border-l-transparent border-r-transparent border-t-black"></div>
                        </div>
                    </div>
                </div>
                <div
                    onClick={handleOpenCspModal}
                    className="group relative bg-white rounded-lg shadow-sm p-3 border border-gray-200 hover:shadow-md hover:border-[#2f3192] transition-all text-center cursor-pointer flex flex-col justify-between min-h-[90px]"
                >
                    <h3 className="text-[11px] sm:text-[12px] font-semibold leading-tight group-hover:font-bold transition-all" style={{ color: themeColor }}>
                        Total CSP
                    </h3>
                    <p className="text-lg sm:text-xl font-bold text-black mt-1">
                        {cspData.total_instances}
                    </p>

                    <div className="pointer-events-none absolute left-1/2 -translate-x-1/2 -top-8 opacity-0 group-hover:opacity-100 transition-opacity duration-150 z-20">
                        <div className="bg-black text-white text-[10px] font-medium rounded-md px-2 py-1 whitespace-nowrap shadow-lg">
                            Click to view CSP customers & due dates
                            <div className="absolute left-1/2 -translate-x-1/2 top-full w-0 h-0 border-l-4 border-r-4 border-t-4 border-l-transparent border-r-transparent border-t-black"></div>
                        </div>
                    </div>
                </div>
                <div
                    onClick={handleOpenOpenCspModal}
                    className="group relative bg-white rounded-lg shadow-sm p-3 border border-gray-200 hover:shadow-md hover:border-[#2f3192] transition-all text-center cursor-pointer flex flex-col justify-between min-h-[90px]"
                >
                    <h3 className="text-[11px] sm:text-[12px] font-semibold leading-tight group-hover:font-bold transition-all" style={{ color: themeColor }}>
                        Open CSP
                    </h3>
                    <p className="text-lg sm:text-xl font-bold text-black mt-1">
                        {openCspInstanceCount}
                    </p>

                    <div className="pointer-events-none absolute left-1/2 -translate-x-1/2 -top-8 opacity-0 group-hover:opacity-100 transition-opacity duration-150 z-20">
                        <div className="bg-black text-white text-[10px] font-medium rounded-md px-2 py-1 whitespace-nowrap shadow-lg">
                            Click to view open SR CSP records
                            <div className="absolute left-1/2 -translate-x-1/2 top-full w-0 h-0 border-l-4 border-r-4 border-t-4 border-l-transparent border-r-transparent border-t-black"></div>
                        </div>
                    </div>
                </div>
                <div
                    onClick={handleOpenCspQuotationFollowups}
                    className="group relative bg-white rounded-lg shadow-sm p-3 border border-gray-200 hover:shadow-md hover:border-[#2f3192] transition-all text-center cursor-pointer flex flex-col justify-between min-h-[90px]"
                >
                    <h3 className="text-[11px] sm:text-[12px] font-semibold leading-tight group-hover:font-bold transition-all" style={{ color: themeColor }}>
                        CSP Quotation Required
                    </h3>
                    <p className="text-lg sm:text-xl font-bold text-black mt-1">
                        {cspQuotationCount}
                    </p>

                    <div className="pointer-events-none absolute left-1/2 -translate-x-1/2 -top-8 opacity-0 group-hover:opacity-100 transition-opacity duration-150 z-20">
                        <div className="bg-black text-white text-[10px] font-medium rounded-md px-2 py-1 whitespace-nowrap shadow-lg">
                            Click to view CSP quotation follow-ups
                            <div className="absolute left-1/2 -translate-x-1/2 top-full w-0 h-0 border-l-4 border-r-4 border-t-4 border-l-transparent border-r-transparent border-t-black"></div>
                        </div>
                    </div>
                </div>
                <div
                    onClick={handleOpenCspQuotationSentFollowups}
                    className="group relative bg-white rounded-lg shadow-sm p-3 border border-gray-200 hover:shadow-md hover:border-[#2f3192] transition-all text-center cursor-pointer flex flex-col justify-between min-h-[90px]"
                >
                    <h3 className="text-[11px] sm:text-[12px] font-semibold leading-tight group-hover:font-bold transition-all" style={{ color: themeColor }}>
                        CSP Quotation Sent
                    </h3>
                    <p className="text-lg sm:text-xl font-bold text-black mt-1">
                        {cspQuotationSentCount}
                    </p>

                    <div className="pointer-events-none absolute left-1/2 -translate-x-1/2 -top-8 opacity-0 group-hover:opacity-100 transition-opacity duration-150 z-20">
                        <div className="bg-black text-white text-[10px] font-medium rounded-md px-2 py-1 whitespace-nowrap shadow-lg">
                            Click to view CSP quotation sent customers
                            <div className="absolute left-1/2 -translate-x-1/2 top-full w-0 h-0 border-l-4 border-r-4 border-t-4 border-l-transparent border-r-transparent border-t-black"></div>
                        </div>
                    </div>
                </div>
                <div
                    onClick={() => setShowCancelledCspModal(true)}
                    className="group relative bg-white rounded-lg shadow-sm p-3 border border-gray-200 hover:shadow-md hover:border-[#2f3192] transition-all text-center cursor-pointer flex flex-col justify-between min-h-[90px]"
                >
                    <h3 className="text-[11px] sm:text-[12px] font-semibold leading-tight group-hover:font-bold transition-all" style={{ color: themeColor }}>
                        Letter For Warranty Lapse
                    </h3>
                    <p className="text-lg sm:text-xl font-bold text-black mt-1">
                        —
                    </p>

                    <div className="pointer-events-none absolute left-1/2 -translate-x-1/2 -top-8 opacity-0 group-hover:opacity-100 transition-opacity duration-150 z-20">
                        <div className="bg-black text-white text-[10px] font-medium rounded-md px-2 py-1 whitespace-nowrap shadow-lg">
                            Coming soon
                            <div className="absolute left-1/2 -translate-x-1/2 top-full w-0 h-0 border-l-4 border-r-4 border-t-4 border-l-transparent border-r-transparent border-t-black"></div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Charts Section */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-5">

                <div className="bg-gradient-to-br from-white to-gray-50 rounded-xl shadow-lg p-5 border border-gray-100">
                    {/* Header with stats summary */}
                    <div className="flex justify-between items-start mb-4">
                        <div>
                            <h3 className="text-base font-bold text-gray-800">Status Comparison</h3>
                            <p className="text-xs text-gray-500 mt-0.5">Distribution of all follow-up statuses</p>
                        </div>
                        <div className="rounded-lg px-3 py-1.5">
                            <span className="text-xs font-semibold text-black">
                                Total: {(performance.completed_count + performance.wip_count +
                                    performance.rejected_count + performance.rescheduled_count).toLocaleString()}
                            </span>
                        </div>
                    </div>

                    {/* Chart Container */}
                    <div className="h-56 w-full">
                        <Bar data={statusBarData} options={statusBarOptions} />
                    </div>
                </div>

                <div className="bg-white rounded-lg shadow-sm p-4 border border-gray-200">
                    <h3 className="text-sm font-bold text-black mb-3">Follow-up Type Distribution</h3>
                    <div className="h-56 w-full flex items-center justify-center">
                        <div className="w-full h-full max-w-[260px] mx-auto">
                            {performance.total_followups > 0 ? (
                                <Pie data={followupTypeChartData} options={chartOptions} />
                            ) : (
                                <div className="flex items-center justify-center h-full text-xs text-gray-400">
                                    No data to display
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Non-Campaign Unique Customers Card */}
            {nonFollowupCustomerStats && (
                <div
                    onClick={handleOpenNonCampaignModal}
                    className="group bg-white rounded-lg shadow-sm p-2.5 sm:p-3 border border-gray-200 hover:shadow-md hover:border-[#2f3192] transition-all cursor-pointer col-span-1 sm:col-span-2 lg:col-span-5"
                    title="Click to view all non-campaign customers"
                >
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">

                        {/* Title + Total */}
                        <div className="flex items-center gap-2 shrink-0">
                            <h3 className="text-[11px] sm:text-sm font-semibold whitespace-nowrap group-hover:font-bold transition-all" style={{ color: themeColor }}>
                                Non-Drive Customers Reached Count
                            </h3>
                            <span
                                className="text-sm sm:text-base font-bold px-2 py-0.5 rounded-full whitespace-nowrap"
                                style={{ backgroundColor: `${themeColor}15`, color: themeColor }}
                            >
                                {nonFollowupCustomerStats.total_unique_customers}
                            </span>
                        </div>

                        {/* Status Breakdown Pills */}
                        <div className="flex flex-wrap items-center gap-1.5">

                            {/* WIP */}
                            <div className="flex items-center gap-1 bg-yellow-50 border border-yellow-200 rounded-full px-2 py-0.5">
                                <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 inline-block"></span>
                                <span className="text-[10px] sm:text-[11px] font-medium text-yellow-700">W</span>
                                <span className="text-[10px] sm:text-[11px] font-bold text-yellow-800">
                                    {nonFollowupCustomerStats.wip}
                                </span>
                                {nonFollowupCustomerStats.total_unique_customers > 0 && (
                                    <span className="text-[9px] text-yellow-600">
                                        ({((nonFollowupCustomerStats.wip / nonFollowupCustomerStats.total_unique_customers) * 100).toFixed(0)}%)
                                    </span>
                                )}
                            </div>

                            {/* Rejected */}
                            <div className="flex items-center gap-1 bg-red-50 border border-red-200 rounded-full px-2 py-0.5">
                                <span className="w-1.5 h-1.5 rounded-full bg-red-500 inline-block"></span>
                                <span className="text-[10px] sm:text-[11px] font-medium text-red-700">R</span>
                                <span className="text-[10px] sm:text-[11px] font-bold text-red-800">
                                    {nonFollowupCustomerStats.rejected}
                                </span>
                                {nonFollowupCustomerStats.total_unique_customers > 0 && (
                                    <span className="text-[9px] text-red-600">
                                        ({((nonFollowupCustomerStats.rejected / nonFollowupCustomerStats.total_unique_customers) * 100).toFixed(0)}%)
                                    </span>
                                )}
                            </div>

                            {/* Rescheduled / FR */}
                            <div className="flex items-center gap-1 bg-purple-50 border border-purple-200 rounded-full px-2 py-0.5">
                                <span className="w-1.5 h-1.5 rounded-full bg-purple-500 inline-block"></span>
                                <span className="text-[10px] sm:text-[11px] font-medium text-purple-700">FR</span>
                                <span className="text-[10px] sm:text-[11px] font-bold text-purple-800">
                                    {nonFollowupCustomerStats.rescheduled}
                                </span>
                                {nonFollowupCustomerStats.total_unique_customers > 0 && (
                                    <span className="text-[9px] text-purple-600">
                                        ({((nonFollowupCustomerStats.rescheduled / nonFollowupCustomerStats.total_unique_customers) * 100).toFixed(0)}%)
                                    </span>
                                )}
                            </div>

                            {/* Completed */}
                            <div className="flex items-center gap-1 bg-green-50 border border-green-200 rounded-full px-2 py-0.5">
                                <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block"></span>
                                <span className="text-[10px] sm:text-[11px] font-medium text-green-700">C</span>
                                <span className="text-[10px] sm:text-[11px] font-bold text-green-800">
                                    {nonFollowupCustomerStats.completed}
                                </span>
                                {nonFollowupCustomerStats.total_unique_customers > 0 && (
                                    <span className="text-[9px] text-green-600">
                                        ({((nonFollowupCustomerStats.completed / nonFollowupCustomerStats.total_unique_customers) * 100).toFixed(0)}%)
                                    </span>
                                )}
                            </div>

                            {/* Pending - only show if > 0 */}
                            {nonFollowupCustomerStats.pending > 0 && (
                                <div className="flex items-center gap-1 bg-gray-50 border border-gray-200 rounded-full px-2 py-0.5">
                                    <span className="w-1.5 h-1.5 rounded-full bg-gray-400 inline-block"></span>
                                    <span className="text-[10px] sm:text-[11px] font-medium text-gray-600">P</span>
                                    <span className="text-[10px] sm:text-[11px] font-bold text-gray-700">
                                        {nonFollowupCustomerStats.pending}
                                    </span>
                                </div>
                            )}

                        </div>
                    </div>
                </div>
            )}

            {/* Daily Performance Table */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden mt-5">
                <div className="px-3 sm:px-4 py-3 border-b border-gray-200 bg-gradient-to-r from-gray-50 to-white">
                    <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3">
                        <div className="flex-1">
                            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                                <div>
                                    <h3 className="text-sm sm:text-base font-semibold text-black">Daily Performance Breakdown</h3>
                                    <p className="text-[11px] sm:text-xs text-black mt-0.5">
                                        {filterLabel} • {filteredDailyPerformance.length} days data
                                    </p>
                                </div>

                                <div className="flex items-center gap-2">
                                    {/* Filter Dropdown */}
                                    <div className="relative">
                                        <select
                                            value={tableTimeFilter}
                                            onChange={(e) => setTableTimeFilter(e.target.value)}
                                            className="px-3 py-1.5 pr-8 rounded-lg text-xs font-medium bg-white border border-gray-300 text-black focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent appearance-none cursor-pointer"
                                        >
                                            <option value="all">All Time</option>
                                            <option value="lastMonth">Last 30 Days</option>
                                            <option value="last3Months">Last 90 Days</option>
                                        </select>
                                        <svg className="absolute right-2 top-1/2 transform -translate-y-1/2 w-3.5 h-3.5 text-black pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                        </svg>
                                    </div>

                                    {/* Export Button - only show if user has export permission */}
                                    {canExport && (
                                        <button
                                            onClick={exportToExcel}
                                            className="px-3 py-1.5 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center justify-center gap-1.5 text-xs whitespace-nowrap"
                                        >
                                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                            </svg>
                                            Export
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="relative">
                    {/* Top scrollbar */}
                    <div
                        ref={topScrollRef}
                        className="overflow-x-auto overflow-y-hidden mb-0.5 custom-scrollbar-top hidden sm:block"
                        style={{ direction: 'ltr' }}
                        onScroll={handleTopScroll}
                    >
                        <div className="h-2" style={{ width: tableWidthRef.current }}></div>
                    </div>

                    {/* Main table container */}
                    <div
                        ref={bottomScrollRef}
                        className="overflow-x-auto max-h-[500px] overflow-y-auto"
                        style={{ direction: 'ltr', WebkitOverflowScrolling: 'touch' }}
                        onScroll={handleBottomScroll}
                    >
                        <table className="min-w-[1200px] sm:min-w-full divide-y divide-gray-200 border-collapse" ref={tableRef}>
                            <thead className="bg-gray-50 sticky top-0 z-10">
                                <tr>
                                    <th className="px-2 py-1 text-center text-[11px] font-semibold text-black uppercase tracking-wider border border-gray-300 bg-gray-50 w-[50px]">S.NO</th>
                                    <th className="px-2 py-1 text-center text-[11px] font-semibold text-black uppercase tracking-wider border border-gray-300 bg-gray-50 w-[90px]">Date</th>
                                    <th className="px-2 py-1 text-center text-[11px] font-semibold text-black uppercase tracking-wider border border-gray-300 bg-gray-50 w-[220px]">
                                        <div>Campaign</div>
                                        <div>Name</div>
                                    </th>
                                    <th className="px-2 py-1 text-center text-[11px] font-semibold text-black uppercase tracking-wider border border-gray-300 bg-gray-50 w-[100px]">
                                        <div>Start Time</div>
                                    </th>
                                    <th className="px-2 py-1 text-center text-[11px] font-semibold text-black uppercase tracking-wider border border-gray-300 bg-gray-50 w-[100px]">
                                        <div>End Time</div>
                                    </th>
                                    <th className="px-2 py-1 text-center text-[11px] font-semibold text-black uppercase tracking-wider border border-gray-300 bg-gray-50 w-[100px]">
                                        <div>Working</div>
                                        <div>Hours</div>
                                    </th>
                                    <th className="px-2 py-1 text-center text-[11px] font-semibold text-black uppercase tracking-wider border border-gray-300 bg-gray-50 w-[60px]">Total Calls</th>
                                    <th className="px-2 py-1 text-center text-[11px] font-semibold text-black uppercase tracking-wider border border-gray-300 bg-gray-50 w-[130px]">
                                        <div>By Call</div>
                                        <div>(C/W/R/FR)</div>
                                    </th>
                                    <th className="px-2 py-1 text-center text-[11px] font-semibold text-black uppercase tracking-wider border border-gray-300 bg-gray-50 w-[150px]">
                                        <div>By WhatsApp</div>
                                        <div>(C/W/R/FR)</div>
                                    </th>
                                    <th className="px-2 py-1 text-center text-[11px] font-semibold text-black uppercase tracking-wider border border-gray-300 bg-gray-50 w-[130px]">
                                        <div>By Email</div>
                                        <div>(C/W/R/FR)</div>
                                    </th>
                                    <th className="px-2 py-1 text-center text-[11px] font-semibold text-black uppercase tracking-wider border border-gray-300 bg-gray-50 w-[130px]">
                                        <div>By Visit</div>
                                        <div>(C/W/R/FR)</div>
                                    </th>
                                    <th className="px-2 py-1 text-center text-[11px] font-semibold text-black uppercase tracking-wider border border-gray-300 bg-gray-50 w-[90px]">
                                        <div>QT</div>
                                        <div>Sent</div>
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-100">
                                {filteredDailyPerformance.length > 0 ? (
                                    filteredDailyPerformance.map((day, index) => (
                                        <tr key={index} className="hover:bg-gray-50 transition-colors duration-150">
                                            <td className="px-2 py-1 whitespace-nowrap text-[11px] text-black border border-gray-200 text-center">{index + 1}</td>
                                            <td className="px-2 py-1 whitespace-nowrap text-[11px] font-medium text-black border border-gray-200 text-center">
                                                {new Date(day.date).toLocaleDateString('en-IN', {
                                                    day: '2-digit',
                                                    month: 'short',
                                                    year: 'numeric'
                                                })}
                                            </td>
                                            <td className="px-2 py-1 text-[11px] text-black border border-gray-200 text-center align-middle">
                                                <span className="block break-words whitespace-normal" style={{ wordBreak: 'break-word' }}>
                                                    {day.campaign_name || 'N/A'}
                                                </span>
                                            </td>
                                            <td className="px-2 py-1 whitespace-nowrap text-[11px] text-black border border-gray-200 text-center">
                                                {day.first_followup_time ? convertUTCToIST(day.first_followup_time) : '-'}
                                            </td>
                                            <td className="px-2 py-1 whitespace-nowrap text-[11px] text-black border border-gray-200 text-center">
                                                {day.last_followup_time ? convertUTCToIST(day.last_followup_time) : '-'}
                                            </td>
                                            <td className="px-2 py-1 whitespace-nowrap text-[11px] border border-gray-200 text-center text-black">
                                                {day.total_working_hours ? `${day.total_working_hours} hrs` : '-'}
                                            </td>
                                            <td className="px-2 py-1 whitespace-nowrap border border-gray-200 text-center">
                                                <div className="flex flex-col items-center gap-0.5">
                                                    <span className="px-1.5 py-0.5 text-[11px] font-medium rounded-full inline-block" style={{ backgroundColor: `${themeColor}15`, color: themeColor }}>
                                                        {day.total_followups || 0}
                                                    </span>
                                                    <span className="text-[10px] text-black hidden sm:block whitespace-nowrap">
                                                        (C-{(day.call_completed || 0) + (day.whatsapp_completed || 0) + (day.email_completed || 0) + (day.visit_completed || 0)},
                                                        W-{(day.call_wip || 0) + (day.whatsapp_wip || 0) + (day.email_wip || 0) + (day.visit_wip || 0)},
                                                        R-{(day.call_rejected || 0) + (day.whatsapp_rejected || 0) + (day.email_rejected || 0) + (day.visit_rejected || 0)},
                                                        FR-{(day.call_rescheduled || 0) + (day.whatsapp_rescheduled || 0) + (day.email_rescheduled || 0) + (day.visit_rescheduled || 0)})
                                                    </span>
                                                </div>
                                            </td>
                                            <td className="px-2 py-1 whitespace-nowrap text-[11px] border border-gray-200 text-center">
                                                <div className="flex flex-col items-center">
                                                    <span className="font-medium text-black">{day.followup_by_call || 0}</span>
                                                    <span className="text-[10px] text-black hidden sm:inline">
                                                        (C-{day.call_completed || 0}, W-{day.call_wip || 0}, R-{day.call_rejected || 0}, FR-{day.call_rescheduled || 0})
                                                    </span>
                                                </div>
                                            </td>
                                            <td className="px-2 py-1 whitespace-nowrap text-[11px] border border-gray-200 text-center">
                                                <div className="flex flex-col items-center">
                                                    <span className="font-medium text-black">{day.followup_by_whatsapp || 0}</span>
                                                    <span className="text-[10px] text-black hidden sm:inline">
                                                        (C-{day.whatsapp_completed || 0}, W-{day.whatsapp_wip || 0}, R-{day.whatsapp_rejected || 0}, FR-{day.whatsapp_rescheduled || 0})
                                                    </span>
                                                </div>
                                            </td>
                                            <td className="px-2 py-1 whitespace-nowrap text-[11px] border border-gray-200 text-center">
                                                <div className="flex flex-col items-center">
                                                    <span className="font-medium text-black">{day.followup_by_email || 0}</span>
                                                    <span className="text-[10px] text-black hidden sm:inline">
                                                        (C-{day.email_completed || 0}, W-{day.email_wip || 0}, R-{day.email_rejected || 0}, FR-{day.email_rescheduled || 0})
                                                    </span>
                                                </div>
                                            </td>
                                            <td className="px-2 py-1 whitespace-nowrap text-[11px] border border-gray-200 text-center">
                                                <div className="flex flex-col items-center">
                                                    <span className="font-medium text-black">{day.followup_by_visit || 0}</span>
                                                    <span className="text-[10px] text-black hidden sm:inline">
                                                        (C-{day.visit_completed || 0}, W-{day.visit_wip || 0}, R-{day.visit_rejected || 0}, FR-{day.visit_rescheduled || 0})
                                                    </span>
                                                </div>
                                            </td>
                                            <td className="px-2 py-1 whitespace-nowrap text-[11px] border border-gray-200 text-center">
                                                <span
                                                    className="px-1.5 py-0.5 text-[11px] font-medium rounded-full inline-block"
                                                    style={{ backgroundColor: `${themeColor}15`, color: themeColor }}
                                                >
                                                    {getQuotationSentForDay(day.date)}
                                                </span>
                                            </td>
                                        </tr>
                                    ))
                                ) : (
                                    <tr>
                                        <td colSpan="12" className="px-3 py-4 text-center text-xs text-black border border-gray-200">
                                            No daily performance data available for selected period
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                            {filteredDailyPerformance.length > 0 && (
                                <tfoot className="bg-gray-100 border-t-2 border-gray-300 sticky bottom-0">
                                    <tr>
                                        <td className="px-2 py-1 whitespace-nowrap text-[11px] font-bold text-black border border-gray-300 bg-gray-100 text-center">-</td>
                                        <td className="px-2 py-1 whitespace-nowrap text-[11px] font-bold text-black border border-gray-300 bg-gray-100 text-center">TOTAL</td>
                                        <td className="px-2 py-1 whitespace-nowrap text-[11px] text-black border border-gray-300 bg-gray-100 text-center">-</td>
                                        <td className="px-2 py-1 whitespace-nowrap text-[11px] text-black border border-gray-300 bg-gray-100 text-center">-</td>
                                        <td className="px-2 py-1 whitespace-nowrap text-[11px] text-black border border-gray-300 bg-gray-100 text-center">-</td>
                                        <td className="px-2 py-1 whitespace-nowrap text-[11px] text-black border border-gray-300 bg-gray-100 text-center">-</td>
                                        <td className="px-2 py-1 border border-gray-300 bg-gray-100 text-center">
                                            <div className="flex flex-col items-center gap-0.5">
                                                <span className="px-1.5 py-0.5 text-[11px] font-bold rounded-full" style={{ backgroundColor: `${themeColor}25`, color: themeColor }}>
                                                    {dailyTotals.total_followups}
                                                </span>
                                                <span className="text-[10px] text-black hidden sm:block whitespace-nowrap">
                                                    (C-{dailyTotals.completed_all},
                                                    W-{dailyTotals.wip_all},
                                                    R-{dailyTotals.rejected_all},
                                                    FR-{dailyTotals.rescheduled_all})
                                                </span>
                                            </div>
                                        </td>
                                        <td className="px-2 py-1 whitespace-nowrap text-[11px] border border-gray-300 bg-gray-100 text-center">
                                            <div className="flex flex-col items-center">
                                                <span className="font-bold text-black">
                                                    {dailyTotals.by_call}
                                                </span>
                                                <span className="text-[10px] text-black hidden sm:inline">
                                                    (C-{dailyTotals.call_completed},
                                                    W-{dailyTotals.call_wip},
                                                    R-{dailyTotals.call_rejected},
                                                    FR-{dailyTotals.call_rescheduled})
                                                </span>
                                            </div>
                                        </td>
                                        <td className="px-2 py-1 whitespace-nowrap text-[11px] border border-gray-300 bg-gray-100 text-center">
                                            <div className="flex flex-col items-center">
                                                <span className="font-bold text-black">
                                                    {dailyTotals.by_whatsapp}
                                                </span>
                                                <span className="text-[10px] text-black hidden sm:inline">
                                                    (C-{dailyTotals.whatsapp_completed},
                                                    W-{dailyTotals.whatsapp_wip},
                                                    R-{dailyTotals.whatsapp_rejected},
                                                    FR-{dailyTotals.whatsapp_rescheduled})
                                                </span>
                                            </div>
                                        </td>
                                        <td className="px-2 py-1 whitespace-nowrap text-[11px] border border-gray-300 bg-gray-100 text-center">
                                            <div className="flex flex-col items-center">
                                                <span className="font-bold text-black">
                                                    {dailyTotals.by_email}
                                                </span>
                                                <span className="text-[10px] text-black hidden sm:inline">
                                                    (C-{dailyTotals.email_completed},
                                                    W-{dailyTotals.email_wip},
                                                    R-{dailyTotals.email_rejected},
                                                    FR-{dailyTotals.email_rescheduled})
                                                </span>
                                            </div>
                                        </td>
                                        <td className="px-2 py-1 whitespace-nowrap text-[11px] border border-gray-300 bg-gray-100 text-center">
                                            <div className="flex flex-col items-center">
                                                <span className="font-bold text-black">
                                                    {dailyTotals.by_visit}
                                                </span>
                                                <span className="text-[10px] text-black hidden sm:inline">
                                                    (C-{dailyTotals.visit_completed},
                                                    W-{dailyTotals.visit_wip},
                                                    R-{dailyTotals.visit_rejected},
                                                    FR-{dailyTotals.visit_rescheduled})
                                                </span>
                                            </div>
                                        </td>
                                        <td className="px-2 py-1 whitespace-nowrap text-[11px] border border-gray-300 bg-gray-100 text-center">
                                            <span
                                                className="px-1.5 py-0.5 text-[11px] font-bold rounded-full"
                                                style={{ backgroundColor: `${themeColor}25`, color: themeColor }}
                                            >
                                                {dailyTotals.quotation_sent}
                                            </span>
                                        </td>
                                    </tr>
                                </tfoot>
                            )}
                        </table>
                    </div>
                </div>

                {filteredDailyPerformance.length > 0 && (
                    <div className="px-3 sm:px-4 py-2 bg-gray-50 border-t border-gray-200 text-[11px] text-black flex flex-col sm:flex-row sm:justify-between sm:items-center gap-1.5">
                        <span className="flex flex-wrap items-center justify-center gap-2">
                            <span className="flex items-center gap-0.5">
                                <span className="w-1.5 h-1.5 rounded-full bg-[#2f3192]"></span>
                                <span className="text-[11px]">Call</span>
                            </span>
                            <span className="flex items-center gap-0.5">
                                <span className="w-1.5 h-1.5 rounded-full bg-[#25D366]"></span>
                                <span className="text-[11px]">WhatsApp</span>
                            </span>
                            <span className="flex items-center gap-0.5">
                                <span className="w-1.5 h-1.5 rounded-full bg-[#F5A623]"></span>
                                <span className="text-[11px]">Email</span>
                            </span>
                            <span className="flex items-center gap-0.5">
                                <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: themeColor }}></span>
                                <span className="text-[11px]">Visit</span>
                            </span>
                            <span className="text-[10px] text-black hidden sm:inline">C=Completed, W=In Progress, R=Rejected, FR=Follow-up Rescheduled</span>
                        </span>
                        <span className="text-[10px] text-black text-center">
                            Showing {filteredDailyPerformance.length} of {dailyPerformance.length} total days
                        </span>
                    </div>
                )}
            </div>

            {/* Additional Performance Details */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mt-5">
                {performance.recent_activities && performance.recent_activities.length > 0 && (
                    <div className="bg-white rounded-lg shadow-sm p-4 border border-gray-200">
                        <h3 className="text-sm font-semibold text-black mb-3">Recent Activities</h3>
                        <div className="space-y-2.5">
                            {performance.recent_activities.slice(0, 5).map((activity, index) => (
                                <div key={index} className="flex items-center justify-between py-1.5 border-b border-gray-200">
                                    <div>
                                        <p className="text-xs font-medium text-black">{activity.activity_name}</p>
                                    </div>
                                    <span className="px-1.5 py-0.5 rounded-full text-[11px] font-medium" style={{ backgroundColor: `${themeColor}20`, color: themeColor }}>
                                        {activity.count} times
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {performance.top_campaigns && performance.top_campaigns.length > 0 && (
                    <div className="bg-white rounded-lg shadow-sm p-4 border border-gray-200">
                        <h3 className="text-sm font-semibold text-black mb-3">Top Performing Campaigns</h3>
                        <div className="space-y-2.5">
                            {performance.top_campaigns.map((campaign, index) => (
                                <div key={index} className="flex items-center justify-between py-1.5 border-b border-gray-200">
                                    <div>
                                        <p className="text-xs font-medium text-black">{campaign.campaign_name}</p>
                                        <p className="text-[11px] text-black">{campaign.service}</p>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-xs font-bold" style={{ color: themeColor }}>{campaign.completed_count} completed</p>
                                        <p className="text-[11px] text-black">out of {campaign.total_followups}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {showCspModal && ReactDOM.createPortal(
                    <div className="fixed inset-0 backdrop-blur-sm bg-black/40 flex items-center justify-center z-[10000] p-3">
                        <div className="bg-white rounded-xl shadow-xl max-w-[95vw] w-full max-h-[92vh] overflow-hidden flex flex-col">
                            <div
                                className="px-4 py-3 border-b border-gray-200 flex flex-wrap justify-between items-center gap-2"
                                style={{ background: `linear-gradient(135deg, ${themeColor} 0%, #2c4a6e 100%)` }}
                            >
                                <div>
                                    <h3 className="text-base font-semibold text-white">
                                        CSP Status {userData?.branch ? `— ${userData.branch}` : ''}
                                    </h3>
                                    <p className="text-[11px] text-white/80 mt-0.5">
                                        {cspData.total_instances} instance(s) • Showing {filteredCspRows.length} of {cspData.total_rows} SR row(s)
                                    </p>
                                </div>
                                <div className="flex flex-wrap items-center gap-2">
                                    {/* Due Date - From */}
                                    <div className="flex items-center gap-1">
                                        <label className="text-[11px] text-white whitespace-nowrap">Due From:</label>
                                        <input
                                            type="date"
                                            value={cspDueFromDate}
                                            onChange={(e) => {
                                                const newFrom = e.target.value;
                                                setCspDueFromDate(newFrom);
                                                if (cspDueToDate && newFrom && new Date(cspDueToDate) < new Date(newFrom)) {
                                                    setCspDueToDate('');
                                                }
                                            }}
                                            max={cspDueToDate || undefined}
                                            className="border border-gray-300 rounded-md px-2 py-1 text-[11px] bg-white text-black"
                                        />
                                    </div>

                                    {/* Due Date - To */}
                                    <div className="flex items-center gap-1">
                                        <label className="text-[11px] text-white whitespace-nowrap">To:</label>
                                        <input
                                            type="date"
                                            value={cspDueToDate}
                                            onChange={(e) => {
                                                const newTo = e.target.value;
                                                if (cspDueFromDate && newTo && new Date(newTo) < new Date(cspDueFromDate)) {
                                                    return;
                                                }
                                                setCspDueToDate(newTo);
                                            }}
                                            min={cspDueFromDate || undefined}
                                            className="border border-gray-300 rounded-md px-2 py-1 text-[11px] bg-white text-black"
                                        />
                                    </div>

                                    {(cspSearchTerm || cspDueFromDate || cspDueToDate || cspSegmentFilter !== 'all') && (
                                        <button
                                            onClick={() => {
                                                setCspSearchTerm('');
                                                setCspDueFromDate('');
                                                setCspDueToDate('');
                                                setCspSegmentFilter('all');
                                            }}
                                            className="px-2 py-1 text-[11px] text-white border border-white/40 rounded-md bg-white/10 hover:bg-white/20 flex items-center gap-1"
                                            title="Clear filters"
                                        >
                                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                            </svg>
                                            Clear
                                        </button>
                                    )}

                                    {/* Segment filter */}
                                    <div className="flex items-center gap-1">
                                        <label className="text-[11px] text-white whitespace-nowrap">Segment:</label>
                                        <div className="relative">
                                            <select
                                                value={cspSegmentFilter}
                                                onChange={(e) => setCspSegmentFilter(e.target.value)}
                                                className="border border-gray-300 rounded-md pl-2 pr-6 py-1 text-[11px] bg-white text-black appearance-none cursor-pointer focus:outline-none"
                                            >
                                                <option value="all">All</option>
                                                {cspSegmentOptions.map(seg => (
                                                    <option key={seg} value={seg}>{seg}</option>
                                                ))}
                                            </select>
                                            <svg className="absolute right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 text-black pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                            </svg>
                                        </div>
                                    </div>

                                    {/* Search */}
                                    <input
                                        type="text"
                                        placeholder="Search instance, customer, SR..."
                                        value={cspSearchTerm}
                                        onChange={(e) => setCspSearchTerm(e.target.value)}
                                        className="border border-gray-300 rounded-lg px-2 py-1 text-xs w-56 bg-white focus:outline-none"
                                    />

                                    <button
                                        onClick={() => setShowCspModal(false)}
                                        className="w-7 h-7 sm:w-8 sm:h-8 bg-white rounded-lg flex items-center justify-center transition-all duration-200 group flex-shrink-0"
                                    >
                                        <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-black group-hover:rotate-90 transition-transform duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                        </svg>
                                    </button>
                                </div>
                            </div>

                            <div className="flex-1 overflow-auto p-3 max-h-[70vh]">
                                {loadingCsp ? (
                                    <div className="flex items-center justify-center py-10">
                                        <div className="w-8 h-8 border-2 border-t-2 border-t-[#2f3192] border-gray-200 rounded-full animate-spin"></div>
                                        <span className="ml-2 text-xs text-gray-600">Loading CSP data...</span>
                                    </div>
                                ) : filteredCspRows.length === 0 ? (
                                    <div className="text-center py-10 text-xs text-gray-500">
                                        {cspData.rows.length === 0
                                            ? 'No CSP data found for your branch.'
                                            : 'No CSP rows match the current filters.'}
                                    </div>
                                ) : (
                                    <div className="overflow-x-auto overflow-y-auto max-h-[60vh]">
                                        <table className="min-w-[1250px] w-full border-collapse text-[11px]">
                                            <thead className="bg-gray-100 sticky top-0 z-10">
                                                <tr>
                                                    <th className="px-2 py-0 border border-gray-300 text-center font-semibold text-black whitespace-nowrap bg-gray-100">S.No</th>
                                                    <th className="px-2 py-0 border border-gray-300 text-center font-semibold text-black whitespace-nowrap bg-gray-100">Instance ID</th>
                                                    <th className="px-2 py-0 border border-gray-300 text-center font-semibold text-black whitespace-nowrap bg-gray-100">Customer</th>
                                                    <th className="px-2 py-0 border border-gray-300 text-center font-semibold text-black whitespace-nowrap bg-gray-100">Branch</th>
                                                    <th className="px-2 py-0 border border-gray-300 text-center font-semibold text-black whitespace-nowrap bg-gray-100">GOEM/OEM</th>
                                                    <th className="px-2 py-0 border border-gray-300 text-center font-semibold text-black whitespace-nowrap bg-gray-100">SR Number</th>
                                                    <th className="px-2 py-0 border border-gray-300 text-center font-semibold text-black whitespace-nowrap bg-gray-100">SR Open Date</th>
                                                    <th className="px-2 py-0 border border-gray-300 text-center font-semibold text-black whitespace-nowrap bg-gray-100">SR Subtype</th>
                                                    <th className="px-2 py-0 border border-gray-300 text-center font-semibold text-black whitespace-nowrap bg-gray-100">SR Status</th>
                                                    <th className="px-2 py-0 border border-gray-300 text-center font-semibold text-black whitespace-nowrap bg-gray-100">Segment</th>
                                                    <th className="px-2 py-0 border border-gray-300 text-center font-semibold text-black whitespace-nowrap bg-gray-100">Due Date</th>
                                                    <th
                                                        className="px-2 py-0 border border-gray-300 text-center font-semibold text-black bg-gray-100 cursor-pointer select-none hover:bg-gray-200"
                                                        onClick={() => setCspDaysSort(s => s === 'desc' ? 'asc' : 'desc')}
                                                    >
                                                        <div className="flex items-center justify-center gap-1">
                                                            <div className="flex flex-col items-start">
                                                                <span>Due/Overdue</span>
                                                                <pre>    Days</pre>
                                                            </div>
                                                            <div className="flex flex-col items-center leading-none">
                                                                <span className={cspDaysSort === 'asc' ? 'text-black' : 'text-gray-300'}>▲</span>
                                                                <span className={cspDaysSort === 'desc' ? 'text-black' : 'text-gray-300'}>▼</span>
                                                            </div>
                                                        </div>
                                                    </th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-gray-100">
                                                {sortedCspRows.map((row, idx) => {
                                                    const dp = getCspDaysPass(row.due_date);
                                                    return (
                                                        <tr
                                                            key={idx}
                                                            className={`transition-colors ${dp > 0 ? 'bg-orange-300 hover:bg-orange-400' : 'hover:bg-gray-200'}`}
                                                        >
                                                            <td className="px-2 py-1 border border-gray-200 text-center">{idx + 1}</td>
                                                            <td className="px-2 py-1 border border-gray-200 text-center">
                                                                {row.instance_id ? (
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => handleOpenCustomerFromCsp(row)}
                                                                        className="font-medium text-[#2f3192] underline hover:text-[#1f2061] hover:font-bold cursor-pointer" title="Click to open customer details"
                                                                    >
                                                                        {row.instance_id}
                                                                    </button>
                                                                ) : '-'}
                                                            </td>
                                                            <td className="px-2 py-1 border border-gray-200 text-left">{row.customer_name || '-'}</td>
                                                            <td className="px-2 py-1 border border-gray-200 text-center">{row.branch_id || '-'}</td>
                                                            <td className="px-2 py-1 border border-gray-200 text-center">{row.goem_oem || '-'}</td>
                                                            <td className="px-2 py-1 border border-gray-200 text-center">{row.sr_number || '-'}</td>
                                                            <td className="px-2 py-1 border border-gray-200 text-center">{row.sr_open_date || '-'}</td>
                                                            <td className="px-2 py-1 border border-gray-200 text-center">{row.sr_subtype || '-'}</td>
                                                            <td className="px-2 py-1 border border-gray-200 text-center">{row.sr_status || '-'}</td>
                                                            <td className="px-2 py-1 border border-gray-200 text-center">{row.segment || '-'}</td>
                                                            <td className="px-2 py-1 border border-gray-200 text-center font-bold" style={{ backgroundColor: dp > 0 ? 'transparent' : (row.due_date ? '#ffdb62' : 'transparent') }}>
                                                                {/* {row.due_date || '-'} */}
                                                                -
                                                            </td>
                                                            <td
                                                                className="px-2 py-1 border border-gray-200 text-center font-semibold whitespace-nowrap"
                                                                style={{ color: dp === null ? '#6b7280' : dp > 0 ? '#dc2626' : '#16a34a' }}
                                                            >
                                                                {/* {dp === null ? '-' : dp > 0 ? `${dp} overdue` : dp === 0 ? 'Due today' : `${Math.abs(dp)} left`} */}
                                                                -
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </div>

                            <div className="px-4 py-2 border-t border-gray-200 bg-gray-50 flex justify-end">
                                <button
                                    onClick={() => setShowCspModal(false)}
                                    className="px-3 py-1.5 border border-gray-300 rounded-lg text-xs font-medium hover:bg-white text-black"
                                >
                                    Close
                                </button>
                            </div>
                        </div>
                    </div>,
                    document.body
                )}

                {showOpenCspModal && ReactDOM.createPortal(
                    <div className="fixed inset-0 backdrop-blur-sm bg-black/40 flex items-center justify-center z-[10000] p-3">
                        <div className="bg-white rounded-xl shadow-xl max-w-[95vw] w-full max-h-[92vh] overflow-hidden flex flex-col">
                            <div
                                className="px-4 py-3 border-b border-gray-200 flex flex-wrap justify-between items-center gap-2"
                                style={{ background: `linear-gradient(135deg, ${themeColor} 0%, #2c4a6e 100%)` }}
                            >
                                <div>
                                    <h3 className="text-base font-semibold text-white">
                                        Open CSP Status {userData?.branch ? `— ${userData.branch}` : ''}
                                    </h3>
                                    <p className="text-[11px] text-white/80 mt-0.5">
                                        {openCspInstanceCount} open instance(s) • Showing {filteredOpenCspRows.length} of {openCspRows.length} open SR row(s)
                                    </p>
                                </div>
                                <div className="flex flex-wrap items-center gap-2">
                                    {/* Due Date - From */}
                                    <div className="flex items-center gap-1">
                                        <label className="text-[11px] text-white whitespace-nowrap">Due From:</label>
                                        <input
                                            type="date"
                                            value={openCspDueFromDate}
                                            onChange={(e) => {
                                                const newFrom = e.target.value;
                                                setOpenCspDueFromDate(newFrom);
                                                if (openCspDueToDate && newFrom && new Date(openCspDueToDate) < new Date(newFrom)) {
                                                    setOpenCspDueToDate('');
                                                }
                                            }}
                                            max={openCspDueToDate || undefined}
                                            className="border border-gray-300 rounded-md px-2 py-1 text-[11px] bg-white text-black"
                                        />
                                    </div>

                                    {/* Due Date - To */}
                                    <div className="flex items-center gap-1">
                                        <label className="text-[11px] text-white whitespace-nowrap">To:</label>
                                        <input
                                            type="date"
                                            value={openCspDueToDate}
                                            onChange={(e) => {
                                                const newTo = e.target.value;
                                                if (openCspDueFromDate && newTo && new Date(newTo) < new Date(openCspDueFromDate)) {
                                                    return;
                                                }
                                                setOpenCspDueToDate(newTo);
                                            }}
                                            min={openCspDueFromDate || undefined}
                                            className="border border-gray-300 rounded-md px-2 py-1 text-[11px] bg-white text-black"
                                        />
                                    </div>

                                    {/* Segment filter */}
                                    <div className="flex items-center gap-1">
                                        <label className="text-[11px] text-white whitespace-nowrap">Segment:</label>
                                        <div className="relative">
                                            <select
                                                value={openCspSegmentFilter}
                                                onChange={(e) => setOpenCspSegmentFilter(e.target.value)}
                                                className="border border-gray-300 rounded-md pl-2 pr-6 py-1 text-[11px] bg-white text-black appearance-none cursor-pointer focus:outline-none"
                                            >
                                                <option value="all">All</option>
                                                {cspSegmentOptions.map(seg => (
                                                    <option key={seg} value={seg}>{seg}</option>
                                                ))}
                                            </select>
                                            <svg className="absolute right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 text-black pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                            </svg>
                                        </div>
                                    </div>

                                    {/* Clear filters */}
                                    {(openCspSearchTerm || openCspDueFromDate || openCspDueToDate || openCspSegmentFilter !== 'all') && (
                                        <button
                                            onClick={() => {
                                                setOpenCspSearchTerm('');
                                                setOpenCspDueFromDate('');
                                                setOpenCspDueToDate('');
                                                setOpenCspSegmentFilter('all');
                                            }}
                                            className="px-2 py-1 text-[11px] text-white border border-white/40 rounded-md bg-white/10 hover:bg-white/20 flex items-center gap-1"
                                            title="Clear filters"
                                        >
                                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                            </svg>
                                            Clear
                                        </button>
                                    )}

                                    {/* Search */}
                                    <input
                                        type="text"
                                        placeholder="Search instance, customer, SR..."
                                        value={openCspSearchTerm}
                                        onChange={(e) => setOpenCspSearchTerm(e.target.value)}
                                        className="border border-gray-300 rounded-lg px-2 py-1 text-xs w-56 bg-white focus:outline-none"
                                    />

                                    <button
                                        onClick={() => setShowOpenCspModal(false)}
                                        className="w-7 h-7 sm:w-8 sm:h-8 bg-white rounded-lg flex items-center justify-center transition-all duration-200 group flex-shrink-0"
                                    >
                                        <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-black group-hover:rotate-90 transition-transform duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                        </svg>
                                    </button>
                                </div>
                            </div>

                            <div className="flex-1 overflow-auto p-3 max-h-[70vh]">
                                {loadingCsp ? (
                                    <div className="flex items-center justify-center py-10">
                                        <div className="w-8 h-8 border-2 border-t-2 border-t-[#2f3192] border-gray-200 rounded-full animate-spin"></div>
                                        <span className="ml-2 text-xs text-gray-600">Loading CSP data...</span>
                                    </div>
                                ) : filteredOpenCspRows.length === 0 ? (
                                    <div className="text-center py-10 text-xs text-gray-500">
                                        {openCspRows.length === 0
                                            ? 'No open SR CSP records found for your branch.'
                                            : 'No open CSP rows match the current filters.'}
                                    </div>
                                ) : (
                                    <div className="overflow-x-auto overflow-y-auto max-h-[60vh]">
                                        <table className="min-w-[1250px] w-full border-collapse text-[11px]">
                                            <thead className="bg-gray-100 sticky top-0 z-10">
                                                <tr>
                                                    <th className="px-2 py-0 border border-gray-300 text-center font-semibold text-black whitespace-nowrap bg-gray-100">S.No</th>
                                                    <th className="px-2 py-0 border border-gray-300 text-center font-semibold text-black whitespace-nowrap bg-gray-100">Instance ID</th>
                                                    <th className="px-2 py-0 border border-gray-300 text-center font-semibold text-black whitespace-nowrap bg-gray-100">Customer</th>
                                                    <th className="px-2 py-0 border border-gray-300 text-center font-semibold text-black whitespace-nowrap bg-gray-100">Branch</th>
                                                    <th className="px-2 py-0 border border-gray-300 text-center font-semibold text-black whitespace-nowrap bg-gray-100">GOEM/OEM</th>
                                                    <th className="px-2 py-0 border border-gray-300 text-center font-semibold text-black whitespace-nowrap bg-gray-100">SR Number</th>
                                                    <th className="px-2 py-0 border border-gray-300 text-center font-semibold text-black whitespace-nowrap bg-gray-100">SR Open Date</th>
                                                    <th className="px-2 py-0 border border-gray-300 text-center font-semibold text-black whitespace-nowrap bg-gray-100">SR Subtype</th>
                                                    <th className="px-2 py-0 border border-gray-300 text-center font-semibold text-black whitespace-nowrap bg-gray-100">SR Status</th>
                                                    <th className="px-2 py-0 border border-gray-300 text-center font-semibold text-black whitespace-nowrap bg-gray-100">Segment</th>
                                                    <th className="px-2 py-0 border border-gray-300 text-center font-semibold text-black whitespace-nowrap bg-gray-100">Due Date</th>
                                                    <th
                                                        className="px-2 py-0 border border-gray-300 text-center font-semibold text-black bg-gray-100 cursor-pointer select-none hover:bg-gray-200"
                                                        onClick={() => setOpenCspDaysSort(s => s === 'desc' ? 'asc' : 'desc')}
                                                    >
                                                        <div className="flex items-center justify-center gap-1">
                                                            <div className="flex flex-col items-start">
                                                                <span>Due/Overdue</span>
                                                                <pre>    Days</pre>
                                                            </div>
                                                            <div className="flex flex-col items-center leading-none">
                                                                <span className={openCspDaysSort === 'asc' ? 'text-black' : 'text-gray-300'}>▲</span>
                                                                <span className={openCspDaysSort === 'desc' ? 'text-black' : 'text-gray-300'}>▼</span>
                                                            </div>
                                                        </div>
                                                    </th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-gray-100">
                                                {sortedOpenCspRows.map((row, idx) => {
                                                    const dp = getCspDaysPass(row.due_date);
                                                    return (
                                                        <tr key={idx} className={`transition-colors ${dp > 0 ? 'bg-orange-300 hover:bg-orange-400' : 'hover:bg-gray-50'}`}>                                                          <td className="px-2 py-1 border border-gray-200 text-center">{idx + 1}</td>
                                                            <td className="px-2 py-1 border border-gray-200 text-center">
                                                                {row.instance_id ? (
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => handleOpenCustomerFromCsp(row)}
                                                                        className="font-medium text-[#2f3192] underline hover:text-[#1f2061] hover:font-bold cursor-pointer"
                                                                        title="Click to open customer details"
                                                                    >
                                                                        {row.instance_id}
                                                                    </button>
                                                                ) : '-'}
                                                            </td>
                                                            <td className="px-2 py-1 border border-gray-200 text-left">{row.customer_name || '-'}</td>
                                                            <td className="px-2 py-1 border border-gray-200 text-center">{row.branch_id || '-'}</td>
                                                            <td className="px-2 py-1 border border-gray-200 text-center">{row.goem_oem || '-'}</td>
                                                            <td className="px-2 py-1 border border-gray-200 text-center">{row.sr_number || '-'}</td>
                                                            <td className="px-2 py-1 border border-gray-200 text-center">{row.sr_open_date || '-'}</td>
                                                            <td className="px-2 py-1 border border-gray-200 text-center">{row.sr_subtype || '-'}</td>
                                                            <td className="px-2 py-1 border border-gray-200 text-center">{row.sr_status || '-'}</td>
                                                            <td className="px-2 py-1 border border-gray-200 text-center">{row.segment || '-'}</td>
                                                            <td className="px-2 py-1 border border-gray-200 text-center font-bold" style={{ backgroundColor: dp > 0 ? 'transparent' : (row.due_date ? '#ffdb62' : 'transparent') }}>
                                                                {/* {row.due_date || '-'} */}
                                                                -
                                                            </td>
                                                            <td
                                                                className="px-2 py-1 border border-gray-200 text-center font-semibold whitespace-nowrap"
                                                                style={{ color: dp === null ? '#6b7280' : dp > 0 ? '#dc2626' : '#16a34a' }}
                                                            >
                                                                {/* {dp === null ? '-' : dp > 0 ? `${dp} overdue` : dp === 0 ? 'Due today' : `${Math.abs(dp)} left`} */}
                                                                -
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </div>

                            <div className="px-4 py-2 border-t border-gray-200 bg-gray-50 flex justify-end">
                                <button
                                    onClick={() => setShowOpenCspModal(false)}
                                    className="px-3 py-1.5 border border-gray-300 rounded-lg text-xs font-medium hover:bg-white text-black"
                                >
                                    Close
                                </button>
                            </div>
                        </div>
                    </div>,
                    document.body
                )}

                {showAllFollowupsModal && ReactDOM.createPortal(
                    <div className="fixed inset-0 backdrop-blur-sm bg-black/40 flex items-center justify-center z-[10000] p-3">
                        <div className="bg-white rounded-xl shadow-xl max-w-7xl w-full max-h-[92vh] overflow-hidden flex flex-col">
                            {/* Header — themed gradient like BranchCustomersModal */}
                            <div
                                className="px-4 py-3 border-b border-gray-200 flex justify-between items-center"
                                style={{ background: `linear-gradient(135deg, ${themeColor} 0%, #2c4a6e 100%)` }}
                            >
                                <div>
                                    <h3 className="text-base font-semibold text-white">
                                        {quotationFilterActive
                                            ? 'Quotation Follow-ups'
                                            : quotationSentFilterActive
                                                ? 'Quotation Sent Customers'
                                                : cspQuotationFilterActive
                                                    ? 'CSP Quotation Follow-ups'
                                                    : cspQuotationSentFilterActive
                                                        ? 'CSP Quotation Sent Customers'
                                                        : 'All Follow-ups'} by {userData?.name || 'User'}
                                    </h3>
                                    <p className="text-[11px] text-white/80 mt-0.5">
                                        {getDateRangeText()} • Total: {quotationFilterActive
                                            ? quotationCount
                                            : quotationSentFilterActive
                                                ? quotationSentCount
                                                : cspQuotationFilterActive
                                                    ? cspQuotationCount
                                                    : cspQuotationSentFilterActive
                                                        ? cspQuotationSentCount
                                                        : allFollowupsData.length} follow-up(s)
                                    </p>
                                </div>
                                <div className="flex items-center gap-2">
                                    {/* Created At - From */}
                                    <div className="flex items-center gap-1">
                                        <label className="text-[11px] text-white whitespace-nowrap">Created From:</label>
                                        <input
                                            type="date"
                                            value={createdFromDate}
                                            onChange={(e) => {
                                                const newFrom = e.target.value;
                                                setCreatedFromDate(newFrom);
                                                if (createdToDate && newFrom && new Date(createdToDate) < new Date(newFrom)) {
                                                    setCreatedToDate('');
                                                }
                                            }}
                                            max={createdToDate || undefined}
                                            className="border border-gray-300 rounded-md px-2 py-1 text-[11px] bg-white text-black"
                                        />
                                    </div>

                                    {/* Created At - To */}
                                    <div className="flex items-center gap-1">
                                        <label className="text-[11px] text-white whitespace-nowrap">To:</label>
                                        <input
                                            type="date"
                                            value={createdToDate}
                                            onChange={(e) => {
                                                const newTo = e.target.value;
                                                if (createdFromDate && newTo && new Date(newTo) < new Date(createdFromDate)) {
                                                    return;
                                                }
                                                setCreatedToDate(newTo);
                                            }}
                                            min={createdFromDate || undefined}
                                            className="border border-gray-300 rounded-md px-2 py-1 text-[11px] bg-white text-black"
                                        />
                                    </div>

                                    {/* Clear date filter */}
                                    {(createdFromDate || createdToDate || statusFilter !== 'all') && (
                                        <button
                                            onClick={() => {
                                                setCreatedFromDate('');
                                                setCreatedToDate('');
                                                setStatusFilter('all');
                                            }}
                                            className="px-2 py-1 text-[11px] text-white border border-white/40 rounded-md bg-white/10 hover:bg-white/20 flex items-center gap-1"
                                            title="Clear filters"
                                        >
                                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                            </svg>
                                            Clear
                                        </button>
                                    )}

                                    {/* Status filter */}
                                    <div className="flex items-center gap-1">
                                        <label className="text-[11px] text-white whitespace-nowrap">Status:</label>
                                        <div className="relative">
                                            <select
                                                value={statusFilter}
                                                onChange={(e) => setStatusFilter(e.target.value)}
                                                className="border border-gray-300 rounded-md pl-2 pr-6 py-1 text-[11px] bg-white text-black appearance-none cursor-pointer focus:outline-none"
                                            >
                                                <option value="all">All</option>
                                                <option value="completed">Completed</option>
                                                <option value="wip">WIP</option>
                                                <option value="rejected">Rejected</option>
                                                <option value="rescheduled">FR (Rescheduled)</option>
                                            </select>
                                            <svg
                                                className="absolute right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 text-black pointer-events-none"
                                                fill="none" stroke="currentColor" viewBox="0 0 24 24"
                                            >
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                            </svg>
                                        </div>
                                    </div>

                                    {/* Search */}
                                    <input
                                        type="text"
                                        placeholder="Search customer, campaign, remark..."
                                        value={followupSearchTerm}
                                        onChange={(e) => setFollowupSearchTerm(e.target.value)}
                                        className="border border-gray-300 rounded-lg px-2 py-1 text-xs w-64 bg-white focus:outline-none"
                                    />

                                    {/* Close button — white square like BranchCustomersModal */}
                                    <button
                                        onClick={() => setShowAllFollowupsModal(false)}
                                        className="w-7 h-7 sm:w-8 sm:h-8 bg-white rounded-lg flex items-center justify-center transition-all duration-200 group flex-shrink-0"
                                    >
                                        <svg
                                            className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-black group-hover:rotate-90 transition-transform duration-200"
                                            fill="none"
                                            stroke="currentColor"
                                            viewBox="0 0 24 24"
                                        >
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                        </svg>
                                    </button>
                                </div>
                            </div>

                            {/* Body */}
                            <div className="flex-1 overflow-auto p-3 max-h-[70vh]">
                                {loadingAllFollowups ? (
                                    <div className="flex items-center justify-center py-10">
                                        <div className="w-8 h-8 border-2 border-t-2 border-t-[#2f3192] border-gray-200 rounded-full animate-spin"></div>
                                        <span className="ml-2 text-xs text-gray-600">Loading follow-ups...</span>
                                    </div>
                                ) : allFollowupsData.length === 0 ? (
                                    <div className="text-center py-10 text-xs text-gray-500">
                                        No follow-ups found for the selected time period.
                                    </div>
                                ) : (
                                    <div className="overflow-x-auto overflow-y-auto max-h-[60vh]">
                                        <table className="min-w-[2000px] w-full border-collapse text-[11px]">
                                            <thead className="bg-gray-100 sticky top-0 z-10">
                                                <tr>
                                                    <th className="px-2 py-1.5 border border-gray-300 text-center font-semibold text-black whitespace-nowrap bg-gray-100">S.No</th>
                                                    <th className="px-2 py-1.5 border border-gray-300 text-center font-semibold text-black whitespace-nowrap bg-gray-100">Follow-up Date</th>
                                                    <th className="px-2 py-1.5 border border-gray-300 text-center font-semibold text-black whitespace-nowrap bg-gray-100">Instance ID</th>
                                                    <th className="px-2 py-1.5 border border-gray-300 text-center font-semibold text-black whitespace-nowrap bg-gray-100">Customer Name</th>
                                                    <th className="px-2 py-1.5 border border-gray-300 text-center font-semibold text-black whitespace-nowrap bg-gray-100">Phone</th>
                                                    <th className="px-2 py-1.5 border border-gray-300 text-center font-semibold text-black whitespace-nowrap bg-gray-100">Email</th>
                                                    <th className="px-2 py-1.5 border border-gray-300 text-center font-semibold text-black whitespace-nowrap bg-gray-100">Branch</th>
                                                    <th className="px-2 py-1.5 border border-gray-300 text-center font-semibold text-black whitespace-nowrap bg-gray-100">Campaign</th>
                                                    <th className="px-2 py-1.5 border border-gray-300 text-center font-semibold text-black whitespace-nowrap bg-gray-100">Service</th>
                                                    <th className="px-2 py-1.5 border border-gray-300 text-center font-semibold text-black whitespace-nowrap bg-gray-100">Follow-up By</th>
                                                    <th className="px-2 py-1.5 border border-gray-300 text-center font-semibold text-black whitespace-nowrap bg-gray-100">Flag</th>
                                                    <th className="px-2 py-1.5 border border-gray-300 text-center font-semibold text-black whitespace-nowrap bg-gray-100">Status</th>
                                                    <th className="px-2 py-1.5 border border-gray-300 text-center font-semibold text-black whitespace-nowrap bg-gray-100">Next Follow-up</th>
                                                    <th className="px-2 py-1.5 border border-gray-300 text-center font-semibold text-black whitespace-nowrap bg-gray-100">Activity</th>
                                                    <th className="px-2 py-1.5 border border-gray-300 text-center font-semibold text-black whitespace-nowrap bg-gray-100">Reject Reason</th>
                                                    <th className="px-2 py-1.5 border border-gray-300 text-center font-semibold text-black whitespace-nowrap bg-gray-100">Remark</th>
                                                    <th className="px-2 py-1.5 border border-gray-300 text-center font-semibold text-black whitespace-nowrap bg-gray-100">Quote Sent</th>
                                                    <th className="px-2 py-1.5 border border-gray-300 text-center font-semibold text-black whitespace-nowrap bg-gray-100">Quote No.</th>
                                                    <th className="px-2 py-1.5 border border-gray-300 text-center font-semibold text-black whitespace-nowrap bg-gray-100">Quote Value</th>
                                                    <th className="px-2 py-1.5 border border-gray-300 text-center font-semibold text-black whitespace-nowrap bg-gray-100">Created At</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-gray-100">
                                                {visibleFollowups
                                                    .map((fu, idx) => (
                                                        <tr
                                                            key={fu.id}
                                                            className="hover:bg-blue-50 cursor-pointer transition-colors"
                                                            onClick={() => handleOpenCustomerFromFollowup(fu)}
                                                            title="Click to open customer details"
                                                        >
                                                            <td className="px-2 py-1 border border-gray-200 text-center">{idx + 1}</td>
                                                            <td className="px-2 py-1 border border-gray-200 text-center whitespace-nowrap">
                                                                {fu.followup_date ? new Date(fu.followup_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '-'}
                                                            </td>
                                                            <td className="px-2 py-1 border border-gray-200 text-center">{fu.customer_instance_id || '-'}</td>
                                                            <td className="px-2 py-1 border border-gray-200 text-left">{fu.customer_name || '-'}</td>
                                                            <td className="px-2 py-1 border border-gray-200 text-center">{fu.phone_number || '-'}</td>
                                                            <td className="px-2 py-1 border border-gray-200 text-left">{fu.email || '-'}</td>
                                                            <td className="px-2 py-1 border border-gray-200 text-center">{fu.branch_id || '-'}</td>
                                                            <td className="px-2 py-1 border border-gray-200 text-left">{fu.campaign_name || '-'}</td>
                                                            <td className="px-2 py-1 border border-gray-200 text-left">{fu.campaign_service || '-'}</td>
                                                            <td className="px-2 py-1 border border-gray-200 text-center capitalize">{fu.followup_by || '-'}</td>
                                                            <td className="px-2 py-1 border border-gray-200 text-center">
                                                                {fu.followup_flag ? (
                                                                    <span className="px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 text-[10px] font-bold">{fu.followup_flag}</span>
                                                                ) : '-'}
                                                            </td>
                                                            <td className="px-2 py-1 border border-gray-200 text-center capitalize">
                                                                <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-medium ${fu.status === 'completed' ? 'bg-green-100 text-green-700' :
                                                                    fu.status === 'wip' ? 'bg-yellow-100 text-yellow-700' :
                                                                        fu.status === 'rejected' ? 'bg-red-100 text-red-700' :
                                                                            fu.status === 'rescheduled' ? 'bg-purple-100 text-purple-700' :
                                                                                'bg-gray-100 text-gray-700'
                                                                    }`}>
                                                                    {fu.status === 'rescheduled' ? 'FR' : (fu.status || '-')}
                                                                </span>
                                                            </td>
                                                            <td className="px-2 py-1 border border-gray-200 text-center whitespace-nowrap">
                                                                {fu.next_followup_date ? new Date(fu.next_followup_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '-'}
                                                            </td>
                                                            <td className="px-2 py-1 border border-gray-200 text-left max-w-[200px] truncate" title={fu.activity_content || ''}>{fu.activity_content || '-'}</td>
                                                            <td className="px-2 py-1 border border-gray-200 text-left max-w-[200px] truncate" title={fu.rr_content || ''}>{fu.rr_content || '-'}</td>
                                                            <td className="px-2 py-1 border border-gray-200 text-left max-w-[250px] truncate" title={fu.followup_remark || ''}>{fu.followup_remark || '-'}</td>
                                                            <td className="px-2 py-1 border border-gray-200 text-center">
                                                                {fu.quotation_sent ? <span className="text-green-600 font-semibold">Yes</span> : <span className="text-gray-500">No</span>}
                                                            </td>
                                                            <td className="px-2 py-1 border border-gray-200 text-center">{fu.quotation_no || '-'}</td>
                                                            <td className="px-2 py-1 border border-gray-200 text-right">
                                                                {fu.quotation_value ? `₹${parseFloat(fu.quotation_value).toLocaleString('en-IN')}` : '-'}
                                                            </td>
                                                            <td className="px-2 py-1 border border-gray-200 text-center whitespace-nowrap">
                                                                {fu.created_at ? new Date(fu.created_at).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '-'}
                                                            </td>
                                                        </tr>
                                                    ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </div>

                            <div className="px-4 py-2 border-t border-gray-200 bg-gray-50 flex justify-end">
                                <button
                                    onClick={() => setShowAllFollowupsModal(false)}
                                    className="px-3 py-1.5 border border-gray-300 rounded-lg text-xs font-medium hover:bg-white text-black"
                                >
                                    Close
                                </button>
                            </div>
                        </div>
                    </div>,
                    document.body
                )}

                {showCancelledCspModal && ReactDOM.createPortal(
                    <div className="fixed inset-0 backdrop-blur-sm bg-black/40 flex items-center justify-center z-[10000] p-3">
                        <div className="bg-white rounded-xl shadow-xl max-w-md w-full overflow-hidden flex flex-col">
                            <div
                                className="px-4 py-3 border-b border-gray-200 flex justify-between items-center"
                                style={{ background: `linear-gradient(135deg, ${themeColor} 0%, #2c4a6e 100%)` }}
                            >
                                <h3 className="text-base font-semibold text-white">
                                    Letter For Warranty Lapse
                                </h3>
                                <button
                                    onClick={() => setShowCancelledCspModal(false)}
                                    className="w-7 h-7 sm:w-8 sm:h-8 bg-white rounded-lg flex items-center justify-center transition-all duration-200 group flex-shrink-0"
                                >
                                    <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-black group-hover:rotate-90 transition-transform duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                </button>
                            </div>

                            <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
                                <svg className="w-12 h-12 mb-3" fill="none" stroke={themeColor} viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                                <p className="text-sm font-semibold text-black">Coming soon...</p>
                                <p className="text-xs text-gray-500 mt-1">This feature is under development.</p>
                            </div>

                            <div className="px-4 py-2 border-t border-gray-200 bg-gray-50 flex justify-end">
                                <button
                                    onClick={() => setShowCancelledCspModal(false)}
                                    className="px-3 py-1.5 border border-gray-300 rounded-lg text-xs font-medium hover:bg-white text-black"
                                >
                                    Close
                                </button>
                            </div>
                        </div>
                    </div>,
                    document.body
                )}

                {showAddSrModal && ReactDOM.createPortal(
                    <div className="fixed inset-0 backdrop-blur-sm bg-black/40 flex items-center justify-center z-[10000] p-3">
                        <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[88vh] overflow-hidden flex flex-col">
                            <div className="px-3 py-2 border-b border-gray-200 flex justify-between items-center"
                                style={{ background: `linear-gradient(135deg, ${themeColor} 0%, #2c4a6e 100%)` }}>
                                <div>
                                    <h3 className="text-sm font-semibold text-white">Add SR to CSP Drive</h3>
                                    <p className="text-[10px] text-white/80">
                                        You have added {userCspSrCount} SR so far
                                    </p>
                                </div>
                                <button onClick={() => setShowAddSrModal(false)}
                                    className="w-7 h-7 bg-white rounded-md flex items-center justify-center group flex-shrink-0">
                                    <svg className="w-3.5 h-3.5 text-black group-hover:rotate-90 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                </button>
                            </div>

                            <div className="flex-1 overflow-auto p-3 space-y-2">
                                <div>

                                    {openCspCampaigns.length === 0 ? (
                                        <p className="text-[11px] text-red-600">No active CSP campaigns available.</p>
                                    ) : (
                                        <select
                                            value={selectedCspCampaignId}
                                            onChange={(e) => setSelectedCspCampaignId(e.target.value)}
                                            className="w-full border border-gray-300 rounded-md px-2 py-1 text-sm bg-white text-black"
                                        >
                                            <option value="">Select a campaign…</option>
                                            {openCspCampaigns.map(c => (
                                                <option key={c.id} value={c.id}>
                                                    {c.name} - {c.asset_count} assets
                                                </option>
                                            ))}
                                        </select>
                                    )}
                                </div>

                                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                                    <div>
                                        <label className="block text-[11px] font-semibold text-black mb-0.5">Asset No. (Instance ID) *</label>
                                        <input type="text" value={srForm.asset_number}
                                            onChange={(e) => setSrForm({ ...srForm, asset_number: e.target.value })}
                                            className="w-full border border-gray-300 rounded-md px-2 py-1 text-sm bg-white text-black" />
                                    </div>
                                    <div>
                                        <label className="block text-[11px] font-semibold text-black mb-0.5">Branch Code</label>
                                        <input type="text" value={srForm.branch_id} readOnly disabled
                                            placeholder="Auto-filled from Asset No."
                                            className="w-full border border-gray-300 rounded-md px-2 py-1 text-sm bg-gray-100 text-black cursor-not-allowed" />
                                    </div>
                                    <div>
                                        <label className="block text-[11px] font-semibold text-black mb-0.5">GOEM / OEM</label>
                                        <input type="text" value={srForm.goem_oem} readOnly disabled
                                            placeholder="Auto-filled from Asset No."
                                            className="w-full border border-gray-300 rounded-md px-2 py-1 text-sm bg-gray-100 text-black cursor-not-allowed" />
                                    </div>
                                    <div>
                                        <label className="block text-[11px] font-semibold text-black mb-0.5">SR Number *</label>
                                        <input type="text" value={srForm.sr_number}
                                            onChange={(e) => setSrForm({ ...srForm, sr_number: e.target.value })}
                                            className="w-full border border-gray-300 rounded-md px-2 py-1 text-sm bg-white text-black" />
                                    </div>
                                    <div>
                                        <label className="block text-[11px] font-semibold text-black mb-0.5">SR Open Date</label>
                                        <input type="date" value={srForm.sr_open_date}
                                            onChange={(e) => setSrForm({ ...srForm, sr_open_date: e.target.value })}
                                            className="w-full border border-gray-300 rounded-md px-2 py-1 text-sm bg-white text-black" />
                                    </div>

                                    {/* SR Type — locked to CSP, non-editable */}
                                    <div>
                                        <label className="block text-[11px] font-semibold text-black mb-0.5">SR Type</label>
                                        <input type="text" value="CSP" readOnly disabled
                                            className="w-full border border-gray-300 rounded-md px-2 py-1 text-sm bg-gray-100 text-black cursor-not-allowed" />
                                    </div>

                                    {/* SR Subtype — dropdown */}
                                    <div>
                                        <label className="block text-[11px] font-semibold text-black mb-0.5">SR Subtype</label>
                                        <select value={srForm.sr_subtype}
                                            onChange={(e) => setSrForm({ ...srForm, sr_subtype: e.target.value })}
                                            className="w-full border border-gray-300 rounded-md px-2 py-1 text-sm bg-white text-black">
                                            <option value="">Select…</option>
                                            <option value="A Check">A Check</option>
                                            <option value="B Check">B Check</option>
                                            <option value="C Check">C Check</option>
                                            <option value="D Check">D Check</option>
                                        </select>
                                    </div>

                                    {/* SR Status — default Open */}
                                    <div>
                                        <label className="block text-[11px] font-semibold text-black mb-0.5">
                                            SR Status
                                        </label>

                                        <input
                                            type="text"
                                            value="Open"
                                            readOnly
                                            className="w-full border border-gray-300 rounded-md px-2 py-1 text-sm bg-gray-100 text-black"
                                        />
                                    </div>

                                    {/* Segment — auto-filled from asset, non-editable */}
                                    <div>
                                        <label className="block text-[11px] font-semibold text-black mb-0.5">Segment</label>
                                        <input type="text" value={srForm.segment} readOnly disabled
                                            placeholder="Auto-filled from Asset No."
                                            className="w-full border border-gray-300 rounded-md px-2 py-1 text-sm bg-gray-100 text-black cursor-not-allowed" />
                                    </div>
                                </div>
                            </div>

                            <div className="px-3 py-2 border-t border-gray-200 bg-gray-50 flex justify-end gap-2">
                                <button onClick={() => setShowAddSrModal(false)}
                                    className="px-3 py-1 border border-gray-300 rounded-md text-xs font-medium hover:bg-white text-black">
                                    Cancel
                                </button>
                                <button onClick={handleSubmitSr} disabled={addSrLoading || openCspCampaigns.length === 0}
                                    className="px-4 py-1 rounded-md text-xs font-medium text-white disabled:opacity-50"
                                    style={{ background: themeColor }}>
                                    {addSrLoading ? 'Adding…' : 'Add'}
                                </button>
                            </div>
                        </div>
                    </div>,
                    document.body
                )}

                {showNonCampaignModal && ReactDOM.createPortal(
                    <div className="fixed inset-0 backdrop-blur-sm bg-black/40 flex items-center justify-center z-[10000] p-3">
                        <div className="bg-white rounded-xl shadow-xl max-w-7xl w-full max-h-[92vh] overflow-hidden flex flex-col">
                            <div
                                className="px-4 py-3 border-b border-gray-200 flex flex-wrap justify-between items-center gap-2"
                                style={{ background: `linear-gradient(135deg, ${themeColor} 0%, #2c4a6e 100%)` }}
                            >
                                <div>
                                    <h3 className="text-base font-semibold text-white">
                                        Non-Campaign Customers by {userData?.name || 'User'}
                                    </h3>
                                    <p className="text-[11px] text-white/80 mt-0.5">
                                        Showing {filteredNonCampaignCustomers.length} of {nonCampaignData.total_customers} customer(s)
                                    </p>
                                </div>
                                <div className="flex flex-wrap items-center gap-2">
                                    {/* Service / Product filter */}
                                    <div className="flex items-center gap-1">
                                        <label className="text-[11px] text-white whitespace-nowrap">Service:</label>
                                        <div className="relative">
                                            <select
                                                value={nonCampaignServiceFilter}
                                                onChange={(e) => setNonCampaignServiceFilter(e.target.value)}
                                                className="border border-gray-300 rounded-md pl-2 pr-6 py-1 text-[11px] bg-white text-black appearance-none cursor-pointer focus:outline-none"
                                            >
                                                <option value="all">All</option>
                                                {nonCampaignServiceOptions.map(s => (
                                                    <option key={s} value={s}>{s}</option>
                                                ))}
                                            </select>
                                            <svg className="absolute right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 text-black pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                            </svg>
                                        </div>
                                    </div>

                                    {/* Status filter */}
                                    <div className="flex items-center gap-1">
                                        <label className="text-[11px] text-white whitespace-nowrap">Status:</label>
                                        <div className="relative">
                                            <select
                                                value={nonCampaignStatusFilter}
                                                onChange={(e) => setNonCampaignStatusFilter(e.target.value)}
                                                className="border border-gray-300 rounded-md pl-2 pr-6 py-1 text-[11px] bg-white text-black appearance-none cursor-pointer focus:outline-none"
                                            >
                                                <option value="all">All</option>
                                                <option value="completed">Completed</option>
                                                <option value="wip">WIP</option>
                                                <option value="rejected">Rejected</option>
                                                <option value="rescheduled">FR (Rescheduled)</option>
                                            </select>
                                            <svg className="absolute right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 text-black pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                            </svg>
                                        </div>
                                    </div>

                                    {/* Clear filters */}
                                    {(nonCampaignSearchTerm || nonCampaignStatusFilter !== 'all' || nonCampaignServiceFilter !== 'all') && (
                                        <button
                                            onClick={() => {
                                                setNonCampaignSearchTerm('');
                                                setNonCampaignStatusFilter('all');
                                                setNonCampaignServiceFilter('all');
                                            }}
                                            className="px-2 py-1 text-[11px] text-white border border-white/40 rounded-md bg-white/10 hover:bg-white/20 flex items-center gap-1"
                                            title="Clear filters"
                                        >
                                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                            </svg>
                                            Clear
                                        </button>
                                    )}

                                    {/* Search */}
                                    <input
                                        type="text"
                                        placeholder="Search customer, instance, service..."
                                        value={nonCampaignSearchTerm}
                                        onChange={(e) => setNonCampaignSearchTerm(e.target.value)}
                                        className="border border-gray-300 rounded-lg px-2 py-1 text-xs w-56 bg-white focus:outline-none"
                                    />

                                    {/* Export — permission-gated */}
                                    {canExport && (
                                        <button
                                            onClick={exportNonCampaignToExcel}
                                            className="px-3 py-1.5 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center justify-center gap-1.5 text-xs whitespace-nowrap"
                                        >
                                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                            </svg>
                                            Export
                                        </button>
                                    )}

                                    <button
                                        onClick={() => setShowNonCampaignModal(false)}
                                        className="w-7 h-7 sm:w-8 sm:h-8 bg-white rounded-lg flex items-center justify-center transition-all duration-200 group flex-shrink-0"
                                    >
                                        <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-black group-hover:rotate-90 transition-transform duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                        </svg>
                                    </button>
                                </div>
                            </div>

                            <div className="flex-1 overflow-auto p-3 max-h-[70vh]">
                                {loadingNonCampaign ? (
                                    <div className="flex items-center justify-center py-10">
                                        <div className="w-8 h-8 border-2 border-t-2 border-t-[#2f3192] border-gray-200 rounded-full animate-spin"></div>
                                        <span className="ml-2 text-xs text-gray-600">Loading customers...</span>
                                    </div>
                                ) : filteredNonCampaignCustomers.length === 0 ? (
                                    <div className="text-center py-10 text-xs text-gray-500">
                                        {nonCampaignData.customers.length === 0
                                            ? 'No non-campaign customers found.'
                                            : 'No customers match the current filters.'}
                                    </div>
                                ) : (
                                    <div className="overflow-x-auto overflow-y-auto max-h-[60vh]">
                                        <table className="min-w-[1600px] w-full border-collapse text-[11px]">
                                            <thead className="bg-gray-100 sticky top-0 z-10">
                                                <tr>
                                                    <th className="px-2 py-1.5 border border-gray-300 text-center font-semibold text-black whitespace-nowrap bg-gray-100">S.No</th>
                                                    <th className="px-2 py-1.5 border border-gray-300 text-center font-semibold text-black whitespace-nowrap bg-gray-100">Instance ID</th>
                                                    <th className="px-2 py-1.5 border border-gray-300 text-center font-semibold text-black whitespace-nowrap bg-gray-100">Customer Name</th>
                                                    <th className="px-2 py-1.5 border border-gray-300 text-center font-semibold text-black whitespace-nowrap bg-gray-100">Phone</th>
                                                    <th className="px-2 py-1.5 border border-gray-300 text-center font-semibold text-black whitespace-nowrap bg-gray-100">Email</th>
                                                    <th className="px-2 py-1.5 border border-gray-300 text-center font-semibold text-black whitespace-nowrap bg-gray-100">Branch</th>
                                                    <th className="px-2 py-1.5 border border-gray-300 text-center font-semibold text-black whitespace-nowrap bg-gray-100">Service / Product</th>
                                                    <th className="px-2 py-1.5 border border-gray-300 text-center font-semibold text-black whitespace-nowrap bg-gray-100">Follow-up By</th>
                                                    <th className="px-2 py-1.5 border border-gray-300 text-center font-semibold text-black whitespace-nowrap bg-gray-100">Flag</th>
                                                    <th className="px-2 py-1.5 border border-gray-300 text-center font-semibold text-black whitespace-nowrap bg-gray-100">Status</th>
                                                    <th className="px-2 py-1.5 border border-gray-300 text-center font-semibold text-black whitespace-nowrap bg-gray-100">Last Follow-up</th>
                                                    <th className="px-2 py-1.5 border border-gray-300 text-center font-semibold text-black whitespace-nowrap bg-gray-100">Next Follow-up</th>
                                                    <th className="px-2 py-1.5 border border-gray-300 text-center font-semibold text-black whitespace-nowrap bg-gray-100">Remark</th>
                                                    <th className="px-2 py-1.5 border border-gray-300 text-center font-semibold text-black whitespace-nowrap bg-gray-100">Quote Sent</th>
                                                    <th className="px-2 py-1.5 border border-gray-300 text-center font-semibold text-black whitespace-nowrap bg-gray-100">Quote No.</th>
                                                    <th className="px-2 py-1.5 border border-gray-300 text-center font-semibold text-black whitespace-nowrap bg-gray-100">Quote Value</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-gray-100">
                                                {filteredNonCampaignCustomers.map((c, idx) => (
                                                    <tr key={c.instance_id || idx} className="hover:bg-gray-50 transition-colors">
                                                        <td className="px-2 py-1 border border-gray-200 text-center">{idx + 1}</td>
                                                        <td className="px-2 py-1 border border-gray-200 text-center">{c.instance_id || '-'}</td>
                                                        <td className="px-2 py-1 border border-gray-200 text-left">{c.customer_name || '-'}</td>
                                                        <td className="px-2 py-1 border border-gray-200 text-center">{c.phone_number || '-'}</td>
                                                        <td className="px-2 py-1 border border-gray-200 text-left">{c.email || '-'}</td>
                                                        <td className="px-2 py-1 border border-gray-200 text-center">{c.branch_id || '-'}</td>
                                                        <td className="px-2 py-1 border border-gray-200 text-left">{c.service || '-'}</td>
                                                        <td className="px-2 py-1 border border-gray-200 text-center capitalize">{c.followup_by || '-'}</td>
                                                        <td className="px-2 py-1 border border-gray-200 text-center">
                                                            {c.latest_flag && c.latest_flag !== 'N/A' ? (
                                                                <span className="px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 text-[10px] font-bold">{c.latest_flag}</span>
                                                            ) : '-'}
                                                        </td>
                                                        <td className="px-2 py-1 border border-gray-200 text-center capitalize">
                                                            <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-medium ${c.last_status === 'completed' ? 'bg-green-100 text-green-700' :
                                                                c.last_status === 'wip' ? 'bg-yellow-100 text-yellow-700' :
                                                                    c.last_status === 'rejected' ? 'bg-red-100 text-red-700' :
                                                                        c.last_status === 'rescheduled' ? 'bg-purple-100 text-purple-700' :
                                                                            'bg-gray-100 text-gray-700'
                                                                }`}>
                                                                {c.last_status === 'rescheduled' ? 'FR' : (c.last_status || '-')}
                                                            </span>
                                                        </td>
                                                        <td className="px-2 py-1 border border-gray-200 text-center whitespace-nowrap">
                                                            {c.last_followup_date ? new Date(c.last_followup_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '-'}
                                                        </td>
                                                        <td className="px-2 py-1 border border-gray-200 text-center whitespace-nowrap">
                                                            {c.next_followup_date ? new Date(c.next_followup_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '-'}
                                                        </td>
                                                        <td className="px-2 py-1 border border-gray-200 text-left max-w-[250px] truncate" title={c.latest_remark || ''}>{c.latest_remark || '-'}</td>
                                                        <td className="px-2 py-1 border border-gray-200 text-center">
                                                            {c.quotation_sent ? <span className="text-green-600 font-semibold">Yes</span> : <span className="text-gray-500">No</span>}
                                                        </td>
                                                        <td className="px-2 py-1 border border-gray-200 text-center">{c.quotation_no || '-'}</td>
                                                        <td className="px-2 py-1 border border-gray-200 text-right">
                                                            {c.quotation_value ? `₹${parseFloat(c.quotation_value).toLocaleString('en-IN')}` : '-'}
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </div>

                            <div className="px-4 py-2 border-t border-gray-200 bg-gray-50 flex justify-end">
                                <button
                                    onClick={() => setShowNonCampaignModal(false)}
                                    className="px-3 py-1.5 border border-gray-300 rounded-lg text-xs font-medium hover:bg-white text-black"
                                >
                                    Close
                                </button>
                            </div>
                        </div>
                    </div>,
                    document.body
                )}
            </div>

        </div>
    );
};

export default React.memo(MyPerformance);