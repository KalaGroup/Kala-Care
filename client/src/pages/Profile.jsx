import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import DeleteDataModal from '../components/DeleteDataModal';
import Swal from 'sweetalert2';
import {
    FaImage, FaEdit, FaTrash, FaSearch, FaUserPlus, FaSignOutAlt,
    FaUserCog, FaUserCircle, FaBuilding, FaIdCard,
    FaChevronDown, FaChevronUp, FaTimes, FaSave, FaPlus,
    FaUser, FaKey, FaUsers, FaUserTie, FaCog,
    FaCheckCircle, FaExclamationCircle, FaBan, FaFileExport, FaUpload,
    FaEye, FaEyeSlash, FaEllipsisV, FaCalendarAlt, FaPhone
} from 'react-icons/fa';
import { MdOutlineUpdate } from "react-icons/md";
import { CiImport } from "react-icons/ci";
import { MdOutlineFileDownload, MdOutlineFileUpload } from "react-icons/md";
import * as XLSX from 'xlsx';
import EmpQuery from '../components/EmpQuery';
import AdminQueries from '../components/AdminQueries';

const themeColor = '#2f3192';
const API_BASE_URL = import.meta.env.VITE_BACKEND_URL;
const MASTER_ADMIN_ID = import.meta.env.VITE_MASTER_ADMIN_ID;

// Helper function to get role display name
const getRoleDisplayName = (role) => {
    const roleMap = {
        'master_admin': 'Master Admin',
        'it_admin': 'IT Admin',
        'branch_admin': 'Branch Admin',
        'employee': 'Employee'
    };
    return roleMap[role] || role;
};

// Helper function to get role color
const getRoleColor = (role) => {
    const colorMap = {
        'master_admin': 'bg-purple-100 text-purple-800',
        'it_admin': 'bg-blue-100 text-blue-800',
        'branch_admin': 'bg-green-100 text-green-800',
        'employee': 'bg-gray-100 text-gray-700'
    };
    return colorMap[role] || 'bg-gray-100 text-gray-700';
};

