import React, { useState, useEffect, useCallback, useMemo } from 'react';
import ReactDOM from 'react-dom';
import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_BACKEND_URL;
const themeColor = '#2f3192';

const STATUS_CONFIG = {
    completed: { label: 'Completed', color: '#16a34a', bg: '#dcfce7', short: 'C' },
    wip: { label: 'WIP', color: '#b45309', bg: '#fef3c7', short: 'W' },
    rescheduled: { label: 'FR', color: '#7c3aed', bg: '#ede9fe', short: 'FR' },
    rejected: { label: 'Rejected', color: '#dc2626', bg: '#fee2e2', short: 'R' },
    pending: { label: 'Pending', color: '#6b7280', bg: '#f3f4f6', short: 'P' },
};

/* ─── helpers ─────────────────────────────────────────────── */

/**
 * Returns the most-recent working day before today (skips Sunday).
 * If yesterday is Sunday → returns Saturday.
 * Returns a "YYYY-MM-DD" string.
 */
const getDefaultWorkingDay = () => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - 1);
    if (d.getDay() === 0) d.setDate(d.getDate() - 1);
    return d.toISOString().split('T')[0];
};

const formatDisplay = (dateStr) => {
    if (!dateStr) return '';
    const [y, m, day] = dateStr.split('-');
    return `${day}/${m}/${y}`;
};

/* Latest follow-up per (customer_instance_id + campaign_name) — same logic as MyPerformance */
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

/* ─── sub-components ──────────────────────────────────────── */

const StatBadge = ({ status, count }) => {
    const cfg = STATUS_CONFIG[status] || { label: status, color: '#374151', bg: '#f3f4f6', short: status };
    return (
        <span
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold"
            style={{ color: cfg.color, backgroundColor: cfg.bg }}
        >
            <span className="font-bold">{cfg.short}:</span> {count}
        </span>
    );
};

/* ─── main component ──────────────────────────────────────── */

