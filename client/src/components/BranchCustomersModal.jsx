import React, { useState, useEffect } from 'react';
import { Bar, Pie } from 'react-chartjs-2';
import {
    Chart as ChartJS,
    CategoryScale,
    LinearScale,
    PointElement,
    BarElement,
    Title,
    Tooltip,
    Legend,
    Filler,
    ArcElement
} from 'chart.js';
import * as XLSX from 'xlsx';

ChartJS.register(
    CategoryScale,
    LinearScale,
    PointElement,
    BarElement,
    Title,
    Tooltip,
    Legend,
    Filler,
    ArcElement
);

const BranchCustomersModal = ({ isOpen, onClose, branch, apiBaseUrl, userData,
    preloadedEngaged, preloadedRemaining, preloadedAllocation, canExportProp }) => {
    const [branchData, setBranchData] = useState(null);
    const [totalCustomersData, setTotalCustomersData] = useState(null);
    const [loading, setLoading] = useState(false);
    const [remainingCustomersLoading, setRemainingCustomersLoading] = useState(false);
    const [exportLoading, setExportLoading] = useState(false);
    const [selectedCampaign, setSelectedCampaign] = useState(null);
    const [campaignDetailsOpen, setCampaignDetailsOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [activeCampaignFilter, setActiveCampaignFilter] = useState('all');
    const [statusFilter, setStatusFilter] = useState('all');
    const [allocationSummary, setAllocationSummary] = useState(null);
    const [allocationLoading, setAllocationLoading] = useState(false);
    const [canExport, setCanExport] = useState(false);

    const themeColor = '#2f3192';

    // useEffect(() => {
    //     if (isOpen && branch) {
    //         fetchBranchCampaignCustomers();
    //         fetchBranchTotalCustomers();
    //     }
    // }, [isOpen, branch]);

    useEffect(() => {
        if (!isOpen || !branch) return;

        if (preloadedEngaged) setBranchData(preloadedEngaged);
        else fetchBranchCampaignCustomers();

        if (preloadedRemaining) setTotalCustomersData(preloadedRemaining);
        else fetchBranchTotalCustomers();

        if (preloadedAllocation) setAllocationSummary(preloadedAllocation);
        else fetchBranchAllocationSummary();

        if (typeof canExportProp === 'boolean') setCanExport(canExportProp);
        else fetchExportPermission();
    }, [isOpen, branch]);

    const fetchBranchCampaignCustomers = async () => {
        try {
            setLoading(true);
            const response = await fetch(`${apiBaseUrl}/performance/branch-campaign-customers/${branch.branch}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    user_id: userData.user_id || userData.id,
                    name: userData.name,
                    role: userData.role,
                    branch: userData.branch
                })
            });

            if (!response.ok) {
                throw new Error('Failed to fetch branch campaign customers');
            }

            const data = await response.json();
            setBranchData(data);
        } catch (error) {
            console.error('Error fetching branch campaign customers:', error);
        } finally {
            setLoading(false);
        }
    };

    const fetchBranchTotalCustomers = async () => {
        try {
            setRemainingCustomersLoading(true);
            const response = await fetch(`${apiBaseUrl}/performance/branch-total-customers/${branch.branch}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    user_id: userData.user_id || userData.id,
                    name: userData.name,
                    role: userData.role,
                    branch: userData.branch
                })
            });

            if (!response.ok) {
                throw new Error('Failed to fetch branch total customers');
            }

            const data = await response.json();
            setTotalCustomersData(data);
        } catch (error) {
            console.error('Error fetching branch total customers:', error);
        } finally {
            setRemainingCustomersLoading(false);
        }
    };

    const getCampaignTotalAllocate = (campaign) => {
        if (campaign.total_allocate) return campaign.total_allocate;
        const engagedCustomers = campaign.total_customers || 0;
        const campaignData = totalCustomersData?.campaigns?.find(
            c => Number(c.campaign_id) === Number(campaign.campaign_id)
        );
        const remainingFromAssets = campaignData?.remaining_customers || 0;
        return engagedCustomers + remainingFromAssets;
    };

    const getCampaignRemainingCustomers = (campaign) => {
        const campaignData = totalCustomersData?.campaigns?.find(
            c => Number(c.campaign_id) === Number(campaign.campaign_id)
        );
        return campaignData?.remaining_customers || 0;
    };

    const getCampaignStatus = (campaign) => {
        const campaignData = totalCustomersData?.campaigns?.find(
            c => Number(c.campaign_id) === Number(campaign.campaign_id)
        );
        const status = campaignData?.status || 'unknown';
        return status.charAt(0).toUpperCase() + status.slice(1);
    };

    const openCampaignDetails = (campaign) => {
        setSelectedCampaign(campaign);
        setCampaignDetailsOpen(true);
        setStatusFilter('all');
        setSearchTerm('');
    };

    const closeCampaignDetails = () => {
        setCampaignDetailsOpen(false);
        setSelectedCampaign(null);
    };

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

    const exportToExcel = () => {
        if (!branchData?.campaigns?.length) return;

        setExportLoading(true);

        const campaignsWithAllocate = branchData.campaigns.filter(campaign => {
            const totalAllocate = getCampaignTotalAllocate(campaign);
            return totalAllocate > 0;
        });

        const wsData = [];

        wsData.push(['BRANCH CAMPAIGN REPORT']);
        wsData.push(['Generated Date:', new Date().toLocaleString()]);
        wsData.push(['Branch Name:', branchData.branch_name]);
        wsData.push(['Branch Code:', branchData.branch_code]);
        wsData.push(['Total Campaigns:', campaignsWithAllocate.length]);

        const totalBranchAssets = campaignsWithAllocate.reduce((sum, campaign) => {
            return sum + getCampaignTotalAllocate(campaign);
        }, 0);

        wsData.push(['Total Branch Assets:', totalBranchAssets]);
        wsData.push(['Completion Rate:', `${branchData.branch_completion_rate || 0}%`]);
        wsData.push([]);
        wsData.push(['CAMPAIGN SUMMARY']);
        wsData.push([]);

        wsData.push([
            'Campaign Name',
            'Service/product',
            'Status',
            'Total Allocated Assets',
            'Total Attended Assets',
            'Completed',
            'WIP',
            'Follow-up Reschedule',
            'Rejected',
            'Completion Rate %'
        ]);

        campaignsWithAllocate.forEach(campaign => {
            const totalAllocate = getCampaignTotalAllocate(campaign);
            const campaignStatus = getCampaignStatus(campaign);
            wsData.push([
                campaign.campaign_name,
                campaign.service,
                campaignStatus,
                totalAllocate,
                campaign.total_customers,
                campaign.completed_followups,
                campaign.wip_followups,
                campaign.rescheduled_followups || 0,
                campaign.rejected_followups,
                campaign.completion_rate
            ]);
        });

        const ws = XLSX.utils.aoa_to_sheet(wsData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Branch Campaign Report');

        ws['!cols'] = [
            { wch: 30 }, { wch: 20 }, { wch: 12 }, { wch: 15 },
            { wch: 12 }, { wch: 12 }, { wch: 10 }, { wch: 12 },
            { wch: 12 }, { wch: 15 }
        ];

        const filename = `branch_${branchData.branch_code}_campaign_report_${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.xlsx`;
        XLSX.writeFile(wb, filename);
        setExportLoading(false);
    };

    const fetchBranchAllocationSummary = async () => {
        try {
            setAllocationLoading(true);
            const response = await fetch(`${apiBaseUrl}/performance/branch-customer-allocate-summary/${branch.branch}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    user_id: userData.user_id || userData.id,
                    name: userData.name,
                    role: userData.role,
                    branch: userData.branch
                })
            });

            if (!response.ok) {
                throw new Error('Failed to fetch branch allocation summary');
            }

            const data = await response.json();
            setAllocationSummary(data);
        } catch (error) {
            console.error('Error fetching branch allocation summary:', error);
        } finally {
            setAllocationLoading(false);
        }
    };

    const fetchExportPermission = async () => {
        try {
            const response = await fetch(`${apiBaseUrl}/performance/check-export-permission`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    user_id: userData.user_id || userData.id,
                    name: userData.name,
                    role: userData.role,
                    branch: userData.branch
                })
            });

            if (!response.ok) {
                throw new Error('Failed to fetch export permission');
            }

            const data = await response.json();
            setCanExport(data?.can_export || false);
        } catch (error) {
            console.error('Error fetching export permission:', error);
            setCanExport(false);
        }
    };

    // useEffect(() => {
    //     if (isOpen && branch) {
    //         fetchBranchCampaignCustomers();
    //         fetchBranchTotalCustomers();
    //         fetchBranchAllocationSummary();
    //         fetchExportPermission();
    //     }
    // }, [isOpen, branch]);

    // Campaign-wise Customer Breakdown Data
    const getCampaignBreakdownData = () => {
        if (!branchData?.campaigns?.length) return null;

        const campaignsWithAllocate = branchData.campaigns.filter(campaign => {
            const totalAllocate = getCampaignTotalAllocate(campaign);
            return totalAllocate > 0;
        });

        const campaignsToShow = activeCampaignFilter === 'all'
            ? campaignsWithAllocate
            : campaignsWithAllocate.filter(c => {
                const campaignStatus = getCampaignStatus(c);
                return campaignStatus.toLowerCase() === 'active';
            });

        const sortedCampaigns = [...campaignsToShow].sort((a, b) => {
            const totalA = getCampaignTotalAllocate(a);
            const totalB = getCampaignTotalAllocate(b);
            return totalB - totalA;
        });

        return {
            labels: sortedCampaigns.map(c => {
                const totalAllocate = getCampaignTotalAllocate(c);
                const campaignName = c.campaign_name.length > 15
                    ? c.campaign_name.substring(0, 12) + '...'
                    : c.campaign_name;
                return `${campaignName} (${totalAllocate})`;
            }),
            datasets: [
                {
                    label: 'Remaining',
                    data: sortedCampaigns.map(c => {
                        const totalAllocate = getCampaignTotalAllocate(c);
                        const completed = c.completed_followups || 0;
                        // Remaining = Total Allocate - Completed
                        return totalAllocate - completed;
                    }),
                    backgroundColor: 'rgba(59, 130, 246, 0.85)',
                    borderColor: '#3b82f6',
                    borderWidth: 1,
                    borderRadius: 4,
                    barPercentage: 0.7,
                    categoryPercentage: 0.8
                },
                {
                    label: 'WIP',
                    data: sortedCampaigns.map(c => c.wip_followups || 0),
                    backgroundColor: 'rgba(234, 179, 8, 0.85)',
                    borderColor: '#eab308',
                    borderWidth: 1,
                    borderRadius: 4,
                    barPercentage: 0.7,
                    categoryPercentage: 0.8
                },
                {
                    label: 'FR',
                    data: sortedCampaigns.map(c => c.rescheduled_followups || 0),
                    backgroundColor: 'rgba(168, 85, 247, 0.85)',
                    borderColor: '#a855f7',
                    borderWidth: 1,
                    borderRadius: 4,
                    barPercentage: 0.7,
                    categoryPercentage: 0.8
                },
                {
                    label: 'Rejected',
                    data: sortedCampaigns.map(c => c.rejected_followups || 0),
                    backgroundColor: 'rgba(239, 68, 68, 0.85)',
                    borderColor: '#ef4444',
                    borderWidth: 1,
                    borderRadius: 4,
                    barPercentage: 0.7,
                    categoryPercentage: 0.8
                },
                {
                    label: 'Completed',
                    data: sortedCampaigns.map(c => c.completed_followups || 0),
                    backgroundColor: 'rgba(34, 197, 94, 0.85)',
                    borderColor: '#16a34a',
                    borderWidth: 1,
                    borderRadius: 4,
                    barPercentage: 0.7,
                    categoryPercentage: 0.8
                }
            ]
        };
    };

    // Chart options for Campaign-wise Breakdown
    const breakdownChartOptions = {
        responsive: true,
        maintainAspectRatio: false,
        layout: {
            padding: {
                top: 25,
                bottom: 10,
                left: 10,
                right: 10
            }
        },
        plugins: {
            legend: {
                position: 'top',
                labels: {
                    usePointStyle: true,
                    boxWidth: 10,
                    font: { size: 10 },
                    padding: 8
                }
            },
            tooltip: {
                callbacks: {
                    label: function (context) {
                        let label = context.dataset.label || '';
                        let value = context.raw || 0;
                        return `${label}: ${value.toLocaleString()}`;
                    }
                }
            }
        },
        scales: {
            y: {
                beginAtZero: true,
                suggestedMax: (() => {
                    let maxValue = 0;
                    if (branchData?.campaigns) {
                        branchData.campaigns.forEach(campaign => {
                            const values = [
                                getCampaignRemainingCustomers(campaign),
                                campaign.wip_followups || 0,
                                campaign.rescheduled_followups || 0,
                                campaign.rejected_followups || 0,
                                campaign.completed_followups || 0
                            ];
                            const campaignMax = Math.max(...values);
                            if (campaignMax > maxValue) maxValue = campaignMax;
                        });
                    }
                    return maxValue * 1.15;
                })(),
                title: {
                    display: true,
                    text: 'Number of Customers',
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
            x: {
                title: {
                    display: true,
                    text: 'Campaigns (Total Customers)',
                    font: { size: 11 }
                },
                grid: { display: false },
                ticks: {
                    font: { size: 9 },
                    rotation: 45,
                    maxRotation: 45,
                    minRotation: 45
                }
            }
        }
    };

    // Asset Status Distribution Data
    const getAssetStatusData = () => {
        return {
            labels: ['Completed', 'WIP', 'FR', 'Rejected'],
            datasets: [
                {
                    data: [
                        branchData?.completed_followups || 0,
                        branchData?.wip_followups || 0,
                        branchData?.rescheduled_followups || 0,
                        branchData?.rejected_followups || 0
                    ],
                    backgroundColor: [
                        'rgba(34, 197, 94, 0.85)',
                        'rgba(234, 179, 8, 0.85)',
                        'rgba(168, 85, 247, 0.85)',
                        'rgba(239, 68, 68, 0.85)'
                    ],
                    borderColor: [
                        '#22c55e',
                        '#eab308',
                        '#a855f7',
                        '#ef4444'
                    ],
                    borderWidth: 2
                }
            ]
        };
    };

    // Filter campaigns with allocate customers > 0
    const campaignsWithAllocate = branchData?.campaigns?.filter(campaign => {
        const totalAllocate = getCampaignTotalAllocate(campaign);
        return totalAllocate > 0;
    }) || [];

    // Calculate total branch assets
    const totalBranchAssets = campaignsWithAllocate.reduce((sum, campaign) => {
        return sum + getCampaignTotalAllocate(campaign);
    }, 0);

    const totalEngagedCustomers = branchData?.total_customers || 0;
    const totalCompleted = branchData?.completed_followups || 0;
    const totalWip = branchData?.wip_followups || 0;
    const totalRejected = branchData?.rejected_followups || 0;
    const completionRate = branchData?.branch_completion_rate || 0;
    const totalFR = totalEngagedCustomers - (totalWip + totalCompleted + totalRejected);
    const totalRemaining = totalBranchAssets - totalEngagedCustomers;

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 overflow-y-auto">
            <div className="flex items-center justify-center h-screen w-screen p-0">
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity" onClick={onClose}></div>

                <div className="relative w-screen h-screen max-w-none bg-white shadow-2xl overflow-y-auto rounded-none">
                    {/* Header */}
                    <div className="sticky top-0 z-20 px-4 sm:px-5 py-3 border-b border-gray-200" style={{ background: `linear-gradient(135deg, ${themeColor} 0%, #2c4a6e 100%)` }}>
                        <div className="flex items-center justify-between">
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                    <svg className="w-4 h-4 sm:w-5 sm:h-5 text-white flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                                    </svg>
                                    <h3 className="text-sm sm:text-base font-bold text-white truncate">
                                        {branchData?.branch_name} - Campaign Report ({campaignsWithAllocate.length})
                                    </h3>
                                </div>
                                <p className="text-[10px] sm:text-xs text-white/80 mt-0.5 ml-6 sm:ml-7">
                                    Branch Code: {branchData?.branch_code}
                                </p>
                            </div>
                            <button
                                onClick={onClose}
                                className="w-7 h-7 sm:w-8 sm:h-8 bg-white rounded-lg flex items-center justify-center transition-all duration-200 group flex-shrink-0"
                            >
                                <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-black group-hover:rotate-90 transition-transform duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>
                    </div>

                    {/* Stats Cards - 4 Cards Layout */}
                    <div className="px-4 sm:px-5 py-3.5 bg-gradient-to-b from-gray-50 to-white border-b border-gray-200">
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                            {/* 1st Card - Branch Allocation Summary */}
                            <div className="bg-gray-100 rounded-2xl shadow-sm border border-gray-200 p-3">
                                <h3 className="text-[11px] font-semibold text-black uppercase mb-2">
                                    Customers Allocated to Branch
                                </h3>
                                {allocationLoading ? (
                                    <div className="flex justify-center items-center h-[72px]">
                                        <div className="w-5 h-5 border-2 border-t-2 border-t-[#2f3192] border-gray-200 rounded-full animate-spin"></div>
                                    </div>
                                ) : (
                                    <div className="flex items-center justify-between">
                                        <div className="w-[30%] flex justify-center">
                                            <p className="text-lg font-bold text-gray-900">
                                                {allocationSummary?.total_allocated_customers?.toLocaleString() || 0}
                                            </p>
                                        </div>
                                        <div className="w-px h-12 bg-gradient-to-b from-transparent via-gray-400 to-transparent"></div>
                                        <div className="w-[60%] flex flex-col text-xs font-semibold space-y-1">
                                            <div className="flex flex-row justify-between items-baseline">
                                                <span>Attended:</span>
                                                <span className="font-bold text-lg whitespace-nowrap">
                                                    {allocationSummary?.attended_customers?.toLocaleString() || 0}
                                                </span>
                                            </div>
                                            <div className="flex flex-row justify-between items-baseline">
                                                <span>Remaining:</span>
                                                <span className="font-bold text-lg whitespace-nowrap">
                                                    {allocationSummary?.total_allocated_customers && allocationSummary?.attended_customers
                                                        ? (allocationSummary.total_allocated_customers - allocationSummary.attended_customers).toLocaleString()
                                                        : 0}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* 2nd Card - Total Branch Assets */}
                            <div className="bg-gray-100 rounded-2xl shadow-sm border border-gray-200 p-3">
                                <h3 className="text-[11px] font-semibold text-black uppercase mb-2">
                                    Assets Allocated to Branch
                                </h3>
                                <div className="flex items-center justify-between">
                                    <div className="w-[35%] flex justify-center">
                                        <p className="text-2xl font-bold text-gray-900">
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
                                                {(totalBranchAssets - totalEngagedCustomers).toLocaleString()}  {/* ← Fix */}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* 3rd Card - Engaged Campaign Assets */}
                            <div className="bg-gray-100 rounded-2xl shadow-sm border border-gray-200 p-3">
                                <h3 className="text-[11px] font-semibold text-black uppercase mb-2">
                                    Assets Attended
                                </h3>
                                <div className="flex items-center justify-between">
                                    <div className="w-[30%] flex justify-center">
                                        <p className="text-2xl font-bold text-black">
                                            {totalEngagedCustomers.toLocaleString()}
                                        </p>
                                    </div>
                                    <div className="w-px h-12 bg-gradient-to-b from-transparent via-gray-400 to-transparent"></div>
                                    <div className="w-[60%] grid grid-cols-2 gap-x-3 gap-y-1 text-xs font-semibold place-items-center">
                                        <div>
                                            W: <span className="font-bold text-lg text-black">{totalWip.toLocaleString()}</span>
                                        </div>
                                        <div>
                                            FR: <span className="font-bold text-lg text-black">{totalFR.toLocaleString()}</span>
                                        </div>
                                        <div>
                                            R: <span className="font-bold text-lg text-black">{totalRejected.toLocaleString()}</span>
                                        </div>
                                        <div>
                                            C: <span className="font-bold text-lg text-black">{totalCompleted.toLocaleString()}</span>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* 4th Card - Performance */}
                            <div className="bg-gray-100 rounded-2xl shadow-sm border border-gray-200 p-3">
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

                    {/* Two Graphs Section - 65/35 Ratio */}
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 p-4 sm:p-5">
                        {/* Campaign-wise Customer Breakdown - 65% width (8 columns) */}
                        <div className="lg:col-span-8 bg-white rounded-xl shadow-sm p-3 border border-gray-100">
                            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2.5 mb-4">
                                <div>
                                    <h3 className="text-base font-semibold text-gray-800">
                                        Campaign-wise Customer Breakdown
                                    </h3>
                                    <p className="text-[10px] text-gray-500 mt-0.5">Remaining vs WIP vs FR vs Rejected vs Completed</p>
                                </div>
                                <div className="flex gap-1.5">
                                    <button
                                        onClick={() => setActiveCampaignFilter('all')}
                                        className={`px-2.5 py-1 text-[11px] rounded-lg transition-colors ${activeCampaignFilter === 'all' ? 'bg-[#2f3192] text-white' : 'bg-gray-100 text-black hover:bg-gray-200'}`}
                                    >
                                        All Campaigns
                                    </button>
                                    <button
                                        onClick={() => setActiveCampaignFilter('active')}
                                        className={`px-2.5 py-1 text-[11px] rounded-lg transition-colors ${activeCampaignFilter === 'active' ? 'bg-[#2f3192] text-white' : 'bg-gray-100 text-black hover:bg-gray-200'}`}
                                    >
                                        Active Only
                                    </button>
                                </div>
                            </div>

                            <div className="h-[420px] w-full overflow-x-auto">
                                {getCampaignBreakdownData() ? (
                                    <Bar data={getCampaignBreakdownData()} options={breakdownChartOptions} />
                                ) : (
                                    <div className="h-64 flex items-center justify-center text-gray-500">
                                        No campaign data available
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Asset Status Distribution - 35% width (4 columns) */}
                        <div className="lg:col-span-4 bg-white rounded-xl shadow-sm p-3 border border-gray-100 flex flex-col">
                            <h3 className="text-base font-semibold text-gray-800 mb-4">
                                Asset Status Distribution
                            </h3>

                            <div className="flex-1 flex items-center justify-center">
                                <div className="w-full max-w-[280px] mx-auto">
                                    <Pie
                                        data={getAssetStatusData()}
                                        options={{
                                            responsive: true,
                                            maintainAspectRatio: true,
                                            plugins: {
                                                legend: {
                                                    position: 'bottom',
                                                    labels: {
                                                        boxWidth: 12,
                                                        padding: 12,
                                                        font: { size: 11 }
                                                    }
                                                },
                                                tooltip: {
                                                    callbacks: {
                                                        label: function (context) {
                                                            const label = context.label || '';
                                                            const value = context.raw || 0;
                                                            const total = context.dataset.data.reduce((a, b) => a + b, 0);
                                                            const percentage = total > 0 ? ((value / total) * 100).toFixed(1) : 0;
                                                            return `${label}: ${value.toLocaleString()} (${percentage}%)`;
                                                        }
                                                    }
                                                }
                                            }
                                        }}
                                    />
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Campaign Table */}
                    <div className="px-4 sm:px-5 py-3.5 bg-white">
                        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2.5 mb-3.5">
                            <h4 className="text-sm font-semibold text-black">All Campaigns</h4>
                            {canExport && (
                                <button
                                    onClick={exportToExcel}
                                    disabled={exportLoading || !campaignsWithAllocate.length}
                                    className="px-3.5 py-1.5 bg-green-600 text-white text-xs rounded-lg hover:bg-green-700 transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50"
                                >
                                    {exportLoading ? (
                                        <>
                                            <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                                            Exporting...
                                        </>
                                    ) : (
                                        <>
                                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                                            </svg>
                                            Export to Excel
                                        </>
                                    )}
                                </button>
                            )}
                        </div>

                        {loading ? (
                            <div className="flex justify-center py-12">
                                <div className="w-8 h-8 border-3 border-t-3 border-t-[#2f3192] border-gray-200 rounded-full animate-spin"></div>
                            </div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="min-w-full border-collapse border border-gray-300">
                                    <thead className="bg-gray-100">
                                        <tr>
                                            <th className="border border-gray-300 px-5 py-2 text-center text-[11px] font-semibold text-black">Sr. No.</th>
                                            <th className="border border-gray-300 px-5 py-2 text-center text-[11px] font-semibold text-black">Campaign Name</th>
                                            <th className="border border-gray-300 px-5 py-2 text-center text-[11px] font-semibold text-black">Service/Product</th>
                                            <th className="border border-gray-300 px-5 py-2 text-center text-[11px] font-semibold text-black">Status</th>
                                            <th className="border border-gray-300 px-0 py-2 text-center text-[11px] font-semibold text-black">Total Allocated Assets</th>
                                            <th className="border border-gray-300 px-0 py-2 text-center text-[11px] font-semibold text-black">Total Attended Assets</th>
                                            <th className="border border-gray-300 px-5 py-2 text-center text-[11px] font-semibold text-black">WIP</th>
                                            <th className="border border-gray-300 px-0 py-2 text-center text-[11px] font-semibold text-black">Follow-up Reschedule</th>
                                            <th className="border border-gray-300 px-5 py-2 text-center text-[11px] font-semibold text-black">Rejected</th>
                                            <th className="border border-gray-300 px-5 py-2 text-center text-[11px] font-semibold text-black">Completed</th>
                                            <th className="border border-gray-300 px-0 py-2 text-center text-[11px] font-semibold text-black">Completion Rate</th>
                                        </tr>
                                    </thead>
                                    <tbody className="bg-white">
                                        {campaignsWithAllocate.filter(c => getCampaignStatus(c) !== 'unknown').map((campaign, idx) => {
                                            const totalAllocate = getCampaignTotalAllocate(campaign);
                                            const campaignStatus = getCampaignStatus(campaign);
                                            return (
                                                <tr key={campaign.campaign_id} className="hover:bg-gray-50 cursor-pointer" onClick={() => openCampaignDetails(campaign)}>
                                                    <td className="border border-gray-300 px-3 py-1 text-center text-[11px] text-black">{idx + 1}</td>
                                                    <td className="border border-gray-300 px-3 py-1 text-[11px] font-medium text-blue-800 underline hover:font-bold cursor-pointer">                                                        {campaign.campaign_name}
                                                    </td>
                                                    <td className="border border-gray-300 px-3 py-1 text-center text-[11px] text-black">{campaign.service}</td>
                                                    <td className="border border-gray-300 px-3 py-1 text-center">
                                                        <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[11px] font-medium bg-gray-100 text-black">
                                                            {campaignStatus}
                                                        </span>
                                                    </td>
                                                    <td className="border border-gray-300 px-3 py-1 text-center text-[11px] font-semibold text-black">{totalAllocate.toLocaleString()}</td>
                                                    <td className="border border-gray-300 px-3 py-1 text-center text-[11px] font-semibold">{campaign.total_customers?.toLocaleString() || 0}</td>
                                                    <td className="border border-gray-300 px-3 py-1 text-center text-[11px] font-semibold">{campaign.wip_followups?.toLocaleString() || 0}</td>
                                                    <td className="border border-gray-300 px-3 py-1 text-center text-[11px] font-semibold">{campaign.rescheduled_followups?.toLocaleString() || 0}</td>
                                                    <td className="border border-gray-300 px-3 py-1 text-center text-[11px] font-semibold">{campaign.rejected_followups?.toLocaleString() || 0}</td>
                                                    <td className="border border-gray-300 px-3 py-1 text-center text-[11px] font-semibold">{campaign.completed_followups?.toLocaleString() || 0}</td>
                                                    <td className="border border-gray-300 px-3 py-1 text-center text-[11px] font-semibold text-black">{campaign.completion_rate}%</td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                                {(!campaignsWithAllocate.length) && (
                                    <div className="text-center py-8 text-gray-500 text-xs">
                                        No campaigns found with allocated customers.
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Campaign Details Modal */}
            {campaignDetailsOpen && selectedCampaign && (
                <div className="fixed inset-0 z-50 overflow-y-auto">
                    <div className="flex items-center justify-center min-h-screen p-4">
                        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity" onClick={closeCampaignDetails}></div>

                        <div className="relative bg-white rounded-lg shadow-xl max-w-7xl w-full max-h-[90vh] overflow-hidden">
                            {/* Modal Header */}
                            <div className="sticky top-0 z-10 px-5 py-3 border-b border-gray-200" style={{ background: `linear-gradient(135deg, ${themeColor} 0%, #2c4a6e 100%)` }}>
                                <div className="flex items-center justify-between">
                                    <div>
                                        <h3 className="text-base font-bold text-white">{selectedCampaign.campaign_name}</h3>
                                        <p className="text-[10px] text-white/80 mt-0.5">{selectedCampaign.service}</p>
                                    </div>
                                    <button
                                        onClick={closeCampaignDetails}
                                        className="w-7 h-7 bg-white rounded-lg flex items-center justify-center transition-all duration-200"
                                    >
                                        <svg className="w-3.5 h-3.5 text-black" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                        </svg>
                                    </button>
                                </div>
                            </div>

                            {/* Modal Content */}
                            <div className="p-3 overflow-y-auto max-h-[calc(90vh-70px)]">
                                {/* Search and Filter */}
                                <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-2.5 mb-4">
                                    <div className="relative flex-1 sm:w-72">
                                        <input
                                            type="text"
                                            placeholder="Search by customer name, instance ID, phone, branch ID or location..."
                                            value={searchTerm}
                                            onChange={(e) => setSearchTerm(e.target.value)}
                                            className="w-full pl-8 pr-7 py-1.5 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#2f3192]/20 focus:border-[#2f3192] text-black"
                                        />
                                        <svg className="absolute left-2.5 top-2 w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                        </svg>
                                        {searchTerm && (
                                            <button onClick={() => setSearchTerm('')} className="absolute right-2.5 top-2 text-gray-400 hover:text-gray-600">
                                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                                </svg>
                                            </button>
                                        )}
                                    </div>
                                    <div className="flex gap-2 flex-wrap">
                                        <button
                                            onClick={() => setStatusFilter('all')}
                                            className={`px-3 py-1.5 text-xs rounded-lg transition-colors ${statusFilter === 'all' ? 'bg-[#2f3192] text-white' : 'bg-gray-100 text-black hover:bg-gray-200'}`}
                                        >
                                            All ({selectedCampaign.customers?.length || 0})
                                        </button>
                                        <button
                                            onClick={() => setStatusFilter('pending')}
                                            className={`px-3 py-1.5 text-xs rounded-lg transition-colors ${statusFilter === 'pending' ? 'bg-orange-500 text-white' : 'bg-orange-50 text-orange-700 hover:bg-orange-100'}`}
                                        >
                                            Pending ({selectedCampaign.customers?.filter(c => !c.last_status || c.last_status?.toLowerCase() === 'pending').length || 0})
                                        </button>
                                        <button
                                            onClick={() => setStatusFilter('wip')}
                                            className={`px-3 py-1.5 text-xs rounded-lg transition-colors ${statusFilter === 'wip' ? 'bg-yellow-500 text-white' : 'bg-yellow-50 text-yellow-700 hover:bg-yellow-100'}`}
                                        >
                                            WIP ({selectedCampaign.wip_followups || 0})
                                        </button>
                                        <button
                                            onClick={() => setStatusFilter('rescheduled')}
                                            className={`px-3 py-1.5 text-xs rounded-lg transition-colors ${statusFilter === 'rescheduled' ? 'bg-purple-500 text-white' : 'bg-purple-50 text-purple-700 hover:bg-purple-100'}`}
                                        >
                                            Follow-up Reschedule ({selectedCampaign.rescheduled_followups || 0})
                                        </button>
                                        <button
                                            onClick={() => setStatusFilter('rejected')}
                                            className={`px-3 py-1.5 text-xs rounded-lg transition-colors ${statusFilter === 'rejected' ? 'bg-red-500 text-white' : 'bg-red-50 text-red-700 hover:bg-red-100'}`}
                                        >
                                            Rejected ({selectedCampaign.rejected_followups || 0})
                                        </button>
                                        <button
                                            onClick={() => setStatusFilter('completed')}
                                            className={`px-3 py-1.5 text-xs rounded-lg transition-colors ${statusFilter === 'completed' ? 'bg-green-500 text-white' : 'bg-green-50 text-green-700 hover:bg-green-100'}`}
                                        >
                                            Completed ({selectedCampaign.completed_followups || 0})
                                        </button>
                                        <button
                                            onClick={() => setStatusFilter('remaining')}
                                            className={`px-3 py-1.5 text-xs rounded-lg transition-colors ${statusFilter === 'remaining' ? 'bg-gray-500 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
                                        >
                                            Remaining ({selectedCampaign.customers?.filter(c => c.last_status?.toLowerCase() === 'remaining' || !c.last_status).length || 0})
                                        </button>
                                    </div>
                                </div>

                                {/* Customers Table */}
                                <div className="overflow-x-auto">
                                    <table className="min-w-full border-collapse border border-gray-300">
                                        <thead className="bg-gray-100 sticky top-0">
                                            <tr>
                                                <th className="border border-gray-300 px-2.5 py-1.5 text-center text-[10px] font-medium text-black">Sr. No.</th>
                                                <th className="border border-gray-300 px-2.5 py-1.5 text-center text-[10px] font-medium text-black">Instance ID</th>
                                                <th className="border border-gray-300 px-2.5 py-1.5 text-center text-[10px] font-medium text-black">Customer Name</th>
                                                <th className="border border-gray-300 px-2.5 py-1.5 text-center text-[10px] font-medium text-black">Phone</th>
                                                <th className="border border-gray-300 px-2.5 py-1.5 text-center text-[10px] font-medium text-black">Email</th>
                                                <th className="border border-gray-300 px-2.5 py-1.5 text-center text-[10px] font-medium text-black">Branch ID</th>
                                                <th className="border border-gray-300 px-2.5 py-1.5 text-center text-[10px] font-medium text-black">Location</th>
                                                <th className="border border-gray-300 px-2.5 py-1.5 text-center text-[10px] font-medium text-black">Status</th>
                                                <th className="border border-gray-300 px-2.5 py-1.5 text-center text-[10px] font-medium text-black">Last User</th>
                                                <th className="border border-gray-300 px-2.5 py-1.5 text-center text-[10px] font-medium text-black">Last Follow-up Date</th>
                                                <th className="border border-gray-300 px-2.5 py-1.5 text-center text-[10px] font-medium text-black">Next Follow-up Date</th>
                                                <th className="border border-gray-300 px-2.5 py-1.5 text-center text-[10px] font-medium text-black">Flag</th>
                                                <th className="border border-gray-300 px-2.5 py-1.5 text-center text-[10px] font-medium text-black">Remark</th>
                                                <th className="border border-gray-300 px-2.5 py-1.5 text-center text-[10px] font-medium text-black">Quotation</th>
                                            </tr>
                                        </thead>
                                        <tbody className="bg-white">
                                            {(() => {
                                                let filteredCustomers = selectedCampaign.customers || [];

                                                if (statusFilter !== 'all') {
                                                    if (statusFilter === 'pending') {
                                                        // Customers never touched (no last_status) or explicitly 'pending'
                                                        filteredCustomers = filteredCustomers.filter(customer =>
                                                            !customer.last_status || customer.last_status?.toLowerCase() === 'pending'
                                                        );
                                                    } else {
                                                        filteredCustomers = filteredCustomers.filter(customer =>
                                                            customer.last_status?.toLowerCase() === statusFilter.toLowerCase()
                                                        );
                                                    }
                                                }

                                                if (searchTerm) {
                                                    const searchLower = searchTerm.toLowerCase();
                                                    filteredCustomers = filteredCustomers.filter(customer =>
                                                        customer.customer_name?.toLowerCase().includes(searchLower) ||
                                                        customer.instance_id?.toLowerCase().includes(searchLower) ||
                                                        customer.phone_number?.toLowerCase().includes(searchLower) ||
                                                        customer.branch_id?.toLowerCase().includes(searchLower) ||
                                                        customer.location?.toLowerCase().includes(searchLower)
                                                    );
                                                }

                                                const sortedCustomers = [...filteredCustomers].sort((a, b) => {
                                                    const statusOrder = {
                                                        'wip': 1,
                                                        'rescheduled': 2,
                                                        'rejected': 3,
                                                        'completed': 4
                                                    };

                                                    const statusA = a.last_status?.toLowerCase() || 'remaining';
                                                    const statusB = b.last_status?.toLowerCase() || 'remaining';

                                                    const orderA = statusOrder[statusA] || 5;
                                                    const orderB = statusOrder[statusB] || 5;

                                                    if (orderA !== orderB) {
                                                        return orderA - orderB;
                                                    }

                                                    return (a.customer_name || '').localeCompare(b.customer_name || '');
                                                });

                                                if (sortedCustomers.length === 0) {
                                                    return (
                                                        <tr>
                                                            <td colSpan="14" className="text-center py-8 text-gray-500 text-xs">
                                                                No customers found.
                                                            </td>
                                                        </tr>
                                                    );
                                                }

                                                return sortedCustomers.map((customer, idx) => (
                                                    <tr key={customer.instance_id} className="hover:bg-gray-50">
                                                        <td className="border border-gray-300 px-1 py-1.5 text-[10px] text-black text-center">{idx + 1}</td>
                                                        <td className="border border-gray-300 px-1 py-1.5 text-[10px] font-mono text-black text-center">{highlightText(customer.instance_id, searchTerm)}</td>
                                                        <td
                                                            title={customer.customer_name}
                                                            className="border border-gray-300 px-1 py-1.5 text-[10px] font-medium text-black max-w-[120px] truncate"
                                                        >
                                                            {highlightText(customer.customer_name, searchTerm)}
                                                        </td>
                                                        <td className="border border-gray-300 px-2.5 py-1.5 text-[10px] text-black text-center">{highlightText(customer.phone_number, searchTerm)}</td>
                                                        <td className="border border-gray-300 px-1 py-1.5 text-[10px] text-black max-w-[130px] truncate" title={customer.email}>
                                                            {highlightText(customer.email, searchTerm)}
                                                        </td>
                                                        <td className="border border-gray-300 px-1 py-1.5 text-[10px] font-mono text-black text-center">
                                                            <span className="px-2.5 py-1.5 rounded text-[10px]">{customer.branch_id ? highlightText(customer.branch_id, searchTerm) : '—'}</span>
                                                        </td>
                                                        <td className="border border-gray-300 px-1 py-1.5 text-[10px] text-black max-w-[120px] truncate" title={customer.location}>
                                                            {customer.location ? highlightText(customer.location, searchTerm) : '—'}
                                                        </td>
                                                        <td className="border border-gray-300 px-1 py-1.5 text-center">
                                                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-gray-100 text-black">
                                                                {customer.last_status
                                                                    ? customer.last_status.charAt(0).toUpperCase() + customer.last_status.slice(1)
                                                                    : 'Pending'}
                                                            </span>
                                                        </td>
                                                        <td className="border border-gray-300 px-1 py-1.5 text-[10px] text-black text-center">
                                                            <div>{customer.last_followup_user_name}</div>
                                                            <div className="text-[8px] text-gray-500">{customer.last_followup_user_id}</div>
                                                        </td>
                                                        <td className="border border-gray-300 px-1 py-1.5 text-[10px] text-black text-center whitespace-nowrap">
                                                            {customer.last_followup_date ? new Date(customer.last_followup_date).toLocaleDateString() : '—'}
                                                        </td>
                                                        <td className="border border-gray-300 px-1 py-1.5 text-[10px] text-black text-center whitespace-nowrap">
                                                            {customer.next_followup_date ? new Date(customer.next_followup_date).toLocaleDateString() : '—'}
                                                        </td>
                                                        <td className="border border-gray-300 px-1 py-1.5 text-center">
                                                            <span className="inline-flex px-1.5 py-0.5 rounded-md text-[9px] font-bold text-black">
                                                                {customer.latest_flag}
                                                            </span>
                                                        </td>
                                                        <td className="border border-gray-300 px-1 py-1.5 text-[10px] text-black max-w-[130px] truncate" title={customer.latest_remark}>
                                                            {customer.latest_remark || '—'}
                                                        </td>
                                                        <td className="border border-gray-300 px-1 py-1.5 text-center">
                                                            {customer.quotation_sent ? (
                                                                <span className="text-green-600 font-semibold text-[10px]">₹{customer.quotation_value?.toLocaleString()}</span>
                                                            ) : (
                                                                <span className="text-gray-500 text-[10px]">Not Sent</span>
                                                            )}
                                                        </td>
                                                    </tr>
                                                ));
                                            })()}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default BranchCustomersModal;