// Predefined branch list for branch admin multi-branch access
const BRANCH_OPTIONS = {
    'HO': 'HO',
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

const CDBUpdateTable = ({ user, showToast }) => {
    const [editHistories, setEditHistories] = useState([]);
    const [filteredHistories, setFilteredHistories] = useState([]);
    const [loading, setLoading] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [dateFilter, setDateFilter] = useState('all');
    const [showDateDropdown, setShowDateDropdown] = useState(false);

    // Helper to highlight search term in text
    const highlightText = (text, search) => {
        if (!search || !text || text === '-') return text;
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

    // Helper function to format UTC date directly (no timezone conversion)
    const formatUTCDate = (utcDateString) => {
        if (!utcDateString) return '-';

        try {
            let date;

            if (typeof utcDateString === 'string' && utcDateString.includes(' +00:00')) {
                const dateTimePart = utcDateString.split(' +00:00')[0];
                const [datePart, timePart] = dateTimePart.split(' ');
                const [year, month, day] = datePart.split('-');
                const [hours, minutes, seconds] = timePart.split(':');

                date = new Date(Date.UTC(
                    parseInt(year),
                    parseInt(month) - 1,
                    parseInt(day),
                    parseInt(hours),
                    parseInt(minutes),
                    parseInt(seconds.split('.')[0])
                ));
            }
            else if (typeof utcDateString === 'string' && utcDateString.includes('Z')) {
                date = new Date(utcDateString);
            }
            else {
                date = new Date(utcDateString);
            }

            if (isNaN(date.getTime())) {
                return utcDateString;
            }

            const day = date.getUTCDate();
            const month = date.toLocaleString('en-IN', { month: 'short', timeZone: 'UTC' });
            const year = date.getUTCFullYear();
            const hours = date.getUTCHours().toString().padStart(2, '0');
            const minutes = date.getUTCMinutes().toString().padStart(2, '0');

            return `${day} ${month} ${year}, ${hours}:${minutes}`;
        } catch (error) {
            return utcDateString;
        }
    };

    const parseUTCDate = (utcDateString) => {
        if (!utcDateString) return null;

        try {
            let date;

            if (typeof utcDateString === 'string' && utcDateString.includes(' +00:00')) {
                const dateTimePart = utcDateString.split(' +00:00')[0];
                const [datePart, timePart] = dateTimePart.split(' ');
                const [year, month, day] = datePart.split('-');
                const [hours, minutes, seconds] = timePart.split(':');

                date = new Date(Date.UTC(
                    parseInt(year),
                    parseInt(month) - 1,
                    parseInt(day),
                    parseInt(hours),
                    parseInt(minutes),
                    parseInt(seconds.split('.')[0])
                ));
            }
            else if (typeof utcDateString === 'string' && utcDateString.includes('Z')) {
                date = new Date(utcDateString);
            }
            else {
                date = new Date(utcDateString);
            }

            if (isNaN(date.getTime())) return null;
            return date;
        } catch (error) {
            return null;
        }
    };

    const getCurrentUTCDate = () => {
        const now = new Date();
        return new Date(Date.UTC(
            now.getUTCFullYear(),
            now.getUTCMonth(),
            now.getUTCDate(),
            now.getUTCHours(),
            now.getUTCMinutes(),
            now.getUTCSeconds()
        ));
    };

    const fetchEditHistories = async () => {
        setLoading(true);
        try {
            const response = await axios.get(`${API_BASE_URL}/v1/edit-customer/edited-customers`, {
                headers: { 'user-id': user.user_id }
            });

            if (response.data) {
                const flattenedData = [];
                response.data.forEach(customer => {
                    customer.edit_history.forEach(edit => {
                        flattenedData.push({
                            id: edit.id,
                            customer_id: customer.original_customer.id,
                            instance_id: customer.original_customer.instance_id || '-',
                            original_customer_name: customer.original_customer.customer_name || '-',
                            original_phone_number: customer.original_customer.phone_number || '-',
                            original_email: customer.original_customer.email || '-',
                            original_location: customer.original_customer.location || '-',
                            edited_customer_name: edit.edited_data.customer_name || '-',
                            edited_phone_number: edit.edited_data.phone_number || '-',
                            edited_email: edit.edited_data.email || '-',
                            edited_location: edit.edited_data.location || '-',
                            user_id: edit.user_id,
                            user_name: edit.user_name || '-',
                            edited_at: edit.edited_at,
                            edit_count: edit.edit_count
                        });
                    });
                });

                setEditHistories(flattenedData);
                applyDateFilter(flattenedData, dateFilter);
            }
        } catch (err) {
            showToast('error', err.response?.data?.detail || 'Failed to fetch edit histories');
        } finally {
            setLoading(false);
        }
    };

    const applyDateFilter = (data, filterType) => {
        const nowUTC = getCurrentUTCDate();
        let filteredData = [...data];

        switch (filterType) {
            case 'last10days':
                const tenDaysAgo = new Date(nowUTC);
                tenDaysAgo.setUTCDate(tenDaysAgo.getUTCDate() - 10);
                tenDaysAgo.setUTCHours(0, 0, 0, 0);
                filteredData = data.filter(item => {
                    const editedDate = parseUTCDate(item.edited_at);
                    return editedDate && editedDate >= tenDaysAgo;
                });
                break;
            case '1month':
                const oneMonthAgo = new Date(nowUTC);
                oneMonthAgo.setUTCMonth(oneMonthAgo.getUTCMonth() - 1);
                oneMonthAgo.setUTCHours(0, 0, 0, 0);
                filteredData = data.filter(item => {
                    const editedDate = parseUTCDate(item.edited_at);
                    return editedDate && editedDate >= oneMonthAgo;
                });
                break;
            case '3months':
                const threeMonthsAgo = new Date(nowUTC);
                threeMonthsAgo.setUTCMonth(threeMonthsAgo.getUTCMonth() - 3);
                threeMonthsAgo.setUTCHours(0, 0, 0, 0);
                filteredData = data.filter(item => {
                    const editedDate = parseUTCDate(item.edited_at);
                    return editedDate && editedDate >= threeMonthsAgo;
                });
                break;
            case '6months':
                const sixMonthsAgo = new Date(nowUTC);
                sixMonthsAgo.setUTCMonth(sixMonthsAgo.getUTCMonth() - 6);
                sixMonthsAgo.setUTCHours(0, 0, 0, 0);
                filteredData = data.filter(item => {
                    const editedDate = parseUTCDate(item.edited_at);
                    return editedDate && editedDate >= sixMonthsAgo;
                });
                break;
            case '1year':
                const oneYearAgo = new Date(nowUTC);
                oneYearAgo.setUTCFullYear(oneYearAgo.getUTCFullYear() - 1);
                oneYearAgo.setUTCHours(0, 0, 0, 0);
                filteredData = data.filter(item => {
                    const editedDate = parseUTCDate(item.edited_at);
                    return editedDate && editedDate >= oneYearAgo;
                });
                break;
            default:
                break;
        }

        setFilteredHistories(filteredData);
    };

    useEffect(() => {
        if (user) {
            fetchEditHistories();
        }
    }, [user]);

    useEffect(() => {
        const topScrollbar = document.getElementById('cdb-top-scrollbar');
        const tableContainer = document.getElementById('cdb-table-container');
        const table = tableContainer?.querySelector('table');

        if (topScrollbar && tableContainer && table) {

            const spacer = topScrollbar.firstElementChild;

            const updateWidth = () => {
                spacer.style.width = table.scrollWidth + "px";
            };

            const syncScroll = () => {
                topScrollbar.scrollLeft = tableContainer.scrollLeft;
            };

            const syncTopScroll = () => {
                tableContainer.scrollLeft = topScrollbar.scrollLeft;
            };

            updateWidth();

            tableContainer.addEventListener('scroll', syncScroll);
            topScrollbar.addEventListener('scroll', syncTopScroll);

            window.addEventListener('resize', updateWidth);

            return () => {
                tableContainer.removeEventListener('scroll', syncScroll);
                topScrollbar.removeEventListener('scroll', syncTopScroll);
                window.removeEventListener('resize', updateWidth);
            };
        }
    }, [filteredHistories]);

    useEffect(() => {
        if (editHistories.length > 0) {
            let filtered = [...editHistories];
            const nowUTC = getCurrentUTCDate();

            switch (dateFilter) {
                case 'last10days':
                    const tenDaysAgo = new Date(nowUTC);
                    tenDaysAgo.setUTCDate(tenDaysAgo.getUTCDate() - 10);
                    tenDaysAgo.setUTCHours(0, 0, 0, 0);
                    filtered = filtered.filter(item => {
                        const editedDate = parseUTCDate(item.edited_at);
                        return editedDate && editedDate >= tenDaysAgo;
                    });
                    break;
                case '1month':
                    const oneMonthAgo = new Date(nowUTC);
                    oneMonthAgo.setUTCMonth(oneMonthAgo.getUTCMonth() - 1);
                    oneMonthAgo.setUTCHours(0, 0, 0, 0);
                    filtered = filtered.filter(item => {
                        const editedDate = parseUTCDate(item.edited_at);
                        return editedDate && editedDate >= oneMonthAgo;
                    });
                    break;
                case '3months':
                    const threeMonthsAgo = new Date(nowUTC);
                    threeMonthsAgo.setUTCMonth(threeMonthsAgo.getUTCMonth() - 3);
                    threeMonthsAgo.setUTCHours(0, 0, 0, 0);
                    filtered = filtered.filter(item => {
                        const editedDate = parseUTCDate(item.edited_at);
                        return editedDate && editedDate >= threeMonthsAgo;
                    });
                    break;
                case '6months':
                    const sixMonthsAgo = new Date(nowUTC);
                    sixMonthsAgo.setUTCMonth(sixMonthsAgo.getUTCMonth() - 6);
                    sixMonthsAgo.setUTCHours(0, 0, 0, 0);
                    filtered = filtered.filter(item => {
                        const editedDate = parseUTCDate(item.edited_at);
                        return editedDate && editedDate >= sixMonthsAgo;
                    });
                    break;
                case '1year':
                    const oneYearAgo = new Date(nowUTC);
                    oneYearAgo.setUTCFullYear(oneYearAgo.getUTCFullYear() - 1);
                    oneYearAgo.setUTCHours(0, 0, 0, 0);
                    filtered = filtered.filter(item => {
                        const editedDate = parseUTCDate(item.edited_at);
                        return editedDate && editedDate >= oneYearAgo;
                    });
                    break;
                default:
                    break;
            }

            if (searchTerm) {
                filtered = filtered.filter(history =>
                    history.instance_id?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                    history.original_customer_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                    history.edited_customer_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                    history.user_name?.toLowerCase().includes(searchTerm.toLowerCase())
                );
            }

            setFilteredHistories(filtered);
        }
    }, [searchTerm, dateFilter, editHistories]);

    const exportToExcel = () => {
        try {
            const exportData = filteredHistories.map((history, idx) => ({
                'Serial No.': idx + 1,
                'Instance ID': history.instance_id,
                'Original Name': history.original_customer_name,
                'Original Phone': history.original_phone_number,
                'Original Email': history.original_email,
                'Original Location': history.original_location,
                'Edited Name': history.edited_customer_name,
                'Edited Phone': history.edited_phone_number,
                'Edited Email': history.edited_email,
                'Edited Location': history.edited_location,
                'Edited By': history.user_name,
                'Edited By ID': history.user_id,
                'Edited At': formatUTCDate(history.edited_at)
            }));

            const ws = XLSX.utils.json_to_sheet(exportData);
            const colWidths = [];
            const headers = Object.keys(exportData[0] || {});
            headers.forEach(header => {
                let maxLength = header.length;
                exportData.forEach(row => {
                    const value = String(row[header] || '');
                    maxLength = Math.max(maxLength, value.length);
                });
                colWidths.push({ wch: Math.min(maxLength + 2, 50) });
            });
            ws['!cols'] = colWidths;

            const wb = XLSX.utils.book_new();
            let sheetName = 'CDB Update History';
            if (dateFilter !== 'all') {
                const filterMap = {
                    'last10days': 'Last 10 Days',
                    '1month': 'Last 1 Month',
                    '3months': 'Last 3 Months',
                    '6months': 'Last 6 Months',
                    '1year': 'Last 1 Year'
                };
                sheetName = `CDB Update - ${filterMap[dateFilter]}`;
            }
            XLSX.utils.book_append_sheet(wb, ws, sheetName);
            const fileName = `cdb_update_history_${new Date().toISOString().split('T')[0]}_${dateFilter}.xlsx`;
            XLSX.writeFile(wb, fileName);
            showToast('success', 'CDB Update history exported successfully');
        } catch (err) {
            console.error('Export error:', err);
            showToast('error', 'Failed to export CDB Update history');
        }
    };

    const getDateFilterLabel = () => {
        const filterMap = {
            'all': 'All Data',
            'last10days': 'Last 10 Days',
            '1month': 'Last 1 Month',
            '3months': 'Last 3 Months',
            '6months': 'Last 6 Months',
            '1year': 'Last 1 Year'
        };
        return filterMap[dateFilter] || 'All Data';
    };

    // Calculate total table width
    const calculateTableWidth = () => {
        const columnWidths = {
            sno: 70,
            instanceId: 140,
            originalName: 160,
            originalPhone: 130,
            originalEmail: 180,
            originalLocation: 160,
            editedName: 160,
            editedPhone: 130,
            editedEmail: 180,
            editedLocation: 160,
            editedBy: 160,
            editedAt: 150
        };
        return Object.values(columnWidths).reduce((sum, width) => sum + width, 0);
    };

    return (
        <div className="space-y-3">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 mb-3">
                <div>
                    <h3 className="text-sm sm:text-base font-semibold text-black flex items-center space-x-2">
                        <span>CDB Update History</span>
                        <span className="text-xs bg-gray-100 text-black px-2 py-0.5 rounded-full">
                            {filteredHistories.length} records ({getDateFilterLabel()})
                        </span>
                    </h3>
                </div>

                <div className="flex items-center gap-2 w-full sm:w-auto flex-wrap">
                    <div className="relative">
                        <button
                            onClick={() => setShowDateDropdown(!showDateDropdown)}
                            className="flex items-center space-x-1 bg-white border border-gray-300 hover:bg-gray-50 px-2.5 py-1.5 rounded-lg text-xs transition-all"
                        >
                            <span className="text-xs">{getDateFilterLabel()}</span>
                            {showDateDropdown ? <FaChevronUp className="text-xs" /> : <FaChevronDown className="text-xs" />}
                        </button>

                        {showDateDropdown && (
                            <div className="absolute right-0 mt-1 w-48 bg-white rounded-lg shadow-xl border border-gray-100 py-1 z-20">
                                <button
                                    onClick={() => {
                                        setDateFilter('all');
                                        setShowDateDropdown(false);
                                    }}
                                    className={`w-full px-3 py-1.5 text-left text-xs hover:bg-gray-50 transition-colors ${dateFilter === 'all' ? 'text-[#2f3192] bg-[#2f3192]/10' : 'text-black'}`}
                                >
                                    All Data
                                </button>
                                <button
                                    onClick={() => {
                                        setDateFilter('last10days');
                                        setShowDateDropdown(false);
                                    }}
                                    className={`w-full px-3 py-1.5 text-left text-xs hover:bg-gray-50 transition-colors ${dateFilter === 'last10days' ? 'text-[#2f3192] bg-[#2f3192]/10' : 'text-black'}`}
                                >
                                    Last 10 Days
                                </button>
                                <button
                                    onClick={() => {
                                        setDateFilter('1month');
                                        setShowDateDropdown(false);
                                    }}
                                    className={`w-full px-3 py-1.5 text-left text-xs hover:bg-gray-50 transition-colors ${dateFilter === '1month' ? 'text-[#2f3192] bg-[#2f3192]/10' : 'text-black'}`}
                                >
                                    Last 1 Month
                                </button>
                                <button
                                    onClick={() => {
                                        setDateFilter('3months');
                                        setShowDateDropdown(false);
                                    }}
                                    className={`w-full px-3 py-1.5 text-left text-xs hover:bg-gray-50 transition-colors ${dateFilter === '3months' ? 'text-[#2f3192] bg-[#2f3192]/10' : 'text-black'}`}
                                >
                                    Last 3 Months
                                </button>
                                <button
                                    onClick={() => {
                                        setDateFilter('6months');
                                        setShowDateDropdown(false);
                                    }}
                                    className={`w-full px-3 py-1.5 text-left text-xs hover:bg-gray-50 transition-colors ${dateFilter === '6months' ? 'text-[#2f3192] bg-[#2f3192]/10' : 'text-black'}`}
                                >
                                    Last 6 Months
                                </button>
                                <button
                                    onClick={() => {
                                        setDateFilter('1year');
                                        setShowDateDropdown(false);
                                    }}
                                    className={`w-full px-3 py-1.5 text-left text-xs hover:bg-gray-50 transition-colors ${dateFilter === '1year' ? 'text-[#2f3192] bg-[#2f3192]/10' : 'text-black'}`}
                                >
                                    Last 1 Year
                                </button>
                            </div>
                        )}
                    </div>

                    <div className="relative flex-1 sm:w-64">
                        <FaSearch className="absolute left-2.5 top-1/2 transform -translate-y-1/2 text-black text-xs" />
                        <input
                            type="text"
                            placeholder="Search..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full pl-8 pr-7 py-1.5 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#2f3192] focus:border-transparent text-black"
                        />
                        {searchTerm && (
                            <button
                                onClick={() => setSearchTerm('')}
                                className="absolute right-2.5 top-1/2 transform -translate-y-1/2 text-black hover:text-gray-600"
                            >
                                <FaTimes className="text-xs" />
                            </button>
                        )}
                    </div>

                    <button
                        onClick={exportToExcel}
                        className="flex items-center justify-center space-x-1 bg-green-500 hover:bg-green-600 text-white px-2.5 py-1.5 rounded-lg text-xs transition-all shadow-sm hover:shadow flex-shrink-0"
                    >
                        <MdOutlineFileUpload className="text-xs" />
                        <span>Export</span>
                    </button>
                </div>
            </div>

            {loading ? (
                <div className="text-center py-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#2f3192] mx-auto"></div>
                    <p className="mt-2 text-xs text-black">Loading CDB Update history...</p>
                </div>
            ) : filteredHistories.length === 0 ? (
                <div className="text-center py-8 bg-gray-50 rounded-lg">
                    <p className="text-xs text-black">No CDB Update history found for the selected period</p>
                </div>
            ) : (
                <div className="border border-gray-200 rounded-lg">
                    {/* Horizontal scroll bar at top */}
                    <div
                        id="cdb-top-scrollbar"
                        className="sticky top-0 z-10 bg-gray-50 border-b border-gray-200 overflow-x-auto"
                        style={{
                            overflowX: 'auto',
                            overflowY: 'hidden',
                            scrollbarWidth: 'thin'
                        }}
                    >
                        <div style={{ height: '1px' }}></div>
                    </div>

                    {/* Table container */}
                    <div
                        className="overflow-auto max-h-[70vh]"
                        id="cdb-table-container"
                        style={{
                            overflow: 'auto',
                            scrollbarWidth: 'thin'
                        }}
                    >
                        <table className="border-collapse" style={{ minWidth: '100%', width: 'max-content' }}>
                            <thead className="bg-gray-50 sticky top-0 z-10">
                                <tr>
                                    <th className="px-2 py-1 text-center text-xs font-medium text-black uppercase tracking-wider whitespace-nowrap border-r border-gray-200">S.No</th>
                                    <th className="px-2 py-1 text-center text-xs font-medium text-black uppercase tracking-wider whitespace-nowrap border-r border-gray-200">Instance ID</th>
                                    <th className="px-2 py-1 text-center text-xs font-medium text-black uppercase tracking-wider whitespace-nowrap border-r border-gray-200">Original Name</th>
                                    <th className="px-2 py-1 text-center text-xs font-medium text-black uppercase tracking-wider whitespace-nowrap border-r border-gray-200">Original Phone</th>
                                    <th className="px-2 py-1 text-center text-xs font-medium text-black uppercase tracking-wider whitespace-nowrap border-r border-gray-200">Original Email</th>
                                    <th className="px-2 py-1 text-center text-xs font-medium text-black uppercase tracking-wider whitespace-nowrap border-r border-gray-200">Original Location</th>
                                    <th className="px-2 py-1 text-center text-xs font-medium text-black uppercase tracking-wider whitespace-nowrap border-r border-gray-200">Edited Name</th>
                                    <th className="px-2 py-1 text-center text-xs font-medium text-black uppercase tracking-wider whitespace-nowrap border-r border-gray-200">Edited Phone</th>
                                    <th className="px-2 py-1 text-center text-xs font-medium text-black uppercase tracking-wider whitespace-nowrap border-r border-gray-200">Edited Email</th>
                                    <th className="px-2 py-1 text-center text-xs font-medium text-black uppercase tracking-wider whitespace-nowrap border-r border-gray-200">Edited Location</th>
                                    <th className="px-2 py-1 text-center text-xs font-medium text-black uppercase tracking-wider whitespace-nowrap border-r border-gray-200">Edited By</th>
                                    <th className="px-2 py-1 text-center text-xs font-medium text-black uppercase tracking-wider whitespace-nowrap">Edited At</th>
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                                {filteredHistories.map((history, idx) => (
                                    <tr key={history.id} className="hover:bg-gray-50 transition-colors">
                                        <td className="px-2 py-1 text-center text-xs text-black border-r border-gray-200 whitespace-nowrap">{idx + 1}</td>
                                        <td className="px-2 py-1 text-center text-xs text-black border-r border-gray-200 whitespace-nowrap">{highlightText(history.instance_id, searchTerm)}</td>
                                        <td className="px-2 py-1 text-left text-xs text-black border-r border-gray-200 whitespace-nowrap">{highlightText(history.original_customer_name, searchTerm)}</td>
                                        <td className="px-2 py-1 text-center text-xs text-black border-r border-gray-200 whitespace-nowrap">{history.original_phone_number}</td>
                                        <td className="px-2 py-1 text-left text-xs text-black border-r border-gray-200 whitespace-nowrap">{history.original_email}</td>
                                        <td className="px-2 py-1 text-left text-xs text-black border-r border-gray-200 whitespace-nowrap">{history.original_location}</td>
                                        <td className="px-2 py-1 text-left text-xs text-black border-r border-gray-200 whitespace-nowrap">{highlightText(history.edited_customer_name, searchTerm)}</td>
                                        <td className="px-2 py-1 text-center text-xs text-black border-r border-gray-200 whitespace-nowrap">{history.edited_phone_number}</td>
                                        <td className="px-2 py-1 text-left text-xs text-black border-r border-gray-200 whitespace-nowrap">{history.edited_email}</td>
                                        <td className="px-2 py-1 text-left text-xs text-black border-r border-gray-200 whitespace-nowrap">{history.edited_location}</td>
                                        <td className="px-2 py-1 text-center text-xs text-black border-r border-gray-200 whitespace-nowrap">
                                            {highlightText(history.user_name, searchTerm)}
                                            <span className="text-gray-400 text-[10px] block">{history.user_id}</span>
                                        </td>
                                        <td className="px-2 py-1 text-center text-xs text-black whitespace-nowrap">{formatUTCDate(history.edited_at)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
};

// Profile Component
const Profile = () => {
    const [user, setUser] = useState(null);
    const [employees, setEmployees] = useState([]);
    const [filteredEmployees, setFilteredEmployees] = useState([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [showAddModal, setShowAddModal] = useState(false);
    const [editingUser, setEditingUser] = useState(null);
    const [showSettings, setShowSettings] = useState(false);
    const [showProfileEdit, setShowProfileEdit] = useState(false);
    const [toast, setToast] = useState({ show: false, type: '', message: '' });
    const [showImportModal, setShowImportModal] = useState(false);
    const [importFile, setImportFile] = useState(null);
    const [importing, setImporting] = useState(false);
    const [importErrors, setImportErrors] = useState([]);
    const [activeAdminTab, setActiveAdminTab] = useState('employees');
    const [unresolvedQueryCount, setUnresolvedQueryCount] = useState(0);
    const [hasShownUnresolvedToast, setHasShownUnresolvedToast] = useState(false);
    const [showQueryCount, setShowQueryCount] = useState(false);
    const [employeeCount, setEmployeeCount] = useState(0);
    const [visibleEmployeeCount, setVisibleEmployeeCount] = useState(50);
    const employeeLoadMoreRef = React.useRef(null); const [previewData, setPreviewData] = useState([]);
    const [showDeleteDataModal, setShowDeleteDataModal] = useState(false);
    const [editingUserBranches, setEditingUserBranches] = useState([]);
    const [newBranchInput, setNewBranchInput] = useState({ branch: '', branch_name: '' });
    const [formData, setFormData] = useState({
        name: '',
        user_id: '',
        branch: '',
        branch_name: '',
        mobile_number: '',
        password: '',
        role: 'employee'
    });

    const [editProfileData, setEditProfileData] = useState({
        name: '',
        branch: '',
        branch_name: '',
        password: ''
    });
    const [loading, setLoading] = useState(false);
    const [profileLoaded, setProfileLoaded] = useState(false);
    const navigate = useNavigate();
    const [showPassword, setShowPassword] = useState({
        add: false,
        edit: false,
        profile: false
    });
    const [showBannerModal, setShowBannerModal] = useState(false);
    const [banners, setBanners] = useState([]);
    const [bannerFiles, setBannerFiles] = useState({
        banner1: null,
        banner2: null,
        banner3: null
    });
    const [bannerPreviews, setBannerPreviews] = useState({
        banner1: '',
        banner2: '',
        banner3: ''
    });
    const [uploadingBanner, setUploadingBanner] = useState(false);
    const [showActionDropdown, setShowActionDropdown] = useState(null);

    // Role checks
    const isMasterAdmin = user && user.role === 'master_admin';
    const isITAdmin = user && user.role === 'it_admin';
    const isBranchAdmin = user && user.role === 'branch_admin';
    const isEmployee = user && user.role === 'employee';

    const canDeleteEmployee = isMasterAdmin || isITAdmin;
    const canGrantExport = isMasterAdmin || isITAdmin;
    const canGrantExpense = isMasterAdmin || isITAdmin;
    const canViewCDBUpdate = isMasterAdmin || isITAdmin;
    const RESTRICTED_USER_IDS = ['31240001', '31250001'];
    const isRestrictedUser = user && RESTRICTED_USER_IDS.includes(String(user.user_id));

    // Helper to highlight search term in text
    const highlightText = (text, search) => {
        if (!search || !text || text === '-') return text;
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

    const showToast = (type, message) => {
        setToast({ show: true, type, message });
        setTimeout(() => {
            setToast({ show: false, type: '', message: '' });
        }, 3000);
    };

    const hideToast = () => {
        setToast({ show: false, type: '', message: '' });
    };

    useEffect(() => {
        const userData = sessionStorage.getItem('user');
        if (!userData) {
            navigate('/');
            return;
        }
        const parsedUser = JSON.parse(userData);
        setUser(parsedUser);
    }, [navigate]);

    useEffect(() => {
        if (user && !profileLoaded) {
            fetchUserProfile();
        }
    }, [user, profileLoaded]);

    useEffect(() => {
        if (user && (isMasterAdmin || isITAdmin || isBranchAdmin)) {
            fetchEmployees();
        }
    }, [user]);

    useEffect(() => {
        if (employees && employees.length > 0) {
            if (searchTerm) {
                const filtered = employees.filter(emp =>
                    emp.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                    emp.user_id?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                    emp.branch?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                    emp.branch_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                    emp.mobile_number?.toLowerCase().includes(searchTerm.toLowerCase())
                );
                setFilteredEmployees(filtered);
            } else {
                setFilteredEmployees(employees);
            }
        } else {
            setFilteredEmployees([]);
        }
    }, [searchTerm, employees]);

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (showSettings && !event.target.closest('.settings-dropdown')) {
                setShowSettings(false);
            }
            if (showActionDropdown && !event.target.closest('.action-dropdown')) {
                setShowActionDropdown(null);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [showSettings, showActionDropdown]);

    useEffect(() => {
        if (activeAdminTab === 'queries') {
            removeDotFromQueriesTab();
        }
    }, [activeAdminTab]);

    useEffect(() => {
        return () => {
            setHasShownUnresolvedToast(false);
        };
    }, []);

    // Add this useEffect near the other useEffect hooks
    useEffect(() => {
        const topScrollbar = document.getElementById('employees-top-scrollbar');
        const tableContainer = document.getElementById('employees-table-container');

        if (topScrollbar && tableContainer) {
            const syncScroll = () => {
                if (topScrollbar.scrollLeft !== tableContainer.scrollLeft) {
                    topScrollbar.scrollLeft = tableContainer.scrollLeft;
                }
            };

            const syncTopScroll = () => {
                if (tableContainer.scrollLeft !== topScrollbar.scrollLeft) {
                    tableContainer.scrollLeft = topScrollbar.scrollLeft;
                }
            };

            tableContainer.addEventListener('scroll', syncScroll);
            topScrollbar.addEventListener('scroll', syncTopScroll);

            return () => {
                tableContainer.removeEventListener('scroll', syncScroll);
                topScrollbar.removeEventListener('scroll', syncTopScroll);
            };
        }
    }, [filteredEmployees]); // Re-run when filteredEmployees changes

    // Lazy load more employees when scrolled to bottom
    useEffect(() => {
        const observer = new IntersectionObserver(
            (entries) => {
                if (entries[0].isIntersecting && visibleEmployeeCount < filteredEmployees.length) {
                    setVisibleEmployeeCount(prev => Math.min(prev + 50, filteredEmployees.length));
                }
            },
            { threshold: 0.1 }
        );
        if (employeeLoadMoreRef.current) observer.observe(employeeLoadMoreRef.current);
        return () => observer.disconnect();
    }, [visibleEmployeeCount, filteredEmployees.length]);

    // Reset visible count when search changes
    useEffect(() => {
        setVisibleEmployeeCount(50);
    }, [searchTerm]);

    const fetchUserProfile = async () => {
        try {
            const response = await axios.get(`${API_BASE_URL}/users/profile`, {
                headers: { 'user-id': user.user_id }
            });
            if (response.data.success) {
                // Preserve branches + active branch from sessionStorage
                // (profile endpoint doesn't return them)
                const stored = JSON.parse(sessionStorage.getItem('user') || '{}');
                const merged = {
                    ...response.data.user,
                    branches: stored.branches || [],
                    branch: stored.branch || response.data.user.branch,
                    branch_name: stored.branch_name || response.data.user.branch_name,
                    primary_branch: stored.primary_branch,
                    primary_branch_name: stored.primary_branch_name
                };
                setUser(merged);
                sessionStorage.setItem('user', JSON.stringify(merged));
                setProfileLoaded(true);
            }
        } catch (err) {
            console.error('Error fetching profile:', err);
            setProfileLoaded(true);
        }
    };

    const fetchEmployees = async () => {
        setLoading(true);
        try {
            const response = await axios.get(`${API_BASE_URL}/users/employees`, {
                headers: { 'user-id': user.user_id }
            });

            if (response.data.success && response.data.employees) {
                let employeesData = response.data.employees;

                const visibleEmployees = employeesData.filter(e => e.user_id !== 'kala000001');

                setEmployees(employeesData);
                setFilteredEmployees(employeesData);
                setEmployeeCount(visibleEmployees.length);
            } else {
                setEmployees([]);
                setFilteredEmployees([]);
                setEmployeeCount(0);
            }
        } catch (err) {
            if (err.response?.status === 403) {
                setEmployees([]);
                setFilteredEmployees([]);
                setEmployeeCount(0);
            } else {
                console.error('Error fetching employees:', err);
            }
        } finally {
            setLoading(false);
        }
    };

    const handleLogout = () => {
        Swal.fire({
            title: 'Logout',
            text: 'Are you sure you want to logout?',
            icon: 'question',
            showCancelButton: true,
            confirmButtonColor: '#2f3192',
            cancelButtonColor: '#d33',
            confirmButtonText: 'Yes, logout',
            cancelButtonText: 'Cancel'
        }).then((result) => {
            if (result.isConfirmed) {
                sessionStorage.removeItem('user');
                showToast('success', 'Logged out successfully');
                setTimeout(() => {
                    navigate('/');
                }, 1000);
            }
        });
    };

    const handleAddEmployee = async (e) => {
        e.preventDefault();
        setLoading(true);

        try {
            const response = await axios.post(`${API_BASE_URL}/users/employees`, formData, {
                headers: { 'user-id': user.user_id }
            });

            if (response.data.success) {
                Swal.fire({
                    title: 'Success!',
                    text: 'Employee added successfully!',
                    icon: 'success',
                    confirmButtonColor: '#2f3192',
                    timer: 2000
                });
                setShowAddModal(false);
                setFormData({ name: '', user_id: '', branch: '', branch_name: '', mobile_number: '', password: '', role: 'employee' });
                fetchEmployees();
            }
        } catch (err) {
            Swal.fire({
                title: 'Error!',
                text: err.response?.data?.detail || err.response?.data?.message || 'Failed to add employee',
                icon: 'error',
                confirmButtonColor: '#2f3192'
            });
        } finally {
            setLoading(false);
        }
    };

    const handleImportFileChange = (e) => {
        const file = e.target.files[0];

        if (file) {
            const validTypes = [
                'application/vnd.ms-excel',
                'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                'text/csv'
            ];

            if (!validTypes.includes(file.type) && !file.name.match(/\.(xlsx|xls|csv)$/)) {
                showToast('error', 'Please upload only Excel or CSV files');
                return;
            }

            setImportFile(file);
            setImportErrors([]);

            const reader = new FileReader();

            reader.onload = (event) => {
                const data = new Uint8Array(event.target.result);
                const workbook = XLSX.read(data, { type: "array" });

                const sheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[sheetName];

                const json = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

                const previewRows = json.slice(0, 6);
                setPreviewData(previewRows);

                // ✅ Validate required fields: ECode, Branch Code, Password
                const dataRows = json.slice(1).filter(row => row.some(cell => cell !== undefined && cell !== ''));
                const errors = [];

                dataRows.forEach((row, rowIndex) => {
                    const actualRow = rowIndex + 2; // +2 because slice(1) and 1-indexed
                    const eCode = row[0];
                    const branchCode = row[2];
                    const password = row[4]; // adjust index based on your column order

                    if (!eCode || String(eCode).trim() === '') {
                        errors.push(`Row ${actualRow}: ECode is missing`);
                    }
                    if (!branchCode || String(branchCode).trim() === '') {
                        errors.push(`Row ${actualRow}: Branch Code is missing`);
                    }
                    if (!password || String(password).trim() === '') {
                        errors.push(`Row ${actualRow}: Password is missing`);
                    }
                });

                if (errors.length > 0) {
                    setImportErrors(errors);
                    setImportFile(null); // block import
                }
            };

            reader.readAsArrayBuffer(file);
        }
    };

    const processImportFile = async () => {
        if (!importFile) {
            showToast('error', 'Please select a file to import');
            return;
        }

        // ✅ Block if there are validation errors from file parsing
        if (importErrors.length > 0) {
            showToast('error', 'Fix the errors in the file before importing');
            return;
        }

        if (!importFile) {
            showToast('error', 'Please select a file to import');
            return;
        }

        setImporting(true);
        setImportErrors([]);

        const formData = new FormData();
        formData.append('file', importFile);

        try {
            const response = await axios.post(
                `${API_BASE_URL}/users/employees/bulk-import`,
                formData,
                {
                    headers: {
                        'Content-Type': 'multipart/form-data',
                        'user-id': user.user_id
                    }
                }
            );

            if (response.data.success) {
                let message = response.data.message;
                if (response.data.created_count > 0 || response.data.updated_count > 0) {
                    Swal.fire({
                        title: 'Success!',
                        html: `
                        <div class="text-left">
                            <p class="mb-2">${message}</p>
                            <div class="mt-3 space-y-1">
                                <p class="text-green-600">✓ New Employees: ${response.data.created_count}</p>
                                <p class="text-blue-600">⟳ Updated Employees: ${response.data.updated_count}</p>
                                ${response.data.error_count > 0 ? `<p class="text-red-600">✗ Errors: ${response.data.error_count}</p>` : ''}
                            </div>
                        </div>
                    `,
                        icon: 'success',
                        confirmButtonColor: '#2f3192'
                    });
                } else {
                    Swal.fire({
                        title: 'Warning!',
                        text: response.data.message || 'No employees were imported',
                        icon: 'warning',
                        confirmButtonColor: '#2f3192'
                    });
                }

                if (response.data.error_count > 0) {
                    setImportErrors(response.data.errors || []);
                } else {
                    setShowImportModal(false);
                    setImportFile(null);
                    setPreviewData([]);
                    fetchEmployees();
                }
            }
        } catch (err) {
            Swal.fire({
                title: 'Error!',
                text: err.response?.data?.detail || 'Failed to import employees',
                icon: 'error',
                confirmButtonColor: '#2f3192'
            });
        } finally {
            setImporting(false);
        }
    };

    const handleExportEmployees = async () => {
        try {
            const response = await axios.get(`${API_BASE_URL}/users/employees/export`, {
                headers: { 'user-id': user.user_id },
                responseType: 'blob'
            });

            // Since the backend returns CSV, we'll convert it to Excel with mobile number
            const csvText = await response.data.text();
            const rows = csvText.split('\n').map(row => row.split(','));
            const headers = rows[0];

            // Map the data to include mobile number
            const data = rows.slice(1).filter(row => row.length > 1).map(row => {
                const obj = {};
                headers.forEach((header, idx) => {
                    obj[header] = row[idx] || '';
                });
                return obj;
            });

            // Create worksheet with all data including mobile number
            const ws = XLSX.utils.json_to_sheet(data);

            // Set column widths
            const colWidths = [
                { wch: 10 }, // ID
                { wch: 25 }, // Employee Name
                { wch: 15 }, // Employee Code
                { wch: 15 }, // Branch Code
                { wch: 25 }, // Branch Name
                { wch: 15 }, // Mobile Number
                { wch: 15 }, // Role
                { wch: 10 }, // Blocked
                { wch: 12 }  // Can Export
            ];
            ws['!cols'] = colWidths;

            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, 'Employees');
            const fileName = `employees_export_${new Date().getTime()}.xlsx`;
            XLSX.writeFile(wb, fileName);

            Swal.fire({
                title: 'Success!',
                text: 'Employees exported successfully',
                icon: 'success',
                confirmButtonColor: '#2f3192',
                timer: 2000
            });
        } catch (err) {
            Swal.fire({
                title: 'Error!',
                text: err.response?.data?.detail || 'Failed to export employees',
                icon: 'error',
                confirmButtonColor: '#2f3192'
            });
        }
    };

    const fetchBanners = async () => {
        try {
            const timestamp = new Date().getTime();
            const response = await axios.get(`${API_BASE_URL}/banners?_=${timestamp}`);

            if (response.data.success) {
                setBanners(response.data.banners);
                const previews = {};
                response.data.banners.forEach(banner => {
                    const imageUrl = `${API_BASE_URL}${banner.image_url}?t=${timestamp}`;
                    previews[`banner${banner.position}`] = imageUrl;
                });
                setBannerPreviews(previews);
            }
        } catch (err) {
            console.error('Error fetching banners:', err);
            showToast('error', 'Failed to load banners');
        }
    };

    const handleBannerFileChange = (position, file) => {
        if (file) {
            if (!file.type.match('image/jpeg') && !file.type.match('image/png')) {
                showToast('error', 'Please upload only JPG or PNG images');
                return;
            }

            if (file.size > 0.5 * 1024 * 1024) {
                showToast('error', 'File size should be less than 500KB');
                return;
            }

            setBannerFiles({ ...bannerFiles, [position]: file });

            const reader = new FileReader();
            reader.onloadend = () => {
                setBannerPreviews({ ...bannerPreviews, [position]: reader.result });
            };
            reader.readAsDataURL(file);
        }
    };

    const handleUploadBanners = async () => {
        const hasFiles = Object.values(bannerFiles).some(file => file !== null);
        if (!hasFiles) {
            showToast('error', 'Please select at least one image to upload');
            return;
        }

        setUploadingBanner(true);
        const formData = new FormData();

        if (bannerFiles.banner1) formData.append('banner1', bannerFiles.banner1);
        if (bannerFiles.banner2) formData.append('banner2', bannerFiles.banner2);
        if (bannerFiles.banner3) formData.append('banner3', bannerFiles.banner3);

        try {
            const userData = JSON.parse(sessionStorage.getItem('user'));

            const response = await axios.post(`${API_BASE_URL}/banners/upload`, formData, {
                headers: {
                    'Content-Type': 'multipart/form-data',
                    'user-id': userData.user_id,
                    'user-role': userData.role
                }
            });

            if (response.data.success) {
                Swal.fire({
                    title: 'Success!',
                    text: 'Banners uploaded successfully!',
                    icon: 'success',
                    confirmButtonColor: '#2f3192',
                    timer: 2000
                });
                setShowBannerModal(false);
                setBannerFiles({ banner1: null, banner2: null, banner3: null });

                setTimeout(() => {
                    fetchBanners();
                }, 500);
            }
        } catch (err) {
            Swal.fire({
                title: 'Error!',
                text: err.response?.data?.detail || 'Failed to upload banners',
                icon: 'error',
                confirmButtonColor: '#2f3192'
            });
        } finally {
            setUploadingBanner(false);
        }
    };

    useEffect(() => {
        if (user) {
            fetchBanners();
        }
    }, [user]);

    const handleUpdateEmployee = async (e) => {
        e.preventDefault();
        setLoading(true);

        const updateData = {
            name: editingUser.name,
            branch: editingUser.branch,
            branch_name: editingUser.branch_name,
            mobile_number: editingUser.mobile_number,
            password: editingUser.password || undefined,
            role: editingUser.role,
            is_blocked: editingUser.is_blocked,
            can_export: editingUser.can_export,
            can_access_expense: editingUser.can_access_expense
        };

        try {
            const response = await axios.put(`${API_BASE_URL}/users/employees/${editingUser.id}`,
                updateData,
                { headers: { 'user-id': user.user_id } }
            );

            if (response.data.success) {
                Swal.fire({
                    title: 'Success!',
                    text: 'Employee updated successfully!',
                    icon: 'success',
                    confirmButtonColor: '#2f3192',
                    timer: 2000
                });
                setEditingUser(null);
                fetchEmployees();
            }
        } catch (err) {
            Swal.fire({
                title: 'Error!',
                text: err.response?.data?.detail || err.response?.data?.message || 'Failed to update employee',
                icon: 'error',
                confirmButtonColor: '#2f3192'
            });
        } finally {
            setLoading(false);
        }
    };

    const handleDeleteEmployee = async (id, employeeName) => {
        const result = await Swal.fire({
            title: 'Delete Employee',
            text: `Are you sure you want to delete ${employeeName}? This action cannot be undone.`,
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#EF4444',
            cancelButtonColor: '#6B7280',
            confirmButtonText: 'Yes, delete',
            cancelButtonText: 'Cancel'
        });

        if (!result.isConfirmed) return;

        try {
            const response = await axios.delete(`${API_BASE_URL}/users/employees/${id}`, {
                headers: { 'user-id': user.user_id }
            });

            if (response.data.success) {
                Swal.fire({
                    title: 'Deleted!',
                    text: 'Employee deleted successfully!',
                    icon: 'success',
                    confirmButtonColor: '#2f3192',
                    timer: 2000
                });
                setEditingUser(null);
                fetchEmployees();
            }
        } catch (err) {
            Swal.fire({
                title: 'Error!',
                text: err.response?.data?.detail || err.response?.data?.message || 'Failed to delete employee',
                icon: 'error',
                confirmButtonColor: '#2f3192'
            });
        }
    };

    const handleToggleBlock = async (id, currentStatus) => {
        try {
            const employeeToUpdate = employees.find(emp => emp.id === id);
            if (!employeeToUpdate) {
                Swal.fire({
                    title: 'Error!',
                    text: 'Employee not found',
                    icon: 'error',
                    confirmButtonColor: '#2f3192'
                });
                return;
            }

            const updateData = {
                name: employeeToUpdate.name,
                branch: employeeToUpdate.branch,
                branch_name: employeeToUpdate.branch_name,
                mobile_number: employeeToUpdate.mobile_number,
                role: employeeToUpdate.role,
                is_blocked: !currentStatus,
                can_export: employeeToUpdate.can_export,
                can_access_expense: employeeToUpdate.can_access_expense,
                password: undefined
            };

            const response = await axios.put(`${API_BASE_URL}/users/employees/${id}`,
                updateData,
                { headers: { 'user-id': user.user_id } }
            );

            if (response.data.success) {
                Swal.fire({
                    title: 'Success!',
                    text: `Employee ${currentStatus ? 'unblocked' : 'blocked'} successfully!`,
                    icon: 'success',
                    confirmButtonColor: '#2f3192',
                    timer: 2000
                });

                await fetchEmployees();

                if (editingUser && editingUser.id === id) {
                    setEditingUser({ ...editingUser, is_blocked: !currentStatus });
                }
            } else {
                throw new Error(response.data.message || 'Failed to update block status');
            }
        } catch (err) {
            console.error('Toggle block error:', err);
            Swal.fire({
                title: 'Error!',
                text: err.response?.data?.detail || err.response?.data?.message || 'Failed to update block status',
                icon: 'error',
                confirmButtonColor: '#2f3192'
            });
        }
    };

    useEffect(() => {
        if (editingUser && (isMasterAdmin || isITAdmin)) {
            axios.get(`${API_BASE_URL}/users/employees/${editingUser.user_id}/branches`, {
                headers: { 'user-id': user.user_id }
            }).then(r => {
                if (r.data.success) setEditingUserBranches(r.data.branches);
            }).catch(() => setEditingUserBranches([]));
        }
    }, [editingUser]);

    const handleAddBranch = async () => {
        if (!newBranchInput.branch) {
            showToast('error', 'Please select a branch');
            return;
        }
        // Guard against duplicates (the dropdown already filters, but be safe)
        if (editingUserBranches.some(b => b.branch === newBranchInput.branch)) {
            showToast('error', 'This branch is already assigned');
            return;
        }
        try {
            const res = await axios.post(
                `${API_BASE_URL}/users/employees/${editingUser.user_id}/branches`,
                newBranchInput,
                { headers: { 'user-id': user.user_id } }
            );
            if (res.data.success) {
                setEditingUserBranches([...editingUserBranches, res.data.branch]);
                setNewBranchInput({ branch: '', branch_name: '' });
                showToast('success', 'Branch added');
            }
        } catch (err) {
            showToast('error', err.response?.data?.detail || 'Failed to add branch');
        }
    };

    const handleRemoveBranch = async (accessId) => {
        try {
            await axios.delete(
                `${API_BASE_URL}/users/employees/branch-access/${accessId}`,
                { headers: { 'user-id': user.user_id } }
            );
            setEditingUserBranches(editingUserBranches.filter(b => b.id !== accessId));
            showToast('success', 'Branch removed');
        } catch (err) {
            showToast('error', err.response?.data?.detail || 'Failed to remove branch');
        }
    };

    const handleSetPrimary = async (branch) => {
        try {
            await axios.put(
                `${API_BASE_URL}/users/employees/${editingUser.user_id}/primary-branch`,
                { branch },
                { headers: { 'user-id': user.user_id } }
            );
            setEditingUserBranches(editingUserBranches.map(b => ({
                ...b, is_primary: b.branch === branch
            })));
            showToast('success', 'Primary branch updated');
        } catch (err) {
            showToast('error', err.response?.data?.detail || 'Failed');
        }
    };

    const handleToggleExport = async (id, currentStatus) => {
        if (!canGrantExport) {
            Swal.fire({
                title: 'Access Denied',
                text: 'You do not have permission to change export settings',
                icon: 'error',
                confirmButtonColor: '#2f3192'
            });
            return;
        }

        try {
            const employeeToUpdate = employees.find(emp => emp.id === id);
            if (!employeeToUpdate) {
                Swal.fire({
                    title: 'Error!',
                    text: 'Employee not found',
                    icon: 'error',
                    confirmButtonColor: '#2f3192'
                });
                return;
            }

            if (employeeToUpdate.user_id === MASTER_ADMIN_ID) {
                Swal.fire({
                    title: 'Access Denied',
                    text: 'Cannot change export permission for Master Admin',
                    icon: 'error',
                    confirmButtonColor: '#2f3192'
                });
                return;
            }

            const updateData = {
                name: employeeToUpdate.name,
                branch: employeeToUpdate.branch,
                branch_name: employeeToUpdate.branch_name,
                mobile_number: employeeToUpdate.mobile_number,
                role: employeeToUpdate.role,
                is_blocked: employeeToUpdate.is_blocked,
                can_export: !currentStatus,
                can_access_expense: employeeToUpdate.can_access_expense,
                password: undefined
            };

            const response = await axios.put(`${API_BASE_URL}/users/employees/${id}`,
                updateData,
                { headers: { 'user-id': user.user_id } }
            );

            if (response.data.success) {
                Swal.fire({
                    title: 'Success!',
                    text: `Export permission ${currentStatus ? 'revoked' : 'granted'} successfully!`,
                    icon: 'success',
                    confirmButtonColor: '#2f3192',
                    timer: 2000
                });

                await fetchEmployees();

                if (editingUser && editingUser.id === id) {
                    setEditingUser({ ...editingUser, can_export: !currentStatus });
                }
            } else {
                throw new Error(response.data.message || 'Failed to update export permission');
            }
        } catch (err) {
            console.error('Toggle export error:', err);
            Swal.fire({
                title: 'Error!',
                text: err.response?.data?.detail || err.response?.data?.message || 'Failed to update export permission',
                icon: 'error',
                confirmButtonColor: '#2f3192'
            });
        }
    };

    const handleToggleExpense = async (id, currentStatus) => {
        if (!canGrantExpense) {
            Swal.fire({
                title: 'Access Denied',
                text: 'You do not have permission to change expense access',
                icon: 'error',
                confirmButtonColor: '#2f3192'
            });
            return;
        }

        try {
            const employeeToUpdate = employees.find(emp => emp.id === id);
            if (!employeeToUpdate) {
                Swal.fire({
                    title: 'Error!',
                    text: 'Employee not found',
                    icon: 'error',
                    confirmButtonColor: '#2f3192'
                });
                return;
            }

            if (employeeToUpdate.user_id === MASTER_ADMIN_ID) {
                Swal.fire({
                    title: 'Access Denied',
                    text: 'Cannot change expense access for Master Admin',
                    icon: 'error',
                    confirmButtonColor: '#2f3192'
                });
                return;
            }

            const updateData = {
                name: employeeToUpdate.name,
                branch: employeeToUpdate.branch,
                branch_name: employeeToUpdate.branch_name,
                mobile_number: employeeToUpdate.mobile_number,
                role: employeeToUpdate.role,
                is_blocked: employeeToUpdate.is_blocked,
                can_export: employeeToUpdate.can_export,
                can_access_expense: !currentStatus,
                password: undefined
            };

            const response = await axios.put(`${API_BASE_URL}/users/employees/${id}`,
                updateData,
                { headers: { 'user-id': user.user_id } }
            );

            if (response.data.success) {
                Swal.fire({
                    title: 'Success!',
                    text: `Expense access ${currentStatus ? 'revoked' : 'granted'} successfully!`,
                    icon: 'success',
                    confirmButtonColor: '#2f3192',
                    timer: 2000
                });

                await fetchEmployees();

                if (editingUser && editingUser.id === id) {
                    setEditingUser({ ...editingUser, can_access_expense: !currentStatus });
                }
            }
        } catch (err) {
            console.error('Toggle expense error:', err);
            Swal.fire({
                title: 'Error!',
                text: err.response?.data?.detail || 'Failed to update expense access',
                icon: 'error',
                confirmButtonColor: '#2f3192'
            });
        }
    };

    const handleUpdateProfile = async (e) => {
        e.preventDefault();
        setLoading(true);

        const updateData = {};

        if (editProfileData.name !== undefined) {
            if (!editProfileData.name.trim()) {
                Swal.fire({
                    title: 'Error!',
                    text: 'Name cannot be empty',
                    icon: 'error',
                    confirmButtonColor: '#2f3192'
                });
                setLoading(false);
                return;
            }
            if (editProfileData.name.trim() !== user.name) {
                updateData.name = editProfileData.name.trim();
            }
        }

        if (editProfileData.branch !== undefined) {
            if (!editProfileData.branch.trim()) {
                Swal.fire({
                    title: 'Error!',
                    text: 'Branch code cannot be empty',
                    icon: 'error',
                    confirmButtonColor: '#2f3192'
                });
                setLoading(false);
                return;
            }
            if (editProfileData.branch.trim() !== user.branch) {
                updateData.branch = editProfileData.branch.trim();
            }
        }

        if (editProfileData.branch_name !== undefined) {
            if (!editProfileData.branch_name || editProfileData.branch_name.trim() === '') {
                Swal.fire({
                    title: 'Error!',
                    text: 'Branch name cannot be empty',
                    icon: 'error',
                    confirmButtonColor: '#2f3192'
                });
                setLoading(false);
                return;
            }
            if (editProfileData.branch_name.trim() !== (user.branch_name || '')) {
                updateData.branch_name = editProfileData.branch_name.trim();
            }
        }

        if (editProfileData.password && editProfileData.password.trim() !== '') {
            if (editProfileData.password.length < 6) {
                Swal.fire({
                    title: 'Error!',
                    text: 'Password must be at least 6 characters long',
                    icon: 'error',
                    confirmButtonColor: '#2f3192'
                });
                setLoading(false);
                return;
            }
            updateData.password = editProfileData.password;
        }

        if (Object.keys(updateData).length === 0) {
            Swal.fire({
                title: 'Info',
                text: 'No changes to update',
                icon: 'info',
                confirmButtonColor: '#2f3192'
            });
            setLoading(false);
            return;
        }

        try {
            const response = await axios.put(`${API_BASE_URL}/users/profile`,
                updateData,
                { headers: { 'user-id': user.user_id } }
            );

            if (response.data.success) {
                const updatedUserState = {
                    ...user,
                    ...updateData
                };
                setUser(updatedUserState);
                sessionStorage.setItem('user', JSON.stringify(updatedUserState));

                Swal.fire({
                    title: 'Success!',
                    text: 'Profile updated successfully!',
                    icon: 'success',
                    confirmButtonColor: '#2f3192',
                    timer: 2000
                });
                setEditProfileData({ name: '', branch: '', branch_name: '', password: '' });
                setShowProfileEdit(false);
                setShowSettings(false);
                fetchUserProfile();
            }
        } catch (err) {
            Swal.fire({
                title: 'Error!',
                text: err.response?.data?.detail || err.response?.data?.message || 'Failed to update profile',
                icon: 'error',
                confirmButtonColor: '#2f3192'
            });
        } finally {
            setLoading(false);
        }
    };

    const removeDotFromQueriesTab = () => {
        const dot = document.querySelector('[data-testid="unresolved-dot"]');
        if (dot) dot.remove();
    };

    const getAvailableRoles = () => {
        if (isMasterAdmin) {
            return [
                { value: 'master_admin', label: 'Master Admin' },
                { value: 'it_admin', label: 'IT Admin' },
                { value: 'branch_admin', label: 'Branch Admin' },
                { value: 'employee', label: 'Employee' }
            ];
        } else if (isITAdmin) {
            return [
                { value: 'it_admin', label: 'IT Admin' },
                { value: 'branch_admin', label: 'Branch Admin' },
                { value: 'employee', label: 'Employee' }
            ];
        } else if (isBranchAdmin) {
            return [
                { value: 'branch_admin', label: 'Branch Admin' },
                { value: 'employee', label: 'Employee' }
            ];
        }
        return [];
    };

    if (!user) return null;

    return (
        <div className="min-h-screen py-1">
            {/* Toast Notification */}
            {toast.show && (
                <div className={`fixed top-4 right-4 left-4 md:left-auto z-[100] flex items-center space-x-2 px-3 py-2.5 rounded-lg shadow-lg animate-slideIn ${toast.type === 'success'
                    ? 'bg-green-50 text-green-800 border-l-4 border-green-500'
                    : toast.type === 'info'
                        ? 'bg-blue-50 text-blue-800 border-l-4 border-blue-500'
                        : 'bg-red-50 text-red-800 border-l-4 border-red-500'
                    }`}>
                    {toast.type === 'success' ? (
                        <FaCheckCircle className="text-green-500 flex-shrink-0 text-xs" />
                    ) : toast.type === 'info' ? (
                        <FaExclamationCircle className="text-blue-500 flex-shrink-0 text-xs" />
                    ) : (
                        <FaExclamationCircle className="text-red-500 flex-shrink-0 text-xs" />
                    )}
                    <span className="text-xs font-medium flex-1">{toast.message}</span>
                    <button onClick={hideToast} className="ml-2 text-black hover:text-gray-600">
                        <FaTimes className="text-xs" />
                    </button>
                </div>
            )}

            <main className="max-w-7xl mx-auto px-3 sm:px-5 lg:px-4">
                {/* Profile Card */}
                <div className="bg-[url('/2.jpg')] bg-cover bg-center rounded-xl shadow-lg overflow-visible mb-2 sm:mb-2">
                    <div className="p-2 sm:p-2">
                        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                            <div className="flex items-center space-x-3 sm:space-x-4">
                                <div className="w-14 h-14 sm:w-12 sm:h-12 rounded-full bg-gradient-to-br from-[#2f3192] to-[#335478] flex items-center justify-center text-white text-base sm:text-2xl font-bold shadow-lg flex-shrink-0">
                                    {user.name?.charAt(0).toUpperCase() || 'U'}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <h2 className="text-lg sm:text-xl font-bold text-black truncate">{user.name}</h2>
                                    <div className="flex flex-wrap items-center gap-2 mt-1 sm:mt-1.5">
                                        <span className="inline-flex items-center space-x-1 text-xs text-black bg-gray-100 px-2 py-1 rounded-full">
                                            <FaIdCard className="text-[#2f3192] text-xs flex-shrink-0" />
                                            <span className="truncate max-w-[100px] sm:max-w-none">{user.user_id}</span>
                                        </span>
                                        {(!user.branches || user.branches.length <= 1) && (
                                            <>
                                                <span className="inline-flex items-center space-x-1 text-xs text-black bg-gray-100 px-2 py-1 rounded-full">
                                                    <FaBuilding className="text-[#2f3192] text-xs flex-shrink-0" />
                                                    <span className="truncate max-w-[80px] sm:max-w-none">{user.branch}</span>
                                                </span>
                                                {user.branch_name && (
                                                    <span className="inline-flex items-center space-x-1 text-xs text-black bg-gray-100 px-2 py-1 rounded-full">
                                                        <FaBuilding className="text-[#2f3192] text-xs flex-shrink-0" />
                                                        <span className="truncate max-w-[120px] sm:max-w-none">{user.branch_name}</span>
                                                    </span>
                                                )}
                                            </>
                                        )}

                                        {user.branches && user.branches.length > 1 && (
                                            <span className="inline-flex items-center space-x-1 text-xs bg-green-100 text-green-800 border border-green-400 px-2 py-1 rounded-full font-medium">
                                                <FaCheckCircle className="text-xs flex-shrink-0" />
                                                <span>Active: {user.branch_name} ({user.branch})</span>
                                            </span>
                                        )}
                                        <span className={`inline-flex items-center space-x-1 text-xs ${getRoleColor(user.role)} px-2 py-1 rounded-full font-medium`}>
                                            <FaUserTie className="text-xs flex-shrink-0" />
                                            <span className="capitalize">{getRoleDisplayName(user.role)}</span>
                                        </span>
                                        {user.can_export && (
                                            <span className="inline-flex items-center space-x-1 text-xs bg-green-100 text-green-600 px-2 py-1 rounded-full">
                                                <FaFileExport className="text-xs flex-shrink-0" />
                                                <span>Export</span>
                                            </span>
                                        )}
                                    </div>


                                </div>
                            </div>

                            <div className="flex items-start gap-3 self-end sm:self-start">
                                {user.branches && user.branches.length > 1 && (
                                    <div className="hidden sm:flex flex-col items-end gap-1 max-w-md">
                                        <span className="text-xs font-semibold text-gray-600">Branches:</span>
                                        <div className="flex flex-wrap justify-end gap-1.5">
                                            {user.branches.map(b => {
                                                const isActive = b.branch === user.branch;
                                                return (
                                                    <button
                                                        key={b.id}
                                                        type="button"
                                                        disabled={isActive}
                                                        onClick={() => {
                                                            if (isActive) return;
                                                            Swal.fire({
                                                                title: 'Switch Branch?',
                                                                text: `Switch active branch to ${b.branch_name}? The page will reload.`,
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
                                                                        branch: b.branch,
                                                                        branch_name: b.branch_name
                                                                    };
                                                                    sessionStorage.setItem('user', JSON.stringify(updated));
                                                                    window.location.reload();
                                                                }
                                                            });
                                                        }}
                                                        title={
                                                            isActive
                                                                ? 'Currently active branch'
                                                                : `Click to switch to ${b.branch_name}`
                                                        }
                                                        className={`inline-flex items-center space-x-1 text-xs px-2 py-1 rounded-full border transition-all ${isActive
                                                            ? 'bg-green-100 text-green-800 border-green-400 cursor-default font-semibold'
                                                            : b.is_primary
                                                                ? 'bg-yellow-100 text-yellow-800 border-yellow-300 hover:bg-yellow-200 cursor-pointer'
                                                                : 'bg-blue-50 text-blue-800 border-blue-200 hover:bg-blue-100 cursor-pointer'
                                                            }`}
                                                    >
                                                        {isActive && <FaCheckCircle className="text-xs" />}
                                                        {!isActive && b.is_primary && <span>★</span>}
                                                        <FaBuilding className="text-xs flex-shrink-0" />
                                                        <span>{b.branch_name} ({b.branch})</span>
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}

                                <div className="relative settings-dropdown">
                                    <button
                                        onClick={() => setShowSettings(!showSettings)}
                                        className="p-2 text-black hover:text-[#2f3192] hover:bg-[#2f3192]/10 rounded-lg transition-all"
                                    >
                                        <FaCog className="text-lg" />
                                    </button>

                                    {showSettings && (
                                        <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-xl border border-gray-100 py-1 z-20">
                                            <button
                                                onClick={() => {
                                                    setShowProfileEdit(!showProfileEdit);
                                                    setShowSettings(false);
                                                }}
                                                className="w-full px-4 py-2 text-left text-xs text-black hover:bg-[#2f3192]/10 hover:text-[#2f3192] flex items-center space-x-2 transition-colors"
                                            >
                                                <FaEdit className="text-xs" />
                                                <span>Edit Profile</span>
                                            </button>
                                            {(isMasterAdmin || isITAdmin) && !isRestrictedUser && (
                                                <button
                                                    onClick={() => {
                                                        setShowBannerModal(true);
                                                        setShowSettings(false);
                                                    }}
                                                    className="w-full px-4 py-2 text-left text-xs text-black hover:bg-[#2f3192]/10 hover:text-[#2f3192] flex items-center space-x-2 transition-colors"
                                                >
                                                    <FaImage className="text-xs" />
                                                    <span>Manage Banners</span>
                                                </button>
                                            )}
                                            {(isITAdmin || user?.user_id === MASTER_ADMIN_ID) && (
                                                <button
                                                    onClick={() => {
                                                        setShowDeleteDataModal(true);
                                                        setShowSettings(false);
                                                    }}
                                                    className="w-full px-4 py-2 text-left text-xs text-red-600 hover:bg-red-50 flex items-center space-x-2 transition-colors"
                                                >
                                                    <FaTrash className="text-xs" />
                                                    <span>Delete Data</span>
                                                </button>
                                            )}
                                            <button
                                                onClick={handleLogout}
                                                className="w-full px-4 py-2 text-left text-xs text-red-600 hover:bg-red-50 flex items-center space-x-2 transition-colors"
                                            >
                                                <FaSignOutAlt className="text-xs" />
                                                <span>Logout</span>
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        {showProfileEdit && (
                            <div className="mt-4 sm:mt-5 border-t border-gray-100 pt-4 sm:pt-5">
                                <form onSubmit={handleUpdateProfile} className="space-y-4">
                                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                                        <div>
                                            <label className="block text-xs text-black mb-1">New Name</label>
                                            <div className="relative">
                                                <input
                                                    type="text"
                                                    placeholder="Enter new name"
                                                    value={editProfileData.name}
                                                    onChange={(e) => {
                                                        const value = e.target.value;
                                                        if (value === '') {
                                                            Swal.fire({
                                                                title: 'Warning!',
                                                                text: 'Name cannot be empty',
                                                                icon: 'warning',
                                                                confirmButtonColor: '#2f3192',
                                                                timer: 1500
                                                            });
                                                            return;
                                                        }
                                                        setEditProfileData({ ...editProfileData, name: value });
                                                    }}
                                                    className="w-full pl-3 pr-3 py-1.5 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#2f3192] focus:border-transparent text-black"
                                                />
                                            </div>
                                        </div>

                                        <div>
                                            <label className="block text-xs text-black mb-1">New Branch Code</label>
                                            <div className="relative">
                                                <input
                                                    type="text"
                                                    placeholder="Enter branch code"
                                                    value={editProfileData.branch}
                                                    onChange={(e) => {
                                                        const value = e.target.value;
                                                        if (value === '') {
                                                            Swal.fire({
                                                                title: 'Warning!',
                                                                text: 'Branch code cannot be empty',
                                                                icon: 'warning',
                                                                confirmButtonColor: '#2f3192',
                                                                timer: 1500
                                                            });
                                                            return;
                                                        }
                                                        setEditProfileData({ ...editProfileData, branch: value });
                                                    }}
                                                    className="w-full pl-3 pr-3 py-1.5 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#2f3192] focus:border-transparent text-black"
                                                />
                                            </div>
                                        </div>

                                        <div>
                                            <label className="block text-xs text-black mb-1">New Branch Name</label>
                                            <div className="relative">
                                                <input
                                                    type="text"
                                                    placeholder="Enter branch name"
                                                    value={editProfileData.branch_name || ''}
                                                    onChange={(e) => {
                                                        const value = e.target.value;
                                                        if (value === '') {
                                                            Swal.fire({
                                                                title: 'Warning!',
                                                                text: 'Branch name cannot be empty',
                                                                icon: 'warning',
                                                                confirmButtonColor: '#2f3192',
                                                                timer: 1500
                                                            });
                                                            return;
                                                        }
                                                        setEditProfileData({ ...editProfileData, branch_name: value });
                                                    }}
                                                    className="w-full pl-3 pr-3 py-1.5 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#2f3192] focus:border-transparent text-black"
                                                />
                                            </div>
                                        </div>

                                        <div>
                                            <label className="block text-xs text-black mb-1">New Password</label>
                                            <div className="relative">
                                                <input
                                                    type={showPassword.profile ? "text" : "password"}
                                                    placeholder="Enter new password"
                                                    value={editProfileData.password}
                                                    onChange={(e) => setEditProfileData({ ...editProfileData, password: e.target.value })}
                                                    className="w-full pl-3 pr-8 py-1.5 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#2f3192] focus:border-transparent text-black"
                                                />
                                                <button
                                                    type="button"
                                                    onClick={() => setShowPassword({ ...showPassword, profile: !showPassword.profile })}
                                                    className="absolute right-3 top-1/2 transform -translate-y-1/2 text-black hover:text-gray-600"
                                                >
                                                    {showPassword.profile ? <FaEyeSlash className="text-xs" /> : <FaEye className="text-xs" />}
                                                </button>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="flex justify-end space-x-2">
                                        <button
                                            type="button"
                                            onClick={() => setShowProfileEdit(false)}
                                            className="px-4 py-1.5 text-xs text-black hover:text-gray-800 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                                        >
                                            Cancel
                                        </button>
                                        <button
                                            type="submit"
                                            disabled={loading}
                                            className="px-4 py-1.5 text-xs bg-[#2f3192] hover:bg-[#3a5885] text-white rounded-lg transition-colors disabled:opacity-50 flex items-center space-x-2"
                                        >
                                            <span>{loading ? 'Updating...' : 'Update Profile'}</span>
                                        </button>
                                    </div>
                                </form>
                            </div>
                        )}
                    </div>
                </div>

                {isEmployee && (
                    <div className="mb-4 sm:mb-5">
                        <EmpQuery user={user} showToast={showToast} />
                    </div>
                )}

                {(isMasterAdmin || isITAdmin || isBranchAdmin) && (
                    <div className="bg-white rounded-xl shadow-lg overflow-hidden">
                        <div className="border-b border-gray-200 bg-gray-50 overflow-x-auto">
                            <div className="flex min-w-max sm:min-w-0">
                                <button
                                    onClick={() => setActiveAdminTab('employees')}
                                    className={`px-4 sm:px-5 py-2.5 text-xs sm:text-sm font-medium transition-colors relative ${activeAdminTab === 'employees'
                                        ? 'text-[#2f3192]'
                                        : 'text-black hover:text-gray-800'
                                        }`}
                                >
                                    <div className="flex items-center space-x-1.5">
                                        <FaUsers className={activeAdminTab === 'employees' ? 'text-[#2f3192]' : 'text-black'} />
                                        <span>Employees</span>
                                        {employeeCount > 0 && (
                                            <span className={`ml-1 px-1.5 py-0.5 text-xs rounded-full ${activeAdminTab === 'employees'
                                                ? 'bg-[#2f3192] text-white'
                                                : 'bg-gray-200 text-black'
                                                }`}>
                                                {employeeCount}
                                            </span>
                                        )}
                                    </div>
                                    {activeAdminTab === 'employees' && (
                                        <div className="absolute bottom-0 left-0 w-full h-0.5 bg-[#2f3192]"></div>
                                    )}
                                </button>
                                <button
                                    onClick={() => {
                                        setActiveAdminTab('queries');
                                        setShowQueryCount(true);
                                    }}
                                    className={`px-4 sm:px-5 py-2.5 text-xs sm:text-sm font-medium transition-colors relative ${activeAdminTab === 'queries'
                                        ? 'text-[#2f3192]'
                                        : 'text-black hover:text-gray-800'
                                        }`}
                                >
                                    <div className="flex items-center space-x-1.5">
                                        <FaExclamationCircle className={activeAdminTab === 'queries' ? 'text-[#2f3192]' : 'text-black'} />
                                        <span>Queries</span>
                                        {showQueryCount && unresolvedQueryCount > 0 && (
                                            <span className={`ml-1 px-1.5 py-0.5 text-xs rounded-full ${activeAdminTab === 'queries'
                                                ? 'bg-[#2f3192] text-white'
                                                : 'bg-gray-200 text-black'}`}>
                                                {unresolvedQueryCount}
                                            </span>
                                        )}
                                    </div>
                                    {activeAdminTab === 'queries' && (
                                        <div className="absolute bottom-0 left-0 w-full h-0.5 bg-[#2f3192]"></div>
                                    )}
                                </button>
                                {canViewCDBUpdate && (
                                    <button
                                        onClick={() => setActiveAdminTab('cdb-update')}
                                        className={`px-4 sm:px-5 py-2.5 text-xs sm:text-sm font-medium transition-colors relative ${activeAdminTab === 'cdb-update'
                                            ? 'text-[#2f3192]'
                                            : 'text-black hover:text-gray-800'
                                            }`}
                                    >
                                        <div className="flex items-center space-x-1.5">
                                            <span role="img" aria-label="cdb" className="text-base"><MdOutlineUpdate /></span>
                                            <span>CDB Update</span>
                                        </div>
                                        {activeAdminTab === 'cdb-update' && (
                                            <div className="absolute bottom-0 left-0 w-full h-0.5 bg-[#2f3192]"></div>
                                        )}
                                    </button>
                                )}
                            </div>
                        </div>

                        <div className="p-4 sm:p-5">
                            {activeAdminTab === 'employees' && (
                                <>
                                    <div className="flex flex-col sm:flex-row items-center justify-between space-y-3 sm:space-y-0 sm:space-x-4 mb-4">
                                        <h3 className="text-sm sm:text-base font-semibold text-black flex items-center space-x-2 whitespace-nowrap">
                                            <FaUsers className="text-[#2f3192]" />
                                            <span>Employee Management</span>
                                        </h3>

                                        {(isMasterAdmin || isITAdmin) && (
                                            <div className="flex space-x-2 whitespace-nowrap order-1 sm:order-2">
                                                {user?.can_export && (
                                                    <button
                                                        onClick={handleExportEmployees}
                                                        className="flex items-center justify-center space-x-1 bg-green-500 hover:bg-green-600 text-white px-2.5 py-1.5 rounded-lg text-xs transition-all shadow-sm hover:shadow"
                                                    >
                                                        <MdOutlineFileUpload className="text-xs" />
                                                        <span className="hidden sm:inline">Export</span>
                                                        <span className="sm:hidden">Exp</span>
                                                    </button>
                                                )}

                                                {!isRestrictedUser && (
                                                    <button
                                                        onClick={() => setShowImportModal(true)}
                                                        className="flex items-center justify-center space-x-1 bg-[#2f3192] hover:bg-[#3a5885] text-white px-2.5 py-1.5 rounded-lg text-xs transition-all shadow-sm hover:shadow"
                                                    >
                                                        <MdOutlineFileDownload className="text-xs" />
                                                        <span className="hidden sm:inline">Import</span>
                                                        <span className="sm:hidden">Imp</span>
                                                    </button>
                                                )}

                                                {!isRestrictedUser && (
                                                    <button
                                                        onClick={() => setShowAddModal(true)}
                                                        className="flex items-center justify-center space-x-1 bg-[#2f3192] hover:bg-[#3a5885] text-white px-2.5 py-1.5 rounded-lg text-xs transition-all shadow-sm hover:shadow"
                                                    >
                                                        <FaUserPlus className="text-xs" />
                                                        <span className="hidden sm:inline">Add</span>
                                                        <span className="sm:hidden">Add</span>
                                                    </button>
                                                )}
                                            </div>
                                        )}

                                        <div className="relative flex-1 max-w-md sm:ml-auto order-2 sm:order-1 mr-2">
                                            <FaSearch className="absolute left-3 top-1/2 transform -translate-y-1/2 text-black text-xs" />
                                            <input
                                                type="text"
                                                placeholder="Search employees..."
                                                value={searchTerm}
                                                onChange={(e) => setSearchTerm(e.target.value)}
                                                className="w-full pl-8 pr-8 py-1.5 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#2f3192] focus:border-transparent text-black"
                                            />
                                            {searchTerm && (
                                                <button
                                                    onClick={() => setSearchTerm('')}
                                                    className="absolute right-3 top-1/2 transform -translate-y-1/2 text-black hover:text-gray-600"
                                                >
                                                    <FaTimes className="text-xs" />
                                                </button>
                                            )}
                                        </div>
                                    </div>

                                    {/* Employees Table */}
                                    <div className="border border-gray-200 rounded-lg overflow-hidden">
                                        {/* Table container */}
                                        <div className="overflow-auto max-h-[150vh]" style={{ scrollbarWidth: 'thin' }}>
                                            <table className="border-collapse min-w-[1000px] w-full">
                                                <thead className="bg-gray-50 sticky top-0 z-10">
                                                    <tr>
                                                        <th className="px-2 py-1.5 text-center text-xs font-medium text-black uppercase tracking-wider border-r border-gray-200 w-16">Sr. No.</th>
                                                        <th className="px-2 py-1.5 text-center text-xs font-medium text-black uppercase tracking-wider border-r border-gray-200">Employee</th>
                                                        <th className="px-2 py-1.5 text-center text-xs font-medium text-black uppercase tracking-wider border-r border-gray-200">User ID</th>
                                                        <th className="px-2 py-1.5 text-center text-xs font-medium text-black uppercase tracking-wider border-r border-gray-200">Mobile</th>
                                                        <th className="px-2 py-1.5 text-center text-xs font-medium text-black uppercase tracking-wider border-r border-gray-200">Branch Code</th>
                                                        <th className="px-2 py-1.5 text-center text-xs font-medium text-black uppercase tracking-wider border-r border-gray-200">Branch Name</th>
                                                        <th className="px-2 py-1.5 text-center text-xs font-medium text-black uppercase tracking-wider border-r border-gray-200">Role</th>
                                                        <th className="px-2 py-1.5 text-center text-xs font-medium text-black uppercase tracking-wider border-r border-gray-200">Status</th>
                                                        <th className="px-2 py-1.5 text-center text-xs font-medium text-black uppercase tracking-wider border-r border-gray-200">Export</th>
                                                        <th className="px-2 py-1.5 text-center text-xs font-medium text-black uppercase tracking-wider border-r border-gray-200">Expense</th>
                                                        {!isRestrictedUser && (
                                                            <th className="px-2 py-1.5 text-center text-xs font-medium text-black uppercase tracking-wider">Actions</th>
                                                        )}
                                                    </tr>
                                                </thead>
                                                <tbody className="bg-white divide-y divide-gray-200">
                                                    {loading ? (
                                                        <tr>
                                                            <td colSpan={isRestrictedUser ? 10 : 11} className="px-2 py-4 text-center">
                                                                <div className="flex flex-col items-center justify-center space-y-2">
                                                                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-[#2f3192]"></div>
                                                                    <p className="text-xs text-black">Loading employees...</p>
                                                                </div>
                                                            </td>
                                                        </tr>
                                                    ) : filteredEmployees && filteredEmployees.length > 0 ? (
                                                        [...filteredEmployees]
                                                            .filter(emp => emp.user_id !== 'kala000001')
                                                            .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
                                                            .slice(0, visibleEmployeeCount)
                                                            .map((emp, index) => (
                                                                <tr key={emp.id || emp.user_id} className="hover:bg-gray-50 transition-colors">
                                                                    <td className="px-2 py-1 text-center text-xs text-black border-r border-gray-200">
                                                                        {index + 1}
                                                                    </td>
                                                                    <td className="px-2 py-1 text-center text-xs text-black border-r border-gray-200">
                                                                        <span
                                                                            className="text-black truncate max-w-[120px] block"
                                                                            title={emp.name}
                                                                        >
                                                                            {highlightText(emp.name, searchTerm)}
                                                                        </span>
                                                                    </td>
                                                                    <td className="px-2 py-1 text-center text-xs text-black border-r border-gray-200">
                                                                        {highlightText(emp.user_id, searchTerm)}
                                                                    </td>
                                                                    <td className="px-2 py-1 text-center text-xs text-black border-r border-gray-200">
                                                                        {emp.mobile_number ? highlightText(emp.mobile_number, searchTerm) : '-'}
                                                                    </td>
                                                                    <td className="px-2 py-1 text-center border-r border-gray-200">
                                                                        <span className="px-1 py-0.5 bg-gray-100 text-black rounded text-xs">
                                                                            {highlightText(emp.branch, searchTerm)}
                                                                        </span>
                                                                    </td>
                                                                    <td className="px-2 py-1 text-center text-xs text-black border-r border-gray-200">
                                                                        {emp.branch_name ? highlightText(emp.branch_name, searchTerm) : '-'}
                                                                    </td>
                                                                    <td className="px-2 py-1 text-center border-r border-gray-200">
                                                                        <span className={`px-1 py-0.5 rounded text-xs font-medium ${getRoleColor(emp.role)} text-black`}>
                                                                            {getRoleDisplayName(emp.role)}
                                                                        </span>
                                                                    </td>
                                                                    <td className="px-2 py-1 text-center border-r border-gray-200">
                                                                        {emp.is_blocked ? (
                                                                            <span className="px-1 py-0.5 bg-red-100 text-black rounded text-xs font-medium inline-flex items-center justify-center gap-1">
                                                                                <FaBan className="text-xs" /> Blocked
                                                                            </span>
                                                                        ) : (
                                                                            <span className="px-1 py-0.5 bg-green-100 text-black rounded text-xs font-medium">
                                                                                Active
                                                                            </span>
                                                                        )}
                                                                    </td>
                                                                    <td className="px-2 py-1 text-center border-r border-gray-200">
                                                                        {emp.user_id === MASTER_ADMIN_ID ? (
                                                                            <span className="px-1 py-0.5 bg-purple-100 text-black rounded text-xs font-medium whitespace-nowrap">
                                                                                Always Allowed
                                                                            </span>
                                                                        ) : emp.can_export ? (
                                                                            <span className="px-1 py-0.5 bg-blue-100 text-black rounded text-xs font-medium">
                                                                                Allowed
                                                                            </span>
                                                                        ) : (
                                                                            <span className="px-1 py-0.5 bg-gray-100 text-black rounded text-xs font-medium">
                                                                                Not Allowed
                                                                            </span>
                                                                        )}
                                                                    </td>
                                                                    <td className="px-2 py-1 text-center border-r border-gray-200">
                                                                        {emp.user_id === MASTER_ADMIN_ID ? (
                                                                            <span className="px-1 py-0.5 bg-purple-100 text-black rounded text-xs font-medium whitespace-nowrap">
                                                                                Always Allowed
                                                                            </span>
                                                                        ) : emp.can_access_expense ? (
                                                                            <span className="px-1 py-0.5 bg-emerald-100 text-black rounded text-xs font-medium">
                                                                                Allowed
                                                                            </span>
                                                                        ) : (
                                                                            <span className="px-1 py-0.5 bg-gray-100 text-black rounded text-xs font-medium">
                                                                                Not Allowed
                                                                            </span>
                                                                        )}
                                                                    </td>
                                                                    {!isRestrictedUser && (
                                                                        <td className="px-2 py-1 text-center">
                                                                            <div className="flex items-center justify-center gap-1">
                                                                                <button
                                                                                    onClick={() => setEditingUser(emp)}
                                                                                    className="p-1 text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded transition-colors"
                                                                                    title="Edit Employee"
                                                                                >
                                                                                    <FaEdit className="text-xs" />
                                                                                </button>
                                                                                {canDeleteEmployee && emp.user_id !== MASTER_ADMIN_ID && emp.user_id !== user.user_id && (
                                                                                    <button
                                                                                        onClick={() => handleDeleteEmployee(emp.id, emp.name)}
                                                                                        className="p-1 text-red-600 hover:text-red-800 hover:bg-red-50 rounded transition-colors"
                                                                                        title="Delete Employee"
                                                                                    >
                                                                                        <FaTrash className="text-xs" />
                                                                                    </button>
                                                                                )}
                                                                            </div>
                                                                        </td>
                                                                    )}
                                                                </tr>
                                                            ))
                                                    ) : (
                                                        <tr>
                                                            <td colSpan={isRestrictedUser ? 10 : 11} className="px-2 py-6 text-center text-black">
                                                                <div className="flex flex-col items-center gap-1">
                                                                    <FaUsers className="w-5 h-5 text-gray-300" />
                                                                    <p className="text-xs">No employees found</p>
                                                                    {searchTerm && (
                                                                        <button
                                                                            onClick={() => setSearchTerm('')}
                                                                            className="text-[#2f3192] hover:text-[#3a5885] text-xs font-medium"
                                                                        >
                                                                            Clear search
                                                                        </button>
                                                                    )}
                                                                </div>
                                                            </td>
                                                        </tr>
                                                    )}
                                                    {visibleEmployeeCount < filteredEmployees.length && (
                                                        <tr ref={employeeLoadMoreRef}>
                                                            <td colSpan={isRestrictedUser ? 10 : 11} className="py-3 text-center text-xs text-gray-400">
                                                                Loading more... ({visibleEmployeeCount}/{filteredEmployees.length})
                                                            </td>
                                                        </tr>
                                                    )}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                </>
                            )}

                            {activeAdminTab === 'queries' && (
                                <AdminQueries
                                    user={user}
                                    showToast={showToast}
                                    onUnresolvedCount={(count) => {
                                        setUnresolvedQueryCount(count);
                                        if (count > 0 && !hasShownUnresolvedToast && showQueryCount) {
                                            showToast('info', `You have ${count} unresolved employee quer${count > 1 ? 'ies' : 'y'}.`);
                                            setHasShownUnresolvedToast(true);
                                        }
                                    }}
                                />
                            )}

                            {activeAdminTab === 'cdb-update' && canViewCDBUpdate && (
                                <CDBUpdateTable user={user} showToast={showToast} />
                            )}
                        </div>
                    </div>
                )}
            </main>

            {/* Add Employee Modal */}
            {showAddModal && (isMasterAdmin || isITAdmin) && (
                <div className="fixed inset-0 backdrop-blur-sm bg-black/30 flex items-center justify-center p-4 z-50">
                    <div className="bg-white rounded-xl p-5 max-w-md w-full shadow-2xl max-h-[90vh] overflow-y-auto">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="text-base sm:text-lg font-semibold text-black flex items-center space-x-2">
                                <FaUserPlus className="text-[#2f3192]" />
                                <span>Add New Employee</span>
                            </h3>
                            <button
                                onClick={() => setShowAddModal(false)}
                                className="text-black hover:text-gray-600 transition-colors p-1"
                            >
                                <FaTimes />
                            </button>
                        </div>

                        <form onSubmit={handleAddEmployee} className="space-y-3">
                            <div>
                                <label className="block text-xs text-black mb-1">Full Name</label>
                                <div className="relative">
                                    <FaUser className="absolute left-3 top-1/2 transform -translate-y-1/2 text-black text-xs" />
                                    <input
                                        type="text"
                                        required
                                        placeholder="Enter full name"
                                        value={formData.name}
                                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                        className="w-full pl-8 pr-3 py-1.5 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#2f3192] focus:border-transparent text-black"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs text-black mb-1">User ID (min 8 characters)</label>
                                <div className="relative">
                                    <FaIdCard className="absolute left-3 top-1/2 transform -translate-y-1/2 text-black text-xs" />
                                    <input
                                        type="text"
                                        required
                                        minLength="8"
                                        placeholder="Enter user ID"
                                        value={formData.user_id}
                                        onChange={(e) => setFormData({ ...formData, user_id: e.target.value })}
                                        className="w-full pl-8 pr-3 py-1.5 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#2f3192] focus:border-transparent text-black"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs text-black mb-1">Branch Code</label>
                                <div className="relative">
                                    <FaBuilding className="absolute left-3 top-1/2 transform -translate-y-1/2 text-black text-xs" />
                                    <input
                                        type="text"
                                        required
                                        placeholder="Enter branch code"
                                        value={formData.branch}
                                        onChange={(e) => setFormData({ ...formData, branch: e.target.value })}
                                        className="w-full pl-8 pr-3 py-1.5 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#2f3192] focus:border-transparent text-black"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs text-black mb-1">Branch Name</label>
                                <div className="relative">
                                    <FaBuilding className="absolute left-3 top-1/2 transform -translate-y-1/2 text-black text-xs" />
                                    <input
                                        type="text"
                                        placeholder="Enter branch name"
                                        value={formData.branch_name}
                                        onChange={(e) => setFormData({ ...formData, branch_name: e.target.value })}
                                        className="w-full pl-8 pr-3 py-1.5 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#2f3192] focus:border-transparent text-black"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs text-black mb-1">Mobile Number</label>
                                <div className="relative">
                                    <FaPhone className="absolute left-3 top-1/2 transform -translate-y-1/2 text-black text-xs" />
                                    <input
                                        type="tel"
                                        placeholder="Enter mobile number"
                                        value={formData.mobile_number}
                                        onChange={(e) => setFormData({ ...formData, mobile_number: e.target.value })}
                                        className="w-full pl-8 pr-3 py-1.5 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#2f3192] focus:border-transparent text-black"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs text-black mb-1">Password (min 6 characters)</label>
                                <div className="relative">
                                    <FaKey className="absolute left-3 top-1/2 transform -translate-y-1/2 text-black text-xs" />
                                    <input
                                        type={showPassword.add ? "text" : "password"}
                                        required
                                        placeholder="Enter password"
                                        value={formData.password}
                                        onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                                        className="w-full pl-8 pr-8 py-1.5 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#2f3192] focus:border-transparent text-black"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowPassword({ ...showPassword, add: !showPassword.add })}
                                        className="absolute right-3 top-1/2 transform -translate-y-1/2 text-black hover:text-gray-600"
                                    >
                                        {showPassword.add ? <FaEyeSlash className="text-xs" /> : <FaEye className="text-xs" />}
                                    </button>
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs text-black mb-1">Role</label>
                                <div className="relative">
                                    <FaUserTie className="absolute left-3 top-1/2 transform -translate-y-1/2 text-black text-xs" />
                                    <select
                                        value={formData.role}
                                        onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                                        className="w-full pl-8 pr-8 py-1.5 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#2f3192] focus:border-transparent appearance-none bg-white text-black"
                                    >
                                        {getAvailableRoles().map(role => (
                                            <option key={role.value} value={role.value}>
                                                {role.label}
                                            </option>
                                        ))}
                                    </select>
                                    <FaChevronDown className="absolute right-3 top-1/2 transform -translate-y-1/2 text-black text-xs pointer-events-none" />
                                </div>
                            </div>

                            <div className="flex flex-col sm:flex-row space-y-2 sm:space-y-0 sm:space-x-2 pt-2">
                                <button
                                    type="submit"
                                    disabled={loading}
                                    className="w-full sm:flex-1 bg-[#2f3192] hover:bg-[#3a5885] text-white py-1.5 rounded-lg text-xs transition-colors disabled:opacity-50 flex items-center justify-center space-x-2"
                                >
                                    <FaPlus className="text-xs" />
                                    <span>{loading ? 'Adding...' : 'Add Employee'}</span>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setShowAddModal(false)}
                                    className="w-full sm:flex-1 bg-gray-100 hover:bg-gray-200 text-black py-1.5 rounded-lg text-xs transition-colors flex items-center justify-center space-x-2"
                                >
                                    <FaTimes className="text-xs" />
                                    <span>Cancel</span>
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Edit Employee Modal */}
            {editingUser && (
                <div className="fixed inset-0 backdrop-blur-sm bg-black/30 flex items-center justify-center p-4 z-50">
                    <div className="bg-white rounded-xl p-5 max-w-4xl w-full shadow-2xl max-h-[90vh] overflow-y-auto">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="text-base sm:text-lg font-semibold text-black flex items-center space-x-2">
                                <FaEdit className="text-[#2f3192]" />
                                <span>Edit Employee</span>
                            </h3>
                            <button
                                onClick={() => setEditingUser(null)}
                                className="text-black hover:text-gray-600 transition-colors p-1"
                            >
                                <FaTimes />
                            </button>
                        </div>

                        <form onSubmit={handleUpdateEmployee}>
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                <div className="space-y-4">
                                    <div>
                                        <label className="block text-xs text-black mb-1">Full Name</label>
                                        <div className="relative">
                                            <FaUser className="absolute left-3 top-1/2 transform -translate-y-1/2 text-black text-xs" />
                                            <input
                                                type="text"
                                                required
                                                value={editingUser.name || ''}
                                                onChange={(e) => setEditingUser({ ...editingUser, name: e.target.value })}
                                                className="w-full pl-8 pr-3 py-1.5 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#2f3192] focus:border-transparent text-black"
                                            />
                                        </div>
                                    </div>

                                    <div>
                                        <label className="block text-xs text-black mb-1">User ID</label>
                                        <div className="relative">
                                            <FaIdCard className="absolute left-3 top-1/2 transform -translate-y-1/2 text-black text-xs" />
                                            <input
                                                type="text"
                                                value={editingUser.user_id || ''}
                                                disabled
                                                className="w-full pl-8 pr-3 py-1.5 text-xs border border-gray-300 rounded-lg bg-gray-50 text-black"
                                            />
                                        </div>
                                    </div>

                                    <div>
                                        <label className="block text-xs text-black mb-1">Branch Code</label>
                                        <div className="relative">
                                            <FaBuilding className="absolute left-3 top-1/2 transform -translate-y-1/2 text-black text-xs" />
                                            <input
                                                type="text"
                                                required
                                                value={editingUser.branch || ''}
                                                onChange={(e) => setEditingUser({ ...editingUser, branch: e.target.value })}
                                                className="w-full pl-8 pr-3 py-1.5 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#2f3192] focus:border-transparent text-black"
                                                placeholder="Enter branch code"
                                            />
                                        </div>
                                    </div>

                                    <div>
                                        <label className="block text-xs text-black mb-1">Branch Name</label>
                                        <div className="relative">
                                            <FaBuilding className="absolute left-3 top-1/2 transform -translate-y-1/2 text-black text-xs" />
                                            <input
                                                type="text"
                                                value={editingUser.branch_name || ''}
                                                onChange={(e) => setEditingUser({ ...editingUser, branch_name: e.target.value })}
                                                className="w-full pl-8 pr-3 py-1.5 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#2f3192] focus:border-transparent text-black"
                                                placeholder="Enter branch name"
                                            />
                                        </div>
                                    </div>

                                    <div>
                                        <label className="block text-xs text-black mb-1">Mobile Number</label>
                                        <div className="relative">
                                            <FaPhone className="absolute left-3 top-1/2 transform -translate-y-1/2 text-black text-xs" />
                                            <input
                                                type="tel"
                                                placeholder="Enter mobile number"
                                                value={editingUser.mobile_number || ''}
                                                onChange={(e) => setEditingUser({ ...editingUser, mobile_number: e.target.value })}
                                                className="w-full pl-8 pr-3 py-1.5 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#2f3192] focus:border-transparent text-black"
                                            />
                                        </div>
                                    </div>

                                    <div>
                                        <label className="block text-xs text-black mb-1">New Password (leave blank to keep current)</label>
                                        <div className="relative">
                                            <FaKey className="absolute left-3 top-1/2 transform -translate-y-1/2 text-black text-xs" />
                                            <input
                                                type={showPassword.edit ? "text" : "password"}
                                                placeholder="Enter new password"
                                                value={editingUser.password || ''}
                                                onChange={(e) => setEditingUser({ ...editingUser, password: e.target.value })}
                                                className="w-full pl-8 pr-8 py-1.5 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#2f3192] focus:border-transparent text-black"
                                            />
                                            <button
                                                type="button"
                                                onClick={() => setShowPassword({ ...showPassword, edit: !showPassword.edit })}
                                                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-black hover:text-gray-600"
                                            >
                                                {showPassword.edit ? <FaEyeSlash className="text-xs" /> : <FaEye className="text-xs" />}
                                            </button>
                                        </div>
                                    </div>
                                </div>

                                <div className="space-y-4">
                                    <div>
                                        <label className="block text-xs text-black mb-1">Role</label>
                                        <div className="relative">
                                            <FaUserTie className="absolute left-3 top-1/2 transform -translate-y-1/2 text-black text-xs" />
                                            <select
                                                value={editingUser.role || 'employee'}
                                                onChange={(e) => setEditingUser({ ...editingUser, role: e.target.value })}
                                                className="w-full pl-8 pr-8 py-1.5 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#2f3192] focus:border-transparent appearance-none bg-white text-black"
                                            >
                                                {getAvailableRoles().map(role => (
                                                    <option
                                                        key={role.value}
                                                        value={role.value}
                                                        disabled={role.value === 'it_admin'}
                                                        style={role.value === 'it_admin' ? { color: '#9ca3af' } : {}}
                                                    >
                                                        {role.label}
                                                    </option>
                                                ))}
                                            </select>
                                            <FaChevronDown className="absolute right-3 top-1/2 transform -translate-y-1/2 text-black text-xs pointer-events-none" />
                                        </div>
                                    </div>

                                    {(isMasterAdmin || isITAdmin) && editingUser.role === 'branch_admin' && (
                                        <div className="border-t pt-4 mt-2">
                                            <h4 className="text-xs font-semibold text-black mb-2 flex items-center space-x-2">
                                                <FaBuilding className="text-[#2f3192]" />
                                                <span>Branch Access</span>
                                            </h4>

                                            <div className="space-y-2 mb-3 max-h-40 overflow-y-auto">
                                                {editingUserBranches.map(b => (
                                                    <div key={b.id} className="flex items-center justify-between bg-gray-50 px-2 py-1.5 rounded-lg">
                                                        <div className="text-xs text-black flex items-center gap-2">
                                                            {b.is_primary && <span className="text-yellow-500">★</span>}
                                                            <span className="font-medium">{b.branch_name}</span>
                                                            <span className="text-gray-500">({b.branch})</span>
                                                        </div>
                                                        <div className="flex gap-1">
                                                            {!b.is_primary && (
                                                                <button type="button" onClick={() => handleSetPrimary(b.branch)}
                                                                    className="text-xs px-2 py-0.5 bg-blue-100 text-blue-700 hover:bg-blue-200 rounded">
                                                                    Set Primary
                                                                </button>
                                                            )}
                                                            {!b.is_primary && (
                                                                <button type="button" onClick={() => handleRemoveBranch(b.id)}
                                                                    className="text-xs px-2 py-0.5 bg-red-100 text-red-700 hover:bg-red-200 rounded">
                                                                    <FaTrash className="text-xs" />
                                                                </button>
                                                            )}
                                                        </div>
                                                    </div>
                                                ))}
                                                {editingUserBranches.length === 0 && (
                                                    <p className="text-xs text-gray-500">No branch access entries.</p>
                                                )}
                                            </div>

                                            <div className="relative">
                                                <FaBuilding className="absolute left-3 top-1/2 transform -translate-y-1/2 text-black text-xs" />
                                                <select
                                                    value={newBranchInput.branch}
                                                    onChange={(e) => {
                                                        const code = e.target.value;
                                                        setNewBranchInput({
                                                            branch: code,
                                                            branch_name: BRANCH_OPTIONS[code] || ''
                                                        });
                                                    }}
                                                    className="w-full pl-8 pr-8 py-1.5 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-[#2f3192] appearance-none bg-white text-black"
                                                >
                                                    <option value="">-- Select a branch to add --</option>
                                                    {Object.entries(BRANCH_OPTIONS)
                                                        .filter(([code]) => !editingUserBranches.some(b => b.branch === code))
                                                        .map(([code, name]) => (
                                                            <option key={code} value={code}>
                                                                {name} ({code})
                                                            </option>
                                                        ))}
                                                </select>
                                                <FaChevronDown className="absolute right-3 top-1/2 transform -translate-y-1/2 text-black text-xs pointer-events-none" />
                                            </div>
                                            <button
                                                type="button"
                                                onClick={handleAddBranch}
                                                disabled={!newBranchInput.branch}
                                                className={`mt-2 w-full bg-[#2f3192] hover:bg-[#3a5885] text-white text-xs py-1 rounded-lg flex items-center justify-center gap-1 ${!newBranchInput.branch ? 'opacity-50 cursor-not-allowed' : ''}`}
                                            >
                                                <FaPlus className="text-xs" /> Add Branch Access
                                            </button>
                                        </div>
                                    )}

                                    <div className="space-y-3 pt-2">
                                        <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                                            <div className="flex items-center space-x-3">
                                                <FaBan className={`text-sm ${editingUser.is_blocked ? 'text-red-500' : 'text-gray-400'}`} />
                                                <div>
                                                    <p className="text-xs font-medium text-black">Block Status</p>
                                                    <p className="text-xs text-black">Prevent user from accessing the system</p>
                                                </div>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => handleToggleBlock(editingUser.id, editingUser.is_blocked)}
                                                disabled={loading}
                                                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${editingUser.is_blocked
                                                    ? 'bg-green-100 text-green-700 hover:bg-green-200'
                                                    : 'bg-red-100 text-red-700 hover:bg-red-200'
                                                    } ${loading ? 'opacity-50 cursor-not-allowed' : ''}`}
                                            >
                                                {editingUser.is_blocked ? 'Unblock' : 'Block'}
                                            </button>
                                        </div>

                                        {canGrantExport && editingUser.user_id !== MASTER_ADMIN_ID && editingUser.user_id !== user.user_id && (
                                            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                                                <div className="flex items-center space-x-3">
                                                    <FaFileExport className={`text-sm ${editingUser.can_export ? 'text-blue-500' : 'text-gray-400'}`} />
                                                    <div>
                                                        <p className="text-xs font-medium text-black">Export Permission</p>
                                                        <p className="text-xs text-black">Allow user to export data</p>
                                                    </div>
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={() => handleToggleExport(editingUser.id, editingUser.can_export)}
                                                    disabled={loading}
                                                    className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${editingUser.can_export
                                                        ? 'bg-yellow-100 text-yellow-700 hover:bg-yellow-200'
                                                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                                                        } ${loading ? 'opacity-50 cursor-not-allowed' : ''}`}
                                                >
                                                    {editingUser.can_export ? 'Revoke' : 'Grant'}
                                                </button>
                                            </div>
                                        )}

                                        {canGrantExpense && editingUser.user_id !== MASTER_ADMIN_ID && editingUser.user_id !== user.user_id && (
                                            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                                                <div className="flex items-center space-x-3">
                                                    <FaBuilding className={`text-sm ${editingUser.can_access_expense ? 'text-emerald-500' : 'text-gray-400'}`} />
                                                    <div>
                                                        <p className="text-xs font-medium text-black">Expense Access</p>
                                                        <p className="text-xs text-black">Allow user to see Expense pages</p>
                                                    </div>
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={() => handleToggleExpense(editingUser.id, editingUser.can_access_expense)}
                                                    disabled={loading}
                                                    className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${editingUser.can_access_expense
                                                        ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                                                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                                                        } ${loading ? 'opacity-50 cursor-not-allowed' : ''}`}
                                                >
                                                    {editingUser.can_access_expense ? 'Revoke' : 'Grant'}
                                                </button>
                                            </div>
                                        )}

                                        {canDeleteEmployee && editingUser.user_id !== MASTER_ADMIN_ID && editingUser.user_id !== user.user_id && (
                                            <div className="flex items-center justify-between p-3 bg-red-50 rounded-lg border border-red-100">
                                                <div className="flex items-center space-x-3">
                                                    <FaTrash className="text-sm text-red-500" />
                                                    <div>
                                                        <p className="text-xs font-medium text-black">Delete Employee</p>
                                                        <p className="text-xs text-black">Permanently remove this employee</p>
                                                    </div>
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={() => handleDeleteEmployee(editingUser.id, editingUser.name)}
                                                    disabled={loading}
                                                    className="px-2.5 py-1 bg-red-500 hover:bg-red-600 text-white rounded-lg text-xs font-medium transition-colors disabled:opacity-50"
                                                >
                                                    Delete
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>

                            <div className="flex flex-col sm:flex-row space-y-2 sm:space-y-0 sm:space-x-3 pt-6 mt-4 border-t border-gray-200">
                                <button
                                    type="submit"
                                    disabled={loading}
                                    className="w-full sm:flex-1 bg-[#2f3192] hover:bg-[#3a5885] text-white py-1.5 rounded-lg text-xs transition-colors disabled:opacity-50 flex items-center justify-center space-x-2"
                                >
                                    <span>{loading ? 'Updating...' : 'Save Changes'}</span>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setEditingUser(null)}
                                    className="w-full sm:flex-1 bg-gray-100 hover:bg-gray-200 text-black py-1.5 rounded-lg text-xs transition-colors flex items-center justify-center space-x-2"
                                >
                                    <FaTimes className="text-xs" />
                                    <span>Cancel</span>
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Import Employees Modal */}
            {showImportModal && (isMasterAdmin || isITAdmin) && (
                <div className="fixed inset-0 backdrop-blur-sm bg-black/30 flex items-center justify-center p-4 z-50">
                    <div className="bg-white rounded-xl p-5 max-w-md w-full shadow-2xl max-h-[90vh] overflow-y-auto">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="text-base sm:text-lg font-semibold text-black flex items-center space-x-2">
                                <CiImport className="text-[#2f3192]" />
                                <span>Import Employees</span>
                            </h3>
                            <button
                                onClick={() => {
                                    setShowImportModal(false);
                                    setImportFile(null);
                                    setImportErrors([]);
                                }}
                                className="text-black hover:text-gray-600 transition-colors p-1"
                            >
                                <FaTimes />
                            </button>
                        </div>

                        <div className="mb-4">
                            <p className="text-xs text-black mb-2">
                                Upload an Excel or CSV file with the following columns:
                            </p>
                            <div className="bg-gray-50 p-2.5 rounded-lg text-xs overflow-x-auto">
                                <p className="font-mono whitespace-nowrap">ECode, EmpName, Branch Code, Branch Name, Sim Number</p>
                            </div>
                        </div>

                        <div className="space-y-4">
                            <div className="border-2 border-dashed border-gray-300 rounded-lg p-4 text-center">
                                <input
                                    type="file"
                                    accept=".xlsx,.xls,.csv"
                                    onChange={handleImportFileChange}
                                    className="hidden"
                                    id="import-file"
                                />
                                <label
                                    htmlFor="import-file"
                                    className="cursor-pointer flex flex-col items-center"
                                >
                                    <FaUpload className="text-black text-2xl mb-2" />
                                    <span className="text-xs text-black font-medium break-all text-center">
                                        {importFile ? importFile.name : 'Click to select file'}
                                    </span>
                                    {!importFile && (
                                        <span className="text-xs text-black mt-1">
                                            Excel or CSV only
                                        </span>
                                    )}
                                </label>
                            </div>

                            {previewData.length > 0 && (
                                <div className="mt-4 border border-gray-200 rounded-lg overflow-auto max-h-48">
                                    <p className="text-xs font-semibold text-black px-3 py-2 bg-gray-50">
                                        File Preview
                                    </p>

                                    <table className="min-w-full text-xs">
                                        <tbody>
                                            {previewData.map((row, rowIndex) => (
                                                <tr key={rowIndex} className="border-t">
                                                    {row.map((cell, cellIndex) => (
                                                        <td
                                                            key={cellIndex}
                                                            className="px-2 py-1 border-r whitespace-nowrap text-black"
                                                        >
                                                            {cell}
                                                        </td>
                                                    ))}
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}

                            {importErrors.length > 0 && (
                                <div className="bg-red-50 border border-red-200 rounded-lg p-3 max-h-40 overflow-y-auto">
                                    <p className="text-xs font-medium text-red-800 mb-2">Import Errors:</p>
                                    {importErrors.map((error, index) => (
                                        <p key={index} className="text-xs text-red-600 mb-1 break-words">• {error}</p>
                                    ))}
                                </div>
                            )}

                            <div className="flex flex-col sm:flex-row space-y-2 sm:space-y-0 sm:space-x-2">
                                <button
                                    type="button"
                                    onClick={processImportFile}
                                    disabled={!importFile || importing}
                                    className={`w-full sm:flex-1 bg-purple-500 hover:bg-purple-600 text-white py-1.5 rounded-lg text-xs transition-colors flex items-center justify-center space-x-2 ${(!importFile || importing) ? 'opacity-50 cursor-not-allowed' : ''
                                        }`}
                                >
                                    {importing ? (
                                        <>
                                            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                                            <span>Importing...</span>
                                        </>
                                    ) : (
                                        <>
                                            <CiImport className="text-xs" />
                                            <span>Import</span>
                                        </>
                                    )}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setShowImportModal(false);
                                        setImportFile(null);
                                        setImportErrors([]);
                                    }}
                                    className="w-full sm:flex-1 bg-gray-100 hover:bg-gray-200 text-black py-1.5 rounded-lg text-xs transition-colors"
                                >
                                    Cancel
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {showDeleteDataModal && (
                <DeleteDataModal
                    user={user}
                    showToast={showToast}
                    onClose={() => setShowDeleteDataModal(false)}
                />
            )}

            {/* Banner Management Modal */}
            {showBannerModal && (isMasterAdmin || isITAdmin || isBranchAdmin) && (
                <div className="fixed inset-0 backdrop-blur-sm bg-black/30 flex items-center justify-center p-4 z-50">
                    <div className="bg-white rounded-xl p-5 max-w-4xl w-full shadow-2xl max-h-[90vh] overflow-y-auto">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="text-base sm:text-lg font-semibold text-black flex items-center space-x-2">
                                <FaImage className="text-[#2f3192]" />
                                <span>Manage Banners</span>
                            </h3>
                            <button
                                onClick={() => {
                                    setShowBannerModal(false);
                                    setBannerFiles({ banner1: null, banner2: null, banner3: null });
                                    const previews = {};
                                    banners.forEach(banner => {
                                        previews[`banner${banner.position}`] = `${API_BASE_URL}${banner.image_url}`;
                                    });
                                    setBannerPreviews(previews);
                                }}
                                className="text-black hover:text-gray-600 transition-colors p-1"
                            >
                                <FaTimes />
                            </button>
                        </div>

                        <p className="text-xs text-black mb-5">
                            Upload banner images (JPG or PNG only). You can upload up to 3 banners.
                            Uploading a new image will replace the existing one.
                        </p>

                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-5">
                            {[1, 2, 3].map((position) => {
                                const bannerKey = `banner${position}`;
                                const hasPreview = bannerPreviews[bannerKey];

                                return (
                                    <div key={position} className="border border-gray-200 rounded-lg p-3">
                                        <label className="block text-xs font-medium text-black mb-2">
                                            Banner {position}
                                        </label>

                                        <div className="relative">
                                            {hasPreview ? (
                                                <div className="relative group">
                                                    <img
                                                        src={bannerPreviews[bannerKey]}
                                                        alt={`Banner ${position}`}
                                                        className="w-full h-32 object-cover rounded-lg border-2 border-gray-200"
                                                        onError={(e) => {
                                                            e.target.src = 'https://via.placeholder.com/300x150?text=No+Image';
                                                        }}
                                                    />

                                                    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center rounded-lg">
                                                        <label className="cursor-pointer bg-[#2f3192] hover:bg-[#3a5885] text-white px-3 py-1.5 rounded-lg text-xs font-medium transition-colors">
                                                            Change
                                                            <input
                                                                type="file"
                                                                accept=".jpg,.jpeg,.png"
                                                                onChange={(e) => {
                                                                    const file = e.target.files[0];
                                                                    if (file) {
                                                                        handleBannerFileChange(bannerKey, file);
                                                                    }
                                                                }}
                                                                className="hidden"
                                                            />
                                                        </label>
                                                    </div>

                                                    <div className="absolute top-2 left-2 bg-green-500 text-white text-xs px-1.5 py-0.5 rounded-full">
                                                        Current
                                                    </div>
                                                </div>
                                            ) : (
                                                <label className="flex flex-col items-center justify-center h-32 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-[#2f3192] hover:bg-gray-50 transition-all">
                                                    <FaImage className="text-black text-2xl mb-2" />
                                                    <span className="text-xs text-black font-medium text-center px-2">Click to upload</span>
                                                    <span className="text-xs text-black mt-1 text-center px-2">JPG or PNG only</span>
                                                    <input
                                                        type="file"
                                                        accept=".jpg,.jpeg,.png"
                                                        onChange={(e) => {
                                                            const file = e.target.files[0];
                                                            if (file) {
                                                                handleBannerFileChange(bannerKey, file);
                                                            }
                                                        }}
                                                        className="hidden"
                                                    />
                                                </label>
                                            )}
                                        </div>

                                        {bannerFiles[bannerKey] && (
                                            <div className="mt-2 flex items-center justify-between bg-blue-50 p-1.5 rounded-lg">
                                                <span className="text-xs text-blue-700 truncate max-w-[120px]">
                                                    {bannerFiles[bannerKey].name}
                                                </span>
                                                <button
                                                    onClick={() => {
                                                        setBannerFiles({ ...bannerFiles, [bannerKey]: null });
                                                        const originalBanner = banners.find(b => b.position === position);
                                                        if (originalBanner) {
                                                            setBannerPreviews({
                                                                ...bannerPreviews,
                                                                [bannerKey]: `${API_BASE_URL}${originalBanner.image_url}`
                                                            });
                                                        }
                                                    }}
                                                    className="text-red-500 hover:text-red-700 p-1"
                                                >
                                                    <FaTimes className="text-xs" />
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>

                        {Object.values(bannerFiles).some(file => file !== null) && (
                            <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                                <p className="text-xs text-yellow-700 flex items-center">
                                    <FaExclamationCircle className="mr-2 flex-shrink-0" />
                                    <span>You have selected new images. Click "Upload" to save changes.</span>
                                </p>
                            </div>
                        )}

                        <div className="flex flex-col-reverse sm:flex-row justify-end space-y-2 space-y-reverse sm:space-y-0 sm:space-x-3 border-t border-gray-200 pt-4">
                            <button
                                type="button"
                                onClick={() => {
                                    setShowBannerModal(false);
                                    setBannerFiles({ banner1: null, banner2: null, banner3: null });
                                    fetchBanners();
                                }}
                                className="w-full sm:w-auto px-4 py-1.5 text-xs text-black hover:text-gray-800 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={handleUploadBanners}
                                disabled={uploadingBanner || !Object.values(bannerFiles).some(file => file !== null)}
                                className={`w-full sm:w-auto px-4 py-1.5 text-xs bg-[#2f3192] hover:bg-[#3a5885] text-white rounded-lg transition-colors flex items-center justify-center space-x-2 ${(uploadingBanner || !Object.values(bannerFiles).some(file => file !== null))
                                    ? 'opacity-50 cursor-not-allowed'
                                    : ''
                                    }`}
                            >
                                {uploadingBanner ? (
                                    <>
                                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                                        <span>Uploading...</span>
                                    </>
                                ) : (
                                    <>
                                        <FaSave className="text-xs" />
                                        <span>Upload Banners</span>
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <style jsx>{`
    @keyframes slideIn {
        from {
            opacity: 0;
            transform: translateX(20px);
        }
        to {
            opacity: 1;
            transform: translateX(0);
        }
    }
    
    @keyframes slideDown {
        from {
            opacity: 0;
            transform: translateY(-10px);
        }
        to {
            opacity: 1;
            transform: translateY(0);
        }
    }
    
    @keyframes fadeIn {
        from {
            opacity: 0;
            transform: translateY(-10px);
        }
        to {
            opacity: 1;
            transform: translateY(0);
        }
    }
    
    @keyframes slideUp {
        from {
            opacity: 0;
            transform: translateY(20px);
        }
        to {
            opacity: 1;
            transform: translateY(0);
        }
    }
    
    @keyframes pulse {
        0%, 100% {
            opacity: 1;
        }
        50% {
            opacity: 0.5;
        }
    }
    
    .animate-slideIn {
        animation: slideIn 0.2s ease-out;
    }
    
    .animate-slideDown {
        animation: slideDown 0.2s ease-out;
    }
    
    .animate-fadeIn {
        animation: fadeIn 0.2s ease-out;
    }
    
    .animate-slideUp {
        animation: slideUp 0.2s ease-out;
    }
    
    .animate-spin {
        animation: spin 1s linear infinite;
    }
    
    .animate-pulse {
        animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
    }

    @keyframes spin {
        from {
            transform: rotate(0deg);
        }
        to {
            transform: rotate(360deg);
        }
    }

    /* Custom scrollbar styling for CDB Update table container */
    #cdb-table-container::-webkit-scrollbar {
        height: 2px;
        width: 6px;
    }
    
    #cdb-table-container::-webkit-scrollbar-track {
        background: #f1f1f1;
        border-radius: 3px;
    }
    
    #cdb-table-container::-webkit-scrollbar-thumb {
        background: #c1c1c1;
        border-radius: 3px;
    }
    
    #cdb-table-container::-webkit-scrollbar-thumb:hover {
        background: #a8a8a8;
    }
    
    /* For Firefox - CDB Update table */
    #cdb-table-container {
        scrollbar-width: thin;
        scrollbar-color: #c1c1c1 #f1f1f1;
    }
    
    /* Custom scrollbar styling for Employees table container */
    #employees-table-container::-webkit-scrollbar {
        height: 2px;
        width: 6px;
    }
    
    #employees-table-container::-webkit-scrollbar-track {
        background: #f1f1f1;
        border-radius: 3px;
    }
    
    #employees-table-container::-webkit-scrollbar-thumb {
        background: #c1c1c1;
        border-radius: 3px;
    }
    
    #employees-table-container::-webkit-scrollbar-thumb:hover {
        background: #a8a8a8;
    }
    
    /* For Firefox - Employees table */
    #employees-table-container {
        scrollbar-width: thin;
        scrollbar-color: #c1c1c1 #f1f1f1;
    }

    @media (max-width: 640px) {
        .overflow-x-auto {
            -webkit-overflow-scrolling: touch;
        }
        
        input, select, textarea, button {
            font-size: 16px !important;
        }
    }

    @media (hover: none) and (pointer: coarse) {
        .hover\\:bg-gray-50:active {
            background-color: #f9fafb;
        }
        
        .hover\\:bg-\\[\\#2f3192\\]\\/10:active {
            background-color: rgba(64, 96, 147, 0.1);
        }
    }
`}</style>
        </div>
    );
};

export default Profile;