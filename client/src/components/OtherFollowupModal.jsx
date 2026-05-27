import React, { useState, useEffect, useRef } from 'react';
import * as XLSX from 'xlsx';

const OtherFollowupModal = ({ isOpen, onClose, apiBaseUrl, userData }) => {
    const [customers, setCustomers] = useState([]);
    const [loading, setLoading] = useState(false);
    const [exportLoading, setExportLoading] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [totalCustomers, setTotalCustomers] = useState(0);

    const tableContainerRef = useRef(null);
    const topScrollBarRef = useRef(null);

    const themeColor = '#2f3192';

    useEffect(() => {
        if (isOpen) {
            fetchNonCampaignCustomers();
        }
    }, [isOpen]);

    const fetchNonCampaignCustomers = async () => {
        try {
            setLoading(true);
            const response = await fetch(`${apiBaseUrl}/performance/non-campaign-customers`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    user_id: userData.user_id || userData.id,
                    name: userData.name,
                    role: userData.role,
                    branch: userData.branch
                })
            });

            if (!response.ok) throw new Error('Failed to fetch non-campaign customers');

            const data = await response.json();
            setTotalCustomers(data.total_customers || 0);
            setCustomers(data.customers || []);
        } catch (error) {
            console.error('Error fetching non-campaign customers:', error);
        } finally {
            setLoading(false);
        }
    };

    const exportToExcel = () => {
        if (!customers.length) return;
        setExportLoading(true);

        const wsData = [];
        wsData.push(['NON-CAMPAIGN FOLLOWUP DATA']);
        wsData.push(['Total Unique Customers:', totalCustomers]);
        wsData.push([]);
        wsData.push([
            'S.No', 'Instance ID', 'Customer Name', 'Phone Number', 'Email',
            'Branch ID', 'Location', 'Service', 'Campaign Type', 'Followup By',
            'Last Status', 'Last Follow-up User', 'Last Follow-up User ID',
            'Last Follow-up Date', 'Next Follow-up Date',
            'Latest Flag', 'Latest Remark', 'Quotation Sent', 'Quotation Value'
        ]);

        filteredCustomers.forEach(customer => {
            wsData.push([
                customer.s_no,
                customer.instance_id,
                customer.customer_name,
                customer.phone_number,
                customer.email,
                customer.branch_id,
                customer.location,
                customer.service,
                customer.remark_type,
                customer.followup_by,
                customer.last_status,
                customer.last_followup_user_name,
                customer.last_followup_user_id,
                customer.last_followup_date ? new Date(customer.last_followup_date).toLocaleDateString() : 'N/A',
                customer.next_followup_date ? new Date(customer.next_followup_date).toLocaleDateString() : 'N/A',
                customer.latest_flag,
                customer.latest_remark,
                customer.quotation_sent ? 'Yes' : 'No',
                customer.quotation_value || 0
            ]);
        });

        const ws = XLSX.utils.aoa_to_sheet(wsData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Non Campaign Followups');

        ws['!cols'] = [
            { wch: 8 }, { wch: 18 }, { wch: 30 }, { wch: 15 }, { wch: 30 },
            { wch: 12 }, { wch: 25 }, { wch: 20 }, { wch: 15 }, { wch: 15 },
            { wch: 15 }, { wch: 20 }, { wch: 20 }, { wch: 20 }, { wch: 20 },
            { wch: 12 }, { wch: 40 }, { wch: 15 }, { wch: 15 }
        ];

        const filename = `non_campaign_followups_${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.xlsx`;
        XLSX.writeFile(wb, filename);
        setExportLoading(false);
    };

    const filteredCustomers = customers.filter(customer =>
        customer.customer_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        customer.instance_id?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        customer.phone_number?.includes(searchTerm) ||
        customer.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        customer.service?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    // Scroll sync
    useEffect(() => {
        const tableContainer = tableContainerRef.current;
        const topScrollBar = topScrollBarRef.current;
        if (!tableContainer || !topScrollBar) return;

        const updateTopScrollWidth = () => {
            const scrollWidth = tableContainer.scrollWidth;
            const clientWidth = tableContainer.clientWidth;
            if (scrollWidth > clientWidth) {
                topScrollBar.innerHTML = '';
                const spacer = document.createElement('div');
                spacer.style.width = `${scrollWidth}px`;
                spacer.style.height = '1px';
                topScrollBar.appendChild(spacer);
                topScrollBar.style.display = 'block';
            } else {
                topScrollBar.style.display = 'none';
            }
        };

        updateTopScrollWidth();

        const resizeObserver = new ResizeObserver(updateTopScrollWidth);
        resizeObserver.observe(tableContainer);

        const handleTableScroll = () => { topScrollBar.scrollLeft = tableContainer.scrollLeft; };
        const handleTopScroll = () => { tableContainer.scrollLeft = topScrollBar.scrollLeft; };

        tableContainer.addEventListener('scroll', handleTableScroll);
        topScrollBar.addEventListener('scroll', handleTopScroll);

        return () => {
            tableContainer.removeEventListener('scroll', handleTableScroll);
            topScrollBar.removeEventListener('scroll', handleTopScroll);
            resizeObserver.disconnect();
        };
    }, [customers, loading, filteredCustomers]);

    const highlightText = (text, searchTerm) => {
        if (!searchTerm || !text) return text;
        const regex = new RegExp(`(${searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
        const parts = String(text).split(regex);
        return parts.map((part, index) =>
            part.toLowerCase() === searchTerm.toLowerCase() ? (
                <mark key={index} className="text-black px-0.5 rounded" style={{ backgroundColor: '#ffdb62' }}>{part}</mark>
            ) : part
        );
    };

    const getStatusBadge = (status) => {
        const formattedStatus = status
            ? status.charAt(0).toUpperCase() + status.slice(1).toLowerCase()
            : status;
        return (
            <span className="inline-flex items-center justify-center gap-1 px-1.5 py-0.5 rounded-full text-[11px] font-medium text-black">
                {formattedStatus}
            </span>
        );
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 overflow-y-auto">
            <div className="flex items-center justify-center h-screen w-screen p-0">
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity" onClick={onClose}></div>

                <div className="relative w-screen h-screen max-w-none bg-white shadow-2xl overflow-hidden rounded-none">
                    {/* Header */}
                    <div className="relative px-3 sm:px-5 py-2 sm:py-3" style={{ background: `linear-gradient(135deg, ${themeColor} 0%, #2c4a6e 100%)` }}>
                        <div className="absolute top-0 right-0 w-48 sm:w-64 h-48 sm:h-64 bg-white/5 rounded-full -mr-24 sm:-mr-32 -mt-24 sm:-mt-32"></div>
                        <div className="absolute bottom-0 left-0 w-36 sm:w-48 h-36 sm:h-48 bg-white/5 rounded-full -ml-18 sm:-ml-24 -mb-18 sm:-mb-24"></div>

                        <div className="relative flex items-center justify-between gap-2">
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1.5 sm:gap-2 mb-0.5">
                                    <div className="w-6 h-6 sm:w-7 sm:h-7 bg-white/20 rounded-lg flex items-center justify-center backdrop-blur-sm flex-shrink-0">
                                        <svg className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                        </svg>
                                    </div>
                                    <h2 className="text-base sm:text-lg font-bold text-white tracking-tight truncate">
                                        Non-Campaign Followup Data
                                    </h2>
                                </div>
                                <div className="flex flex-wrap gap-1.5 sm:gap-2 text-white/80 text-[10px] sm:text-xs">
                                    <span className="flex items-center gap-0.5">
                                        <svg className="w-2 h-2 sm:w-2.5 sm:h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                                        </svg>
                                        {totalCustomers} Customers
                                    </span>
                                </div>
                            </div>
                            <button
                                onClick={onClose}
                                className="w-6 h-6 sm:w-7 sm:h-7 bg-white rounded-lg flex items-center justify-center transition-all duration-200 group flex-shrink-0"
                            >
                                <svg className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-black group-hover:rotate-90 transition-transform duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>
                    </div>

                    {/* Search and Export Bar */}
                    <div className="px-3 sm:px-5 py-2 border-b border-gray-200 bg-white flex flex-col sm:flex-row justify-between items-center gap-2">
                        <div className="relative w-full sm:w-72 md:w-80">
                            <input
                                type="text"
                                placeholder="Search by name, ID, phone, email, service..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="w-full pl-8 pr-7 py-1 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#2f3192]/20 focus:border-[#2f3192] transition-all text-black"
                            />
                            <svg className="absolute left-2.5 top-1/2 transform -translate-y-1/2 w-3 h-3 text-black" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                            </svg>
                            {searchTerm && (
                                <button
                                    onClick={() => setSearchTerm('')}
                                    className="absolute right-2 top-1/2 transform -translate-y-1/2 text-black hover:text-gray-600 focus:outline-none"
                                    type="button"
                                >
                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                </button>
                            )}
                        </div>

                        <button
                            onClick={exportToExcel}
                            disabled={exportLoading || customers.length === 0}
                            className="px-2.5 sm:px-3 py-1 bg-gradient-to-r from-green-600 to-green-700 text-white text-[11px] sm:text-xs font-medium rounded-lg hover:from-green-700 hover:to-green-800 transition-all flex items-center justify-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm w-full sm:w-auto"
                        >
                            {exportLoading ? (
                                <>
                                    <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                                    Exporting...
                                </>
                            ) : (
                                <>
                                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                                    </svg>
                                    Export
                                </>
                            )}
                        </button>
                    </div>

                    {/* Table Section */}
                    <div className="relative bg-gray-50">
                        {/* Top Scroll Bar */}
                        <div
                            ref={topScrollBarRef}
                            className="hidden sm:block sticky top-0 z-10 bg-gray-100 border-b border-gray-200 overflow-x-auto"
                            style={{ scrollbarWidth: 'thin', overflowY: 'hidden', height: '8px', cursor: 'pointer' }}
                        ></div>

                        {/* Table Container */}
                        <div
                            ref={tableContainerRef}
                            className="overflow-x-auto"
                            style={{ maxHeight: 'calc(100vh - 230px)', minHeight: '450px', overflowX: 'auto' }}
                        >
                            {loading ? (
                                <div className="flex flex-col items-center justify-center py-16">
                                    <div className="w-8 h-8 border-3 border-t-3 border-t-[#2f3192] border-gray-200 rounded-full animate-spin"></div>
                                    <p className="mt-2 text-[11px] text-black font-medium">Loading customers...</p>
                                </div>
                            ) : filteredCustomers.length > 0 ? (
                                <table className="w-full border-collapse" style={{ minWidth: '1600px' }}>
                                    <thead className="bg-gray-100 sticky top-0">
                                        <tr>
                                            <th className="px-2 py-1 text-center text-[11px] font-semibold text-black uppercase tracking-wider border border-gray-300">S.No</th>
                                            <th className="px-2 py-1 text-center text-[11px] font-semibold text-black uppercase tracking-wider border border-gray-300">Instance ID</th>
                                            <th className="px-2 py-1 text-center text-[11px] font-semibold text-black uppercase tracking-wider border border-gray-300">Customer Name</th>
                                            <th className="px-2 py-1 text-center text-[11px] font-semibold text-black uppercase tracking-wider border border-gray-300">Phone</th>
                                            <th className="px-2 py-1 text-center text-[11px] font-semibold text-black uppercase tracking-wider border border-gray-300">Email</th>
                                            <th className="px-2 py-1 text-center text-[11px] font-semibold text-black uppercase tracking-wider border border-gray-300">Branch</th>
                                            <th className="px-2 py-1 text-center text-[11px] font-semibold text-black uppercase tracking-wider border border-gray-300">Location</th>
                                            <th className="px-2 py-1 text-center text-[11px] font-semibold text-black uppercase tracking-wider border border-gray-300">Service</th>
                                            <th className="px-2 py-1 text-center text-[11px] font-semibold text-black uppercase tracking-wider border border-gray-300">Campaign Type</th>
                                            <th className="px-2 py-1 text-center text-[11px] font-semibold text-black uppercase tracking-wider border border-gray-300">Followup By</th>
                                            <th className="px-2 py-1 text-center text-[11px] font-semibold text-black uppercase tracking-wider border border-gray-300">Last Status</th>
                                            <th className="px-2 py-1 text-center text-[11px] font-semibold text-black uppercase tracking-wider border border-gray-300">Last User</th>
                                            <th className="px-2 py-1 text-center text-[11px] font-semibold text-black uppercase tracking-wider border border-gray-300">Last Follow-up</th>
                                            <th className="px-2 py-1 text-center text-[11px] font-semibold text-black uppercase tracking-wider border border-gray-300">Next Follow-up</th>
                                            <th className="px-2 py-1 text-center text-[11px] font-semibold text-black uppercase tracking-wider border border-gray-300">Flag</th>
                                            <th className="px-2 py-1 text-center text-[11px] font-semibold text-black uppercase tracking-wider border border-gray-300">Remark</th>
                                            <th className="px-2 py-1 text-center text-[11px] font-semibold text-black uppercase tracking-wider border border-gray-300">Quotation</th>
                                        </tr>
                                    </thead>
                                    <tbody className="bg-white">
                                        {filteredCustomers.map((customer, idx) => (
                                            <tr key={customer.instance_id || idx} className="hover:bg-gray-50 transition-colors duration-150">
                                                <td className="px-2 py-1 text-center text-[11px] text-black font-medium border border-gray-200">{idx + 1}</td>
                                                <td className="px-2 py-1 text-center text-[11px] font-mono text-black border border-gray-200">
                                                    {highlightText(customer.instance_id, searchTerm)}
                                                </td>
                                                <td className="px-2 py-1 text-center text-[11px] font-semibold text-black border border-gray-200">
                                                    {highlightText(customer.customer_name, searchTerm)}
                                                </td>
                                                <td className="px-2 py-1 text-center text-[11px] text-black border border-gray-200">
                                                    {highlightText(customer.phone_number, searchTerm)}
                                                </td>
                                                <td className="px-2 py-1 text-center text-[11px] text-black max-w-[180px] truncate border border-gray-200" title={customer.email}>
                                                    {highlightText(customer.email, searchTerm)}
                                                </td>
                                                <td className="px-2 py-1 text-center text-[11px] text-black border border-gray-200">
                                                    {customer.branch_id}
                                                </td>
                                                <td className="px-2 py-1 text-center text-[11px] text-black max-w-[180px] truncate border border-gray-200" title={customer.location}>
                                                    {customer.location}
                                                </td>
                                                <td className="px-2 py-1 text-center text-[11px] text-black border border-gray-200">
                                                    {highlightText(customer.service, searchTerm)}
                                                </td>
                                                <td className="px-2 py-1 text-center text-[11px] text-black border border-gray-200">
                                                    <span className="px-1.5 py-0.5 bg-gray-100 rounded text-[10px]">
                                                        {customer.remark_type}
                                                    </span>
                                                </td>
                                                <td className="px-2 py-1 text-center text-[11px] text-black border border-gray-200">
                                                    {customer.followup_by}
                                                </td>
                                                <td className="px-2 py-1 text-center border border-gray-200">
                                                    <div className="flex justify-center">{getStatusBadge(customer.last_status)}</div>
                                                </td>
                                                <td className="px-2 py-1 text-center border border-gray-200">
                                                    <div className="text-[11px] font-medium text-black">{customer.last_followup_user_name}</div>
                                                    <div className="text-[10px] text-black">{customer.last_followup_user_id}</div>
                                                </td>
                                                <td className="px-2 py-1 text-center text-[11px] text-black whitespace-nowrap border border-gray-200">
                                                    {customer.last_followup_date ? new Date(customer.last_followup_date).toLocaleDateString() : '—'}
                                                </td>
                                                <td className="px-2 py-1 text-center text-[11px] text-black whitespace-nowrap border border-gray-200">
                                                    {customer.next_followup_date ? new Date(customer.next_followup_date).toLocaleDateString() : '—'}
                                                </td>
                                                <td className="px-2 py-1 text-center border border-gray-200">
                                                    <span className="inline-flex items-center justify-center px-1.5 py-0.5 rounded-md text-[10px] font-bold text-black">
                                                        {customer.latest_flag}
                                                    </span>
                                                </td>
                                                <td className="px-2 py-1 text-center text-[11px] text-black max-w-[180px] truncate border border-gray-200" title={customer.latest_remark}>
                                                    {customer.latest_remark || '—'}
                                                </td>
                                                <td className="px-2 py-1 text-center text-[11px] border border-gray-200">
                                                    {customer.quotation_sent ? (
                                                        <span className="inline-flex items-center justify-center gap-0.5 text-green-700 font-semibold">
                                                            ₹{customer.quotation_value?.toLocaleString()}
                                                        </span>
                                                    ) : (
                                                        <span className="text-black">Not Sent</span>
                                                    )}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            ) : (
                                <div className="flex flex-col items-center justify-center py-16">
                                    <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mb-2">
                                        <svg className="w-6 h-6 text-black" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                        </svg>
                                    </div>
                                    <p className="text-black text-xs font-medium">No customers found</p>
                                    <p className="text-black text-[10px] mt-0.5">Try adjusting your search criteria</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default OtherFollowupModal;