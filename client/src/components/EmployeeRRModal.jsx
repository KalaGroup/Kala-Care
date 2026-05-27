import React, { useState, useEffect, useMemo, useCallback } from 'react';
import ReactDOM from 'react-dom';
import axios from 'axios';

const themeColor = '#2f3192';

const EmployeeRRModal = ({
    isOpen,
    onClose,
    employee,            // { user_id, user_name, branch, branch_display }
    rrName,              // the rejected reason that was clicked
    apiBaseUrl,
    timePeriod,
    customStartDate,
    customEndDate,
    selectedCampaigns = [],
    allCampaigns = []
}) => {
    const selectedCampaignNames = useMemo(() => {
        const set = new Set();
        if (selectedCampaigns && selectedCampaigns.length > 0) {
            allCampaigns.forEach(c => {
                if (selectedCampaigns.includes(c.id)) set.add((c.name || '').toLowerCase());
            });
        } else {
            allCampaigns.forEach(c => set.add((c.name || '').toLowerCase()));
        }
        return set;
    }, [selectedCampaigns, allCampaigns]);

    const [allFollowupsData, setAllFollowupsData] = useState([]);
    const [loading, setLoading] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');
    const [createdFromDate, setCreatedFromDate] = useState('');
    const [createdToDate, setCreatedToDate] = useState('');

    const formatDateForAPI = useCallback((date) => {
        if (!date) return null;
        return date.toISOString().split('T')[0];
    }, []);

    useEffect(() => {
        const t = setTimeout(() => setDebouncedSearch(searchTerm), 250);
        return () => clearTimeout(t);
    }, [searchTerm]);

    const fetchAllFollowups = useCallback(async () => {
        if (!employee || !employee.user_id) return;
        setLoading(true);
        try {
            const payload = {
                user_id: employee.user_id,
                name: employee.user_name,
                role: 'employee',
                branch: employee.branch
            };
            let url = `${apiBaseUrl}/performance/my-performance/all-followups?time_period=${timePeriod || 'all'}`;
            if (timePeriod === 'custom' && customStartDate && customEndDate) {
                const sd = formatDateForAPI(customStartDate);
                const ed = formatDateForAPI(customEndDate);
                if (sd && ed) url += `&start_date=${sd}&end_date=${ed}`;
            }
            const response = await axios.post(url, payload);
            setAllFollowupsData(response.data?.followups || []);
        } catch (error) {
            console.error('Error fetching employee followups:', error);
            setAllFollowupsData([]);
        } finally {
            setLoading(false);
        }
    }, [employee, apiBaseUrl, timePeriod, customStartDate, customEndDate, formatDateForAPI]);

    useEffect(() => {
        if (isOpen && employee) {
            setSearchTerm('');
            setCreatedFromDate('');
            setCreatedToDate('');
            fetchAllFollowups();
        }
    }, [isOpen, employee, fetchAllFollowups]);

    const filteredFollowups = useMemo(() => {
        if (!allFollowupsData) return [];

        return allFollowupsData.filter(fu => {
            // ✅ Filter by clicked rejected reason
            if (rrName) {
                const rr = (fu.rr_content || '').toLowerCase();
                if (!rr.includes(rrName.toLowerCase())) return false;
            }

            // ✅ Filter by campaigns
            if (allCampaigns && allCampaigns.length > 0 && selectedCampaignNames.size > 0) {
                const campName = (fu.campaign_name || '').toLowerCase();
                if (!selectedCampaignNames.has(campName)) return false;
            }

            // Search
            if (debouncedSearch.trim()) {
                const t = debouncedSearch.toLowerCase();
                const match = (
                    (fu.customer_name || '').toLowerCase().includes(t) ||
                    (fu.campaign_name || '').toLowerCase().includes(t) ||
                    (fu.followup_remark || '').toLowerCase().includes(t) ||
                    (fu.customer_instance_id || '').toString().toLowerCase().includes(t) ||
                    (fu.phone_number || '').toString().toLowerCase().includes(t) ||
                    (fu.email || '').toLowerCase().includes(t)
                );
                if (!match) return false;
            }

            // Created At range
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
    }, [allFollowupsData, rrName, selectedCampaignNames, debouncedSearch, createdFromDate, createdToDate]);

    if (!isOpen) return null;

    return ReactDOM.createPortal(
        <div className="fixed inset-0 backdrop-blur-sm bg-black/40 flex items-center justify-center z-[10000] p-3">
            <div className="bg-white rounded-xl shadow-xl max-w-7xl w-full max-h-[92vh] overflow-hidden flex flex-col">
                <div
                    className="px-4 py-3 border-b border-gray-200 flex justify-between items-center"
                    style={{ background: `linear-gradient(135deg, ${themeColor} 0%, #2c4a6e 100%)` }}
                >
                    <div>
                        <h3 className="text-base font-semibold text-white">
                            {rrName || 'Rejected Reason'} — {employee?.user_name || 'Employee'}
                        </h3>
                        <p className="text-[11px] text-white/80 mt-0.5">
                            Branch: {employee?.branch_display || employee?.branch || 'N/A'} • Total: {filteredFollowups.length} follow-up(s)
                            {selectedCampaignNames && selectedCampaignNames.size > 0 && (
                                <span className="ml-1">• Campaigns: {selectedCampaignNames.size}</span>
                            )}
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="flex items-center gap-1">
                            <label className="text-[11px] text-white whitespace-nowrap">From:</label>
                            <input
                                type="date"
                                value={createdFromDate}
                                onChange={(e) => {
                                    const v = e.target.value;
                                    setCreatedFromDate(v);
                                    if (createdToDate && v && new Date(createdToDate) < new Date(v)) setCreatedToDate('');
                                }}
                                max={createdToDate || undefined}
                                className="border border-gray-300 rounded-md px-2 py-1 text-[11px] bg-white text-black"
                            />
                        </div>
                        <div className="flex items-center gap-1">
                            <label className="text-[11px] text-white whitespace-nowrap">To:</label>
                            <input
                                type="date"
                                value={createdToDate}
                                onChange={(e) => {
                                    const v = e.target.value;
                                    if (createdFromDate && v && new Date(v) < new Date(createdFromDate)) return;
                                    setCreatedToDate(v);
                                }}
                                min={createdFromDate || undefined}
                                className="border border-gray-300 rounded-md px-2 py-1 text-[11px] bg-white text-black"
                            />
                        </div>
                        {(createdFromDate || createdToDate) && (
                            <button
                                onClick={() => { setCreatedFromDate(''); setCreatedToDate(''); }}
                                className="px-2 py-1 text-[11px] text-white border border-white/40 rounded-md bg-white/10 hover:bg-white/20 flex items-center gap-1"
                            >
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                                Clear
                            </button>
                        )}
                        <input
                            type="text"
                            placeholder="Search customer, campaign, remark..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="border border-gray-300 rounded-lg px-2 py-1 text-xs w-64 bg-white focus:outline-none"
                        />
                        <button
                            onClick={onClose}
                            className="w-7 h-7 sm:w-8 sm:h-8 bg-white rounded-lg flex items-center justify-center transition-all duration-200 group flex-shrink-0"
                        >
                            <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-black group-hover:rotate-90 transition-transform duration-200"
                                fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>
                </div>

                <div className="flex-1 overflow-auto p-3">
                    {loading ? (
                        <div className="flex items-center justify-center py-10">
                            <div className="w-8 h-8 border-2 border-t-2 border-t-[#2f3192] border-gray-200 rounded-full animate-spin"></div>
                            <span className="ml-2 text-xs text-gray-600">Loading follow-ups...</span>
                        </div>
                    ) : filteredFollowups.length === 0 ? (
                        <div className="text-center py-10 text-xs text-gray-500">
                            No follow-ups found for this rejected reason.
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="min-w-[2000px] w-full border-collapse text-[11px]">
                                <thead className="bg-gray-100 sticky top-0 z-10">
                                    <tr>
                                        <th className="px-2 py-1.5 border border-gray-300 text-center font-semibold text-black whitespace-nowrap">S.No</th>
                                        <th className="px-2 py-1.5 border border-gray-300 text-center font-semibold text-black whitespace-nowrap">Follow-up Date</th>
                                        <th className="px-2 py-1.5 border border-gray-300 text-center font-semibold text-black whitespace-nowrap">Instance ID</th>
                                        <th className="px-2 py-1.5 border border-gray-300 text-center font-semibold text-black whitespace-nowrap">Customer Name</th>
                                        <th className="px-2 py-1.5 border border-gray-300 text-center font-semibold text-black whitespace-nowrap">Phone</th>
                                        <th className="px-2 py-1.5 border border-gray-300 text-center font-semibold text-black whitespace-nowrap">Email</th>
                                        <th className="px-2 py-1.5 border border-gray-300 text-center font-semibold text-black whitespace-nowrap">Branch</th>
                                        <th className="px-2 py-1.5 border border-gray-300 text-center font-semibold text-black whitespace-nowrap">Campaign</th>
                                        <th className="px-2 py-1.5 border border-gray-300 text-center font-semibold text-black whitespace-nowrap">Service</th>
                                        <th className="px-2 py-1.5 border border-gray-300 text-center font-semibold text-black whitespace-nowrap">Follow-up By</th>
                                        <th className="px-2 py-1.5 border border-gray-300 text-center font-semibold text-black whitespace-nowrap">Flag</th>
                                        <th className="px-2 py-1.5 border border-gray-300 text-center font-semibold text-black whitespace-nowrap">Status</th>
                                        <th className="px-2 py-1.5 border border-gray-300 text-center font-semibold text-black whitespace-nowrap">Next Follow-up</th>
                                        <th className="px-2 py-1.5 border border-gray-300 text-center font-semibold text-black whitespace-nowrap">Activity</th>
                                        <th className="px-2 py-1.5 border border-gray-300 text-center font-semibold text-black whitespace-nowrap">Reject Reason</th>
                                        <th className="px-2 py-1.5 border border-gray-300 text-center font-semibold text-black whitespace-nowrap">Remark</th>
                                        <th className="px-2 py-1.5 border border-gray-300 text-center font-semibold text-black whitespace-nowrap">Quote Sent</th>
                                        <th className="px-2 py-1.5 border border-gray-300 text-center font-semibold text-black whitespace-nowrap">Quote No.</th>
                                        <th className="px-2 py-1.5 border border-gray-300 text-center font-semibold text-black whitespace-nowrap">Quote Value</th>
                                        <th className="px-2 py-1.5 border border-gray-300 text-center font-semibold text-black whitespace-nowrap">Created At</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {filteredFollowups.map((fu, idx) => (
                                        <tr key={fu.id || idx} className="hover:bg-blue-50 transition-colors">
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
                                                <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-medium ${
                                                    fu.status === 'completed' ? 'bg-green-100 text-green-700' :
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
                        onClick={onClose}
                        className="px-3 py-1.5 border border-gray-300 rounded-lg text-xs font-medium hover:bg-white text-black"
                    >
                        Close
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
};

export default EmployeeRRModal;