import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import * as XLSX from 'xlsx';
import { IoClose } from "react-icons/io5";

const themeColor = '#2f3192';
const API_BASE_URL = import.meta.env.VITE_BACKEND_URL;
const MASTER_ADMIN_ID = import.meta.env.VITE_MASTER_ADMIN_ID;

const branchNameMap = {
    'HO': 'Pune Office',
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

const getTodayStr = () => {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
};

const fmtTime = (iso) => {
    if (!iso) return '-';
    try {
        const d = new Date(iso);
        return d.toLocaleString('en-IN', {
            hour: '2-digit', minute: '2-digit', hour12: true,
            day: '2-digit', month: 'short'
        });
    } catch {
        return iso;
    }
};

const EmployeeTime = ({ isOpen, onClose, userData }) => {
    const [loading, setLoading] = useState(false);
    const [rows, setRows] = useState([]);
    const [reportDate, setReportDate] = useState(getTodayStr());
    const [branchFilter, setBranchFilter] = useState('');
    const [searchTerm, setSearchTerm] = useState('');

    const fetchReport = useCallback(async () => {
        if (!isOpen || !userData) return;
        setLoading(true);
        try {
            const params = new URLSearchParams({
                user_id: userData.user_id || userData.id,
                target_date: reportDate,
            });
            if (branchFilter) params.append('branch_code', branchFilter);
            if (searchTerm.trim()) params.append('search', searchTerm.trim());

            const res = await axios.get(
                `${API_BASE_URL}/performance/employee-time-report?${params.toString()}`
            );
            const allRows = res.data?.rows || [];
            setRows(allRows.filter(r => r.user_id !== MASTER_ADMIN_ID));
        } catch (err) {
            console.error('Error fetching time report:', err);
            setRows([]);
        } finally {
            setLoading(false);
        }
    }, [isOpen, userData, reportDate, branchFilter, searchTerm]);

    // Debounce search; immediate for date/branch
    useEffect(() => {
        const t = setTimeout(fetchReport, 300);
        return () => clearTimeout(t);
    }, [fetchReport]);

    const exportToExcel = () => {
        if (!rows.length) return;
        const data = rows.map((r, i) => ({
            'Sr. No.': i + 1,
            'User ID': r.user_id,
            'Employee Name': r.user_name,
            'Branch': r.branch_display,
            'Login Time': fmtTime(r.login_time),
            'Logout Time': r.logout_time ? fmtTime(r.logout_time) : 'Still Active',
            'Logout Type': r.logout_type,
        }));
        const ws = XLSX.utils.json_to_sheet(data);
        ws['!cols'] = [
            { wch: 8 }, { wch: 14 }, { wch: 25 }, { wch: 24 },
            { wch: 20 }, { wch: 20 }, { wch: 12 }
        ];
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Employee Time');
        XLSX.writeFile(wb, `employee_time_${reportDate}.xlsx`);
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-6xl max-h-[90vh] overflow-hidden flex flex-col">
                {/* Header */}
                <div className="flex justify-between items-center px-4 py-3 border-b border-gray-200" style={{ backgroundColor: themeColor }}>
                    <h2 className="text-base font-semibold text-white">Employee Login / Work Time</h2>
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label="Close"
                        className="w-8 h-8 rounded-lg bg-white border border-gray-300
               flex items-center justify-center
               text-gray-700 hover:bg-gray-100 hover:text-black
               transition-all duration-200"
                    >
                        <IoClose size={20} />
                    </button>
                </div>

                {/* Filters */}
                <div className="p-3 border-b border-gray-200 bg-gray-50 flex flex-col sm:flex-row gap-2 sm:items-end flex-wrap">
                    <div>
                        <label className="block text-[11px] font-medium text-gray-600 mb-1">Date</label>
                        <input
                            type="date"
                            value={reportDate}
                            max={getTodayStr()}
                            onChange={(e) => setReportDate(e.target.value)}
                            className="px-2 py-1.5 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#2f3192] text-black"
                        />
                    </div>
                    <div>
                        <label className="block text-[11px] font-medium text-gray-600 mb-1">Branch</label>
                        <select
                            value={branchFilter}
                            onChange={(e) => setBranchFilter(e.target.value)}
                            className="px-2 py-1.5 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#2f3192] bg-white text-black"
                        >
                            <option value="">All Branches</option>
                            {Object.entries(branchNameMap).map(([code, name]) => (
                                <option key={code} value={code}>{name} ({code})</option>
                            ))}
                        </select>
                    </div>
                    <div className="flex-1 min-w-[180px]">
                        <label className="block text-[11px] font-medium text-gray-600 mb-1">Search (ID or Name)</label>
                        <input
                            type="text"
                            placeholder="Search employee..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#2f3192] text-black"
                        />
                    </div>
                    <button
                        onClick={exportToExcel}
                        disabled={!rows.length}
                        className="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white text-xs rounded-lg transition-colors disabled:opacity-50 whitespace-nowrap"
                    >
                        Export to Excel
                    </button>
                </div>

                {/* Table */}
                <div className="flex-1 overflow-auto p-3">
                    {loading ? (
                        <div className="flex justify-center py-12">
                            <div className="w-8 h-8 border-4 border-t-4 border-t-[#2f3192] border-gray-200 rounded-full animate-spin"></div>
                        </div>
                    ) : rows.length === 0 ? (
                        <div className="text-center py-12 text-sm text-gray-500">
                            No login activity found for this date.
                        </div>
                    ) : (
                        <div className="border border-gray-200 rounded-lg overflow-x-auto">
                            <table className="min-w-full border-collapse text-xs">
                                <thead className="bg-gray-50 sticky top-0">
                                    <tr>
                                        {['Sr. No.', 'User ID', 'Employee', 'Branch', 'Login Time', 'Logout Time', 'Type'].map(h => (
                                            <th key={h} className="px-2 py-1.5 text-center font-medium text-black uppercase border border-gray-200 whitespace-nowrap">{h}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody className="bg-white">
                                    {rows.map((r, idx) => (
                                        <tr key={`${r.user_id}-${idx}`} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                                            <td className="px-2 py-1 text-center text-black border border-gray-200">{idx + 1}</td>
                                            <td className="px-2 py-1 text-center text-black border border-gray-200">{r.user_id}</td>
                                            <td className="px-2 py-1 text-left text-black border border-gray-200">{r.user_name}</td>
                                            <td className="px-2 py-1 text-left text-black border border-gray-200">{r.branch_display}</td>
                                            <td className="px-2 py-1 text-center text-black border border-gray-200 whitespace-nowrap">{fmtTime(r.login_time)}</td>
                                            <td className="px-2 py-1 text-center text-black border border-gray-200 whitespace-nowrap">
                                                {r.logout_time ? fmtTime(r.logout_time) : <span className="text-green-600 font-medium">Active</span>}
                                            </td>
                                            <td className="px-2 py-1 text-center border border-gray-200">
                                                <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${r.logout_type === 'auto' ? 'bg-orange-100 text-orange-700'
                                                    : r.logout_type === 'manual' ? 'bg-blue-100 text-blue-700'
                                                        : 'bg-gray-100 text-gray-700'}`}>
                                                    {r.logout_type}
                                                </span>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default EmployeeTime;