const EmployeeCampaignProgress = ({ isOpen, onClose, employee, userData }) => {

    const defaultDay = getDefaultWorkingDay();

    const [campaigns, setCampaigns] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [search, setSearch] = useState('');
    const [sortKey, setSortKey] = useState('total_unique_customers');
    const [sortDir, setSortDir] = useState('desc');

    // date-filter state — completely independent of Dashboard
    const [startDate, setStartDate] = useState(defaultDay);
    const [endDate, setEndDate] = useState(defaultDay);
    const [tempStart, setTempStart] = useState(defaultDay);
    const [tempEnd, setTempEnd] = useState(defaultDay);

    const [quickMode, setQuickMode] = useState('yesterday');

    /* ── Attended Assets modal state ── */
    const [showAssetsModal, setShowAssetsModal] = useState(false);
    const [allFollowupsData, setAllFollowupsData] = useState([]);
    const [loadingAssets, setLoadingAssets] = useState(false);
    const [assetsSearch, setAssetsSearch] = useState('');
    const [debouncedAssetsSearch, setDebouncedAssetsSearch] = useState('');
    const [assetsStatusFilter, setAssetsStatusFilter] = useState('all');
    const [assetsCampaignFilter, setAssetsCampaignFilter] = useState(''); // '' = all campaigns

    // Debounce search input by 250ms
    useEffect(() => {
        const t = setTimeout(() => setDebouncedAssetsSearch(assetsSearch), 250);
        return () => clearTimeout(t);
    }, [assetsSearch]);

    /* ── fetch campaigns ── */
    const fetchData = useCallback(async () => {
        if (!employee || !isOpen) return;
        setLoading(true);
        setError(null);
        try {
            const params = new URLSearchParams();

            if (quickMode === 'all') {
                params.append('time_period', 'all');
            } else {
                params.append('time_period', 'custom');
                params.append('start_date', startDate);
                params.append('end_date', endDate);
            }

            const payload = {
                user_id: userData.user_id || userData.id,
                name: userData.name,
                role: userData.role,
                branch: userData.branch,
            };

            const res = await axios.post(
                `${API_BASE_URL}/performance/employee-campaign-progress/${employee.user_id}?${params.toString()}`,
                payload
            );
            setCampaigns(res.data.campaigns || []);
        } catch (e) {
            setError(e.response?.data?.detail || e.message || 'Failed to load data');
        } finally {
            setLoading(false);
        }
    }, [employee, isOpen, userData, quickMode, startDate, endDate]);

    /* ── fetch attended assets (all-followups for the TARGET employee) ── */
    const fetchAttendedAssets = useCallback(async () => {
        if (!employee || !employee.user_id) return;
        setLoadingAssets(true);
        try {
            // Same endpoint MyPerformance uses for "Total Calls and Followups" —
            // but we pass the TARGET employee's user_id in the payload so the
            // backend returns that employee's followups (not the admin's).
            const payload = {
                user_id: employee.user_id,
                name: employee.user_name || employee.name,
                role: employee.role || userData.role,
                branch: employee.branch || userData.branch,
            };

            let url = `${API_BASE_URL}/performance/my-performance/all-followups`;
            const params = new URLSearchParams();

            if (quickMode === 'all') {
                params.append('time_period', 'all');
            } else {
                params.append('time_period', 'custom');
                params.append('start_date', startDate);
                params.append('end_date', endDate);
            }
            url += `?${params.toString()}`;

            const res = await axios.post(url, payload);
            setAllFollowupsData(res.data?.followups || []);
        } catch (err) {
            console.error('Error fetching attended assets:', err);
            setAllFollowupsData([]);
        } finally {
            setLoadingAssets(false);
        }
    }, [employee, userData, quickMode, startDate, endDate]);

    /* ── reset when modal opens ── */
    useEffect(() => {
        if (isOpen) {
            const day = getDefaultWorkingDay();
            setStartDate(day);
            setEndDate(day);
            setTempStart(day);
            setTempEnd(day);
            setQuickMode('yesterday');
            setSearch('');
            // close any open asset drill-down when parent re-opens
            setShowAssetsModal(false);
            setAllFollowupsData([]);
        }
    }, [isOpen]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    /* ── Latest unique assets (one per instance_id + campaign_name) ── */
    const latestAssets = useMemo(
        () => getLatestFollowupsPerInstanceCampaign(allFollowupsData),
        [allFollowupsData]
    );

    /* ── Active campaigns only (sourced from the front campaign table) ── */
    const uniqueCampaignsInAssets = useMemo(() => {
        const set = new Set();
        campaigns.forEach(c => c.campaign_name && set.add(c.campaign_name));
        return Array.from(set).sort();
    }, [campaigns]);

    /* ── Filtered assets for display (ACTIVE campaigns only, from front table) ── */
    const filteredAssets = useMemo(() => {
        // Lookup set of active campaign names from the front table
        const activeCampaignSet = new Set(uniqueCampaignsInAssets);

        return latestAssets.filter(fu => {
            // 1. Drop anything not in an active campaign
            if (!activeCampaignSet.has(fu.campaign_name)) return false;

            // 2. Specific-campaign drill-down (from clicking a row's Attended Assets cell)
            if (assetsCampaignFilter && fu.campaign_name !== assetsCampaignFilter) return false;

            // 3. Status filter
            if (assetsStatusFilter !== 'all') {
                if ((fu.status || '').toLowerCase() !== assetsStatusFilter) return false;
            }

            // 4. Search filter (debounced)
            if (debouncedAssetsSearch.trim()) {
                const t = debouncedAssetsSearch.toLowerCase();
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

            return true;
        });
    }, [latestAssets, assetsCampaignFilter, assetsStatusFilter, debouncedAssetsSearch, uniqueCampaignsInAssets]);

    if (!isOpen) return null;

    /* ── quick-mode helpers ── */
    const applyQuick = (mode) => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const fmt = (d) => d.toISOString().split('T')[0];

        let s, e;

        if (mode === 'yesterday') {
            const day = getDefaultWorkingDay();
            s = day; e = day;
        } else if (mode === 'today') {
            s = fmt(today); e = fmt(today);
        } else if (mode === 'week') {
            const w = new Date(today);
            w.setDate(today.getDate() - 6);
            s = fmt(w); e = fmt(today);
        } else if (mode === 'month') {
            const m = new Date(today);
            m.setDate(today.getDate() - 29);
            s = fmt(m); e = fmt(today);
        } else if (mode === 'all') {
            s = ''; e = '';
        }

        setStartDate(s);
        setEndDate(e);
        setTempStart(s);
        setTempEnd(e);
        setQuickMode(mode);
    };

    const applyCustom = () => {
        if (!tempStart || !tempEnd) return;
        if (tempStart > tempEnd) {
            alert('Start date cannot be after end date');
            return;
        }
        setStartDate(tempStart);
        setEndDate(tempEnd);
        setQuickMode('custom');
    };

    /* ── highlight helper ── */
    const highlightText = (text, search) => {
        if (!search || !text) return text;
        const textStr = String(text);
        const searchLower = search.toLowerCase().trim();
        const textLower = textStr.toLowerCase();
        if (!textLower.includes(searchLower)) return text;
        const escapedSearch = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(`(${escapedSearch})`, 'gi');
        const parts = textStr.split(regex);
        return parts.map((part, i) =>
            part.toLowerCase() === searchLower
                ? <span key={i} className="px-0.5 rounded" style={{ backgroundColor: '#ffdb62' }}>{part}</span>
                : part
        );
    };

    /* ── sorting ── */
    const handleSort = (key) => {
        if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
        else { setSortKey(key); setSortDir('desc'); }
    };

    const SortIcon = ({ col }) => (
        <span className="ml-1 text-xs opacity-70">
            {sortKey === col ? (sortDir === 'asc' ? '↑' : '↓') : '↕'}
        </span>
    );

    const sorted = [...campaigns]
        .filter(c =>
            c.campaign_name.toLowerCase().includes(search.toLowerCase()) ||
            c.service.toLowerCase().includes(search.toLowerCase())
        )
        .sort((a, b) => {
            const av = a[sortKey] ?? 0;
            const bv = b[sortKey] ?? 0;
            if (typeof av === 'string') return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
            return sortDir === 'asc' ? av - bv : bv - av;
        });

    /* ── summary totals ── */
    const totals = campaigns.reduce((acc, c) => ({
        unique: acc.unique + c.total_unique_customers,
        followups: acc.followups + c.total_followups,
        completed: acc.completed + c.completed,
        wip: acc.wip + c.wip,
        rescheduled: acc.rescheduled + c.rescheduled,
        rejected: acc.rejected + c.rejected,
    }), { unique: 0, followups: 0, completed: 0, wip: 0, rescheduled: 0, rejected: 0 });

    /* ── period label ── */
    const periodLabel = () => {
        if (quickMode === 'all') return 'All Time';
        if (quickMode === 'yesterday') return `Yesterday (${formatDisplay(startDate)})`;
        if (quickMode === 'today') return `Today (${formatDisplay(startDate)})`;
        if (quickMode === 'week') return 'Last 7 Days';
        if (quickMode === 'month') return 'Last 30 Days';
        if (startDate && endDate) return `${formatDisplay(startDate)} → ${formatDisplay(endDate)}`;
        return '';
    };

    const quickBtns = [
        { key: 'yesterday', label: 'Yesterday' },
        { key: 'today', label: 'Today' },
        { key: 'week', label: '7 Days' },
        { key: 'month', label: '30 Days' },
        { key: 'all', label: 'All Time' },
    ];

    /* ── Assets handlers ── */
    const handleOpenAssets = (campaignName = '') => {
        setAssetsCampaignFilter(campaignName);
        setAssetsSearch('');
        setAssetsStatusFilter('all');
        setShowAssetsModal(true);
        fetchAttendedAssets();
    };

    /* ════════════════════════════════════ RENDER ═══════════════════════════════════ */
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4">
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

            {/* Modal */}
            <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-6xl max-h-[92vh] flex flex-col overflow-hidden">

                {/* ── Header ── */}
                <div
                    className="flex items-center justify-between px-5 py-4 border-b border-blue-900 flex-shrink-0"
                    style={{ background: themeColor }}
                >
                    <div className="min-w-0">
                        <h2 className="text-base font-bold text-white truncate">
                            Campaign Progress — {employee?.user_name}
                        </h2>
                        <p className="text-xs text-blue-200 mt-0.5">
                            Active campaigns · {periodLabel()}
                        </p>
                    </div>
                    <button
                        onClick={onClose}
                        className="ml-4 text-black bg-white p-1.5 rounded transition-colors flex-shrink-0"
                    >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                {/* ── Date filter bar ── */}
                <div className="px-5 py-3 border-b border-gray-200 bg-gray-50 flex-shrink-0">
                    <div className="flex flex-wrap gap-2 items-center">

                        {quickBtns.map(btn => (
                            <button
                                key={btn.key}
                                onClick={() => applyQuick(btn.key)}
                                className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border"
                                style={
                                    quickMode === btn.key
                                        ? { backgroundColor: themeColor, color: '#fff', borderColor: themeColor }
                                        : { backgroundColor: '#fff', color: '#374151', borderColor: '#d1d5db' }
                                }
                            >
                                {btn.label}
                            </button>
                        ))}

                        <div className="w-px h-6 bg-gray-300 mx-1" />

                        <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs text-gray-500 font-medium">Custom:</span>
                            <input
                                type="date"
                                value={tempStart}
                                max={new Date().toISOString().split('T')[0]}
                                onChange={e => setTempStart(e.target.value)}
                                className="border border-gray-300 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-[#2f3192] bg-white"
                            />
                            <span className="text-xs text-gray-400">to</span>
                            <input
                                type="date"
                                value={tempEnd}
                                max={new Date().toISOString().split('T')[0]}
                                onChange={e => setTempEnd(e.target.value)}
                                className="border border-gray-300 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-[#2f3192] bg-white"
                            />
                            <button
                                onClick={applyCustom}
                                disabled={!tempStart || !tempEnd}
                                className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white disabled:opacity-40 transition-all border"
                                style={{ backgroundColor: themeColor, borderColor: themeColor }}
                            >
                                Apply
                            </button>
                        </div>

                        <div className="ml-auto flex items-center gap-2">
                            <input
                                type="text"
                                placeholder="Search campaign…"
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                                className="border border-gray-300 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-[#2f3192] w-64 bg-white"
                            />
                        </div>
                    </div>

                    {quickMode !== 'all' && startDate && endDate && (
                        <p className="text-[10px] text-gray-500 mt-2">
                            Showing data from&nbsp;
                            <span className="font-semibold text-gray-700">{formatDisplay(startDate)}</span>
                            &nbsp;to&nbsp;
                            <span className="font-semibold text-gray-700">{formatDisplay(endDate)}</span>
                        </p>
                    )}
                </div>

                {/* ── Summary cards ── */}
                {!loading && campaigns.length > 0 && (
                    <div className="px-5 py-3 border-b border-gray-100 grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-7 gap-2 flex-shrink-0">
                        {[
                            { label: 'Campaigns', value: campaigns.length, color: 'black' },
                            { label: 'Attended Assets', value: totals.unique, color: 'black', clickable: true },
                            { label: 'Followups', value: totals.followups, color: '#000000' },
                            { label: 'Completed', value: totals.completed, color: '#000000' },
                            { label: 'WIP', value: totals.wip, color: '#000000' },
                            { label: 'FR', value: totals.rescheduled, color: '#000000' },
                            { label: 'Rejected', value: totals.rejected, color: '#000000' },
                        ].map(card => (
                            <div
                                key={card.label}
                                onClick={card.clickable ? () => handleOpenAssets('') : undefined}
                                className={`group relative bg-gray-50 rounded-xl border border-gray-200 px-3 py-2 text-center ${card.clickable ? 'cursor-pointer hover:border-[#2f3192] hover:shadow-md hover:bg-white transition-all' : ''}`}
                                title={card.clickable ? 'Click to view assets' : ''}
                            >
                                <p
    className={`text-[10px] uppercase font-semibold ${card.clickable
        ? 'underline underline-offset-2 group-hover:font-extrabold transition-all'
        : ''
        }`}
    style={{ color: card.clickable ? themeColor : 'black' }}
>
    {card.label}
</p>
                                <p
                                    className={`text-xl mt-0.5 ${card.clickable
                                        ? 'font-semibold underline underline-offset-2 group-hover:font-extrabold transition-all'
                                        : 'font-bold'
                                        }`}
                                    style={{ color: card.clickable ? themeColor : card.color }}
                                >
                                    {card.value}
                                </p>

                                {card.clickable && (
                                    <div className="pointer-events-none absolute left-1/2 -translate-x-1/2 -top-7 opacity-0 group-hover:opacity-100 transition-opacity duration-150 z-20">
                                        <div className="bg-black text-white text-[10px] font-medium rounded-md px-2 py-1 whitespace-nowrap shadow-lg">
                                            Click to view assets
                                            <div className="absolute left-1/2 -translate-x-1/2 top-full w-0 h-0 border-l-4 border-r-4 border-t-4 border-l-transparent border-r-transparent border-t-black"></div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}

                {/* ── Table ── */}
                <div className="flex-1 overflow-auto">

                    {loading && (
                        <div className="flex items-center justify-center h-48">
                            <div
                                className="w-10 h-10 border-4 border-gray-200 rounded-full animate-spin"
                                style={{ borderTopColor: themeColor }}
                            />
                        </div>
                    )}

                    {!loading && error && (
                        <div className="flex items-center justify-center h-48 text-red-500 text-sm px-6 text-center">
                            {error}
                        </div>
                    )}

                    {!loading && !error && campaigns.length === 0 && (
                        <div className="flex flex-col items-center justify-center h-48 text-gray-400">
                            <svg className="w-12 h-12 mb-3 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                                    d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                            </svg>
                            <p className="text-sm font-medium">No campaign data found</p>
                            <p className="text-xs mt-1 text-gray-400">
                                {employee?.user_name} had no follow-ups in the selected period.
                            </p>
                        </div>
                    )}

                    {!loading && !error && sorted.length > 0 && (
                        <table className="min-w-full border-collapse text-xs">
                            <thead className="bg-gray-50 sticky top-0 z-10">
                                <tr>
                                    <th className="px-3 py-2 text-center font-bold text-black border border-gray-200 w-10">Sr.No.</th>
                                    <th
                                        className="px-3 py-2 text-left font-bold text-black border border-gray-200 cursor-pointer hover:bg-gray-100 select-none"
                                        onClick={() => handleSort('campaign_name')}
                                    >
                                        Campaign <SortIcon col="campaign_name" />
                                    </th>
                                    <th className="px-3 py-2 text-center font-bold text-black border border-gray-200">
                                        Service
                                    </th>
                                    <th
                                        className="px-3 py-2 text-center font-bold text-black border border-gray-200 cursor-pointer hover:bg-gray-100 select-none"
                                        onClick={() => handleSort('total_unique_customers')}
                                    >
                                        Attended Assets <SortIcon col="total_unique_customers" />
                                    </th>
                                    <th
                                        className="px-3 py-2 text-center font-bold text-black border border-gray-200 cursor-pointer hover:bg-gray-100 select-none"
                                        onClick={() => handleSort('total_followups')}
                                    >
                                        Total Calls and Followups <SortIcon col="total_followups" />
                                    </th>

                                    <th
                                        className="px-3 py-2 text-center font-bold text-black border border-gray-200 cursor-pointer hover:bg-gray-100 select-none"
                                        onClick={() => handleSort('wip')}
                                    >
                                        WIP <SortIcon col="wip" />
                                    </th>
                                    <th
                                        className="px-3 py-2 text-center font-bold text-black border border-gray-200 cursor-pointer hover:bg-gray-100 select-none"
                                        onClick={() => handleSort('rescheduled')}
                                    >
                                        FR <SortIcon col="rescheduled" />
                                    </th>
                                    <th
                                        className="px-3 py-2 text-center font-bold text-black border border-gray-200 cursor-pointer hover:bg-gray-100 select-none"
                                        onClick={() => handleSort('rejected')}
                                    >
                                        Rejected <SortIcon col="rejected" />
                                    </th>
                                    <th
                                        className="px-3 py-2 text-center font-bold text-black border border-gray-200 cursor-pointer hover:bg-gray-100 select-none"
                                        onClick={() => handleSort('completed')}
                                    >
                                        Completed <SortIcon col="completed" />
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="bg-white">
                                {sorted.map((c, idx) => (
                                    <tr key={c.campaign_id} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                                        <td className="px-3 py-2 text-center border border-gray-200 text-gray-500">{idx + 1}</td>
                                        <td className="px-3 py-2 border border-gray-200 max-w-[200px]">
                                            <p className="font-semibold text-gray-800 truncate" title={c.campaign_name}>
                                                {highlightText(c.campaign_name, search)}
                                            </p>
                                        </td>
                                        <td className="px-3 py-2 text-center border border-gray-200 text-gray-600">{highlightText(c.service, search)}</td>
                                        <td
                                            className="px-3 py-2 text-center border border-gray-200 cursor-pointer hover:bg-blue-50 transition-colors group"
                                            onClick={() => handleOpenAssets(c.campaign_name)}
                                            title="Click to view assets for this campaign"
                                        >
                                            <span
                                                className="font-semibold underline underline-offset-2 group-hover:font-extrabold transition-all"
                                                style={{ color: themeColor }}
                                            >
                                                {c.total_unique_customers}
                                            </span>
                                        </td>
                                        <td className="px-3 py-2 text-center border border-gray-200 text-gray-700">{c.total_followups}</td>

                                        <td className="px-3 py-2 text-center border border-gray-200">
                                            <StatBadge status="wip" count={c.wip} />
                                        </td>
                                        <td className="px-3 py-2 text-center border border-gray-200">
                                            <StatBadge status="rescheduled" count={c.rescheduled} />
                                        </td>
                                        <td className="px-3 py-2 text-center border border-gray-200">
                                            <StatBadge status="rejected" count={c.rejected} />
                                        </td>
                                        <td className="px-3 py-2 text-center border border-gray-200">
                                            <StatBadge status="completed" count={c.completed} />
                                        </td>
                                    </tr>
                                ))}

                                {/* Totals row */}
                                <tr className="bg-gray-100 font-bold border-t-2 border-gray-400">
                                    <td className="px-3 py-2 text-center border border-gray-300 text-gray-500">—</td>
                                    <td className="px-3 py-2 border border-gray-300 text-black">
                                        TOTAL ({campaigns.length} campaigns)
                                    </td>
                                    <td className="px-3 py-2 text-center border border-gray-300 text-gray-500">—</td>
                                    <td
                                        className="px-3 py-2 text-center border border-gray-300 cursor-pointer hover:bg-blue-50 transition-colors group"
                                        onClick={() => handleOpenAssets('')}
                                        title="Click to view all assets"
                                    >
                                        <span
                                            className="font-semibold underline underline-offset-2 group-hover:font-extrabold transition-all"
                                            style={{ color: themeColor }}
                                        >
                                            {totals.unique}
                                        </span>
                                    </td>
                                    <td className="px-3 py-2 text-center border border-gray-300 text-gray-800">{totals.followups}</td>
                                    <td className="px-3 py-2 text-center border border-gray-300 text-yellow-700">{totals.wip}</td>
                                    <td className="px-3 py-2 text-center border border-gray-300 text-purple-700">{totals.rescheduled}</td>
                                    <td className="px-3 py-2 text-center border border-gray-300 text-red-700">{totals.rejected}</td>
                                    <td className="px-3 py-2 text-center border border-gray-300 text-green-700">{totals.completed}</td>
                                </tr>
                            </tbody>
                        </table>
                    )}
                </div>

                {/* ── Footer ── */}
                <div className="px-5 py-3 border-t border-gray-100 flex justify-between items-center bg-gray-50 flex-shrink-0">
                    <p className="text-xs text-gray-500">
                    </p>
                    <button
                        onClick={onClose}
                        className="px-4 py-2 rounded-lg text-xs font-semibold text-white transition-all"
                        style={{ backgroundColor: themeColor }}
                    >
                        Close
                    </button>
                </div>

            </div>

            {/* ════════════════════════════════════ ATTENDED ASSETS MODAL ═══════════════════════════════════ */}
            {showAssetsModal && ReactDOM.createPortal(
                <div className="fixed inset-0 backdrop-blur-sm bg-black/50 flex items-center justify-center z-[10000] p-3">
                    <div className="bg-white rounded-xl shadow-2xl max-w-7xl w-full max-h-[92vh] overflow-hidden flex flex-col">

                        {/* Header */}
                        <div
                            className="px-4 py-3 border-b border-gray-200 flex flex-wrap justify-between items-center gap-2"
                            style={{ background: `linear-gradient(135deg, ${themeColor} 0%, #2c4a6e 100%)` }}
                        >
                            <div className="min-w-0">
                                <h3 className="text-base font-semibold text-white">
                                    Attended Assets — {employee?.user_name}
                                    {assetsCampaignFilter && (
                                        <span className="ml-2 text-[11px] font-normal bg-white/20 px-2 py-0.5 rounded-full">
                                            {assetsCampaignFilter}
                                        </span>
                                    )}
                                </h3>
                                <p className="text-[11px] text-white/80 mt-0.5">
                                    {periodLabel()} • {filteredAssets.length} asset{filteredAssets.length === 1 ? '' : 's'}
                                    {latestAssets.length !== filteredAssets.length && ` (of ${latestAssets.length})`}
                                    {' • Latest follow-up per customer per campaign'}
                                </p>
                            </div>

                            <div className="flex items-center gap-2 flex-wrap">

                                {/* Campaign filter dropdown (only if multiple campaigns present) */}
                                {uniqueCampaignsInAssets.length > 1 && (
                                    <div className="flex items-center gap-1">
                                        <label className="text-[11px] text-white whitespace-nowrap">Campaign:</label>
                                        <div className="relative">
                                            <select
                                                value={assetsCampaignFilter}
                                                onChange={(e) => setAssetsCampaignFilter(e.target.value)}
                                                className="border border-gray-300 rounded-md pl-2 pr-6 py-1 text-[11px] bg-white text-black appearance-none cursor-pointer focus:outline-none max-w-[200px] truncate"
                                            >
                                                <option value="">All Campaigns</option>
                                                {uniqueCampaignsInAssets.map(c => (
                                                    <option key={c} value={c}>{c}</option>
                                                ))}
                                            </select>
                                            <svg
                                                className="absolute right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 text-black pointer-events-none"
                                                fill="none" stroke="currentColor" viewBox="0 0 24 24"
                                            >
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                            </svg>
                                        </div>
                                    </div>
                                )}

                                {/* Status filter */}
                                <div className="flex items-center gap-1">
                                    <label className="text-[11px] text-white whitespace-nowrap">Status:</label>
                                    <div className="relative">
                                        <select
                                            value={assetsStatusFilter}
                                            onChange={(e) => setAssetsStatusFilter(e.target.value)}
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

                                {/* Clear filters */}
                                {(assetsCampaignFilter || assetsStatusFilter !== 'all' || assetsSearch) && (
                                    <button
                                        onClick={() => {
                                            setAssetsCampaignFilter('');
                                            setAssetsStatusFilter('all');
                                            setAssetsSearch('');
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
                                    placeholder="Search customer, phone, email…"
                                    value={assetsSearch}
                                    onChange={(e) => setAssetsSearch(e.target.value)}
                                    className="border border-gray-300 rounded-lg px-2 py-1 text-xs w-56 bg-white focus:outline-none"
                                />

                                {/* Close */}
                                <button
                                    onClick={() => setShowAssetsModal(false)}
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
                        <div className="flex-1 overflow-auto p-3">
                            {loadingAssets ? (
                                <div className="flex items-center justify-center py-10">
                                    <div className="w-8 h-8 border-2 border-t-2 border-t-[#2f3192] border-gray-200 rounded-full animate-spin"></div>
                                    <span className="ml-2 text-xs text-gray-600">Loading assets...</span>
                                </div>
                            ) : filteredAssets.length === 0 ? (
                                <div className="text-center py-10 text-xs text-gray-500">
                                    {latestAssets.length === 0
                                        ? 'No assets found for the selected time period.'
                                        : 'No assets match the current filters.'}
                                </div>
                            ) : (
                                <div className="overflow-x-auto">
                                    <table className="min-w-[1800px] w-full border-collapse text-[11px]">
                                        <thead className="bg-gray-100 sticky top-0 z-10">
                                            <tr>
                                                <th className="px-2 py-1.5 border border-gray-300 text-center font-semibold text-black whitespace-nowrap">S.No</th>
                                                <th className="px-2 py-1.5 border border-gray-300 text-center font-semibold text-black whitespace-nowrap">Instance ID</th>
                                                <th className="px-2 py-1.5 border border-gray-300 text-center font-semibold text-black whitespace-nowrap">Customer Name</th>
                                                <th className="px-2 py-1.5 border border-gray-300 text-center font-semibold text-black whitespace-nowrap">Phone</th>
                                                <th className="px-2 py-1.5 border border-gray-300 text-center font-semibold text-black whitespace-nowrap">Email</th>
                                                <th className="px-2 py-1.5 border border-gray-300 text-center font-semibold text-black whitespace-nowrap">Branch</th>
                                                <th className="px-2 py-1.5 border border-gray-300 text-center font-semibold text-black whitespace-nowrap">Campaign</th>
                                                <th className="px-2 py-1.5 border border-gray-300 text-center font-semibold text-black whitespace-nowrap">Service</th>
                                                <th className="px-2 py-1.5 border border-gray-300 text-center font-semibold text-black whitespace-nowrap">Latest F/U Date</th>
                                                <th className="px-2 py-1.5 border border-gray-300 text-center font-semibold text-black whitespace-nowrap">F/U By</th>
                                                <th className="px-2 py-1.5 border border-gray-300 text-center font-semibold text-black whitespace-nowrap">Status</th>
                                                <th className="px-2 py-1.5 border border-gray-300 text-center font-semibold text-black whitespace-nowrap">Next F/U</th>
                                                <th className="px-2 py-1.5 border border-gray-300 text-center font-semibold text-black whitespace-nowrap">Activity</th>
                                                <th className="px-2 py-1.5 border border-gray-300 text-center font-semibold text-black whitespace-nowrap">Remark</th>
                                                <th className="px-2 py-1.5 border border-gray-300 text-center font-semibold text-black whitespace-nowrap">Quote Sent</th>
                                                <th className="px-2 py-1.5 border border-gray-300 text-center font-semibold text-black whitespace-nowrap">Quote No.</th>
                                                <th className="px-2 py-1.5 border border-gray-300 text-center font-semibold text-black whitespace-nowrap">Quote Value</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-100">
                                            {filteredAssets.map((fu, idx) => (
                                                <tr key={fu.id || `${fu.customer_instance_id}-${fu.campaign_name}-${idx}`} className="hover:bg-blue-50 transition-colors">
                                                    <td className="px-2 py-1 border border-gray-200 text-center">{idx + 1}</td>
                                                    <td className="px-2 py-1 border border-gray-200 text-center">{fu.customer_instance_id || '-'}</td>
                                                    <td className="px-2 py-1 border border-gray-200 text-left">{fu.customer_name || '-'}</td>
                                                    <td className="px-2 py-1 border border-gray-200 text-center">{fu.phone_number || '-'}</td>
                                                    <td className="px-2 py-1 border border-gray-200 text-left">{fu.email || '-'}</td>
                                                    <td className="px-2 py-1 border border-gray-200 text-center">{fu.branch_id || '-'}</td>
                                                    <td className="px-2 py-1 border border-gray-200 text-left">{fu.campaign_name || '-'}</td>
                                                    <td className="px-2 py-1 border border-gray-200 text-left">{fu.campaign_service || '-'}</td>
                                                    <td className="px-2 py-1 border border-gray-200 text-center whitespace-nowrap">
                                                        {fu.followup_date ? new Date(fu.followup_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '-'}
                                                    </td>
                                                    <td className="px-2 py-1 border border-gray-200 text-center capitalize">{fu.followup_by || '-'}</td>
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
                                                    <td className="px-2 py-1 border border-gray-200 text-left max-w-[180px] truncate" title={fu.activity_content || ''}>{fu.activity_content || '-'}</td>
                                                    <td className="px-2 py-1 border border-gray-200 text-left max-w-[220px] truncate" title={fu.followup_remark || ''}>{fu.followup_remark || '-'}</td>
                                                    <td className="px-2 py-1 border border-gray-200 text-center">
                                                        {fu.quotation_sent ? <span className="text-green-600 font-semibold">Yes</span> : <span className="text-gray-500">No</span>}
                                                    </td>
                                                    <td className="px-2 py-1 border border-gray-200 text-center">{fu.quotation_no || '-'}</td>
                                                    <td className="px-2 py-1 border border-gray-200 text-right">
                                                        {fu.quotation_value ? `₹${parseFloat(fu.quotation_value).toLocaleString('en-IN')}` : '-'}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>

                        {/* Footer */}
                        <div className="px-4 py-2 border-t border-gray-200 bg-gray-50 flex justify-between items-center">
                            <p className="text-[11px] text-gray-500">
                                Showing the most recent follow-up per customer per campaign in the selected period.
                            </p>
                            <button
                                onClick={() => setShowAssetsModal(false)}
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
    );
};

export default EmployeeCampaignProgress;