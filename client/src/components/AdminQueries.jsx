import React, { useState, useEffect } from 'react';
import axios from 'axios';
import Swal from 'sweetalert2';
import {
    FaTrash, FaCheckCircle, FaExclamationCircle,
    FaTimes, FaUser, FaCalendar, FaCheck, FaUndo
} from 'react-icons/fa';

const API_BASE_URL = import.meta.env.VITE_BACKEND_URL;

const AdminQueries = ({ user, onClose, showToast, onUnresolvedCount }) => {
    const [queries, setQueries] = useState([]);
    const [loading, setLoading] = useState(false);
    const [filter, setFilter] = useState('all');

    useEffect(() => {
        fetchAllQueries(true);
    }, []);

    const fetchAllQueries = async (isInitialLoad = true) => {
        setLoading(true);
        try {
            const response = await axios.get(`${API_BASE_URL}/queries/all`, {
                headers: {
                    'user-id': user.user_id,
                    'user-role': user.role
                }
            });

            setQueries(response.data);

            // Send count to parent
            if (onUnresolvedCount) {
                const unresolvedCount = response.data.filter(q => !q.is_resolved).length;
                console.log('Sending unresolved count to parent:', unresolvedCount); // Debug log
                onUnresolvedCount(unresolvedCount);
            }

        } catch (err) {
            console.error('Error fetching queries:', err);
            showToast('error', err.response?.data?.detail || 'Failed to load queries');
        } finally {
            setLoading(false);
        }
    };

    const handleDeleteQuery = async (queryId) => {
        const result = await Swal.fire({
            title: 'Are you sure?',
            text: "You won't be able to revert this!",
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#d33',
            cancelButtonColor: '#3085d6',
            confirmButtonText: 'Yes, delete it!',
            cancelButtonText: 'Cancel'
        });

        if (result.isConfirmed) {
            try {
                const response = await axios.delete(`${API_BASE_URL}/queries/${queryId}`, {
                    headers: {
                        'user-id': user.user_id,
                        'user-role': user.role
                    }
                });

                if (response.data.success) {
                    await Swal.fire(
                        'Deleted!',
                        'Query has been deleted successfully.',
                        'success'
                    );
                    fetchAllQueries(false); // false means not initial load
                }
            } catch (err) {
                Swal.fire(
                    'Error!',
                    err.response?.data?.detail || 'Failed to delete query',
                    'error'
                );
            }
        }
    };

    const handleToggleResolve = async (queryId, currentStatus) => {
        const action = currentStatus ? 'mark as unresolved' : 'resolve';
        const result = await Swal.fire({
            title: `Are you sure?`,
            text: `Do you want to ${action} this query?`,
            icon: 'question',
            showCancelButton: true,
            confirmButtonColor: currentStatus ? '#6c757d' : '#28a745',
            cancelButtonColor: '#d33',
            confirmButtonText: `Yes, ${action} it!`,
            cancelButtonText: 'Cancel'
        });

        if (result.isConfirmed) {
            try {
                const response = await axios.put(
                    `${API_BASE_URL}/queries/${queryId}/toggle-resolve`,
                    {},
                    {
                        headers: {
                            'user-id': user.user_id,
                            'user-role': user.role
                        }
                    }
                );

                if (response.data.success) {
                    await Swal.fire(
                        'Updated!',
                        response.data.message || `Query has been ${action}d successfully.`,
                        'success'
                    );
                    fetchAllQueries(false); // false means not initial load
                }
            } catch (err) {
                Swal.fire(
                    'Error!',
                    err.response?.data?.detail || 'Failed to update query status',
                    'error'
                );
            }
        }
    };

    const formatDate = (dateString) => {
        const date = new Date(dateString);
        return date.toLocaleDateString(); // Changed to show only date
    };

    const filteredQueries = queries.filter(q => {
        if (filter === 'resolved') return q.is_resolved;
        if (filter === 'unresolved') return !q.is_resolved;
        return true;
    });

    const unresolvedCount = queries.filter(q => !q.is_resolved).length;
    const resolvedCount = queries.filter(q => q.is_resolved).length;

    return (
        <div className="bg-white rounded-xl shadow-lg overflow-hidden border border-gray-200">
            {/* Header */}
            <div className="p-3 border-b border-gray-200 bg-gradient-to-r from-[#2f3192]/5 to-transparent flex justify-between items-center">
                <h3 className="text-sm sm:text-base font-semibold text-black flex items-center space-x-1.5">
                    <FaExclamationCircle className="text-[#2f3192] text-sm" />
                    <span>Employee Queries Management</span>
                </h3>
                {unresolvedCount > 0 && (
                    <span className="px-2 py-0.5 bg-red-100 text-red-800 rounded-full text-xs font-medium">
                        {unresolvedCount} Unresolved
                    </span>
                )}
                {onClose && (
                    <button
                        onClick={onClose}
                        className="p-1 text-black hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                    >
                        <FaTimes className="text-xs" />
                    </button>
                )}
            </div>

            {/* Filter Tabs */}
            <div className="px-3 pt-2">
                <div className="flex space-x-1.5">
                    <button
                        onClick={() => setFilter('all')}
                        className={`px-2.5 py-1 text-xs rounded-lg transition-colors flex items-center space-x-1 ${filter === 'all'
                            ? 'bg-[#2f3192] text-white'
                            : 'bg-gray-100 text-black hover:bg-gray-200'
                            }`}
                    >
                        <span>All</span>
                        <span className={`ml-1 px-1 py-0.5 text-[10px] rounded-full ${filter === 'all' ? 'bg-white/20' : 'bg-gray-300'
                            }`}>
                            {queries.length}
                        </span>
                    </button>
                    <button
                        onClick={() => setFilter('unresolved')}
                        className={`px-2.5 py-1 text-xs rounded-lg transition-colors flex items-center space-x-1 ${filter === 'unresolved'
                            ? 'bg-yellow-500 text-white'
                            : 'bg-gray-100 text-black hover:bg-gray-200'
                            }`}
                    >
                        <span>Unresolved</span>
                        {unresolvedCount > 0 && (
                            <span className={`ml-1 px-1 py-0.5 text-[10px] rounded-full ${filter === 'unresolved' ? 'bg-white/20' : 'bg-yellow-200'
                                }`}>
                                {unresolvedCount}
                            </span>
                        )}
                    </button>
                    <button
                        onClick={() => setFilter('resolved')}
                        className={`px-2.5 py-1 text-xs rounded-lg transition-colors flex items-center space-x-1 ${filter === 'resolved'
                            ? 'bg-green-500 text-white'
                            : 'bg-gray-100 text-black hover:bg-gray-200'
                            }`}
                    >
                        <span>Resolved</span>
                        {resolvedCount > 0 && (
                            <span className={`ml-1 px-1 py-0.5 text-[10px] rounded-full ${filter === 'resolved' ? 'bg-white/20' : 'bg-green-200'
                                }`}>
                                {resolvedCount}
                            </span>
                        )}
                    </button>
                </div>
            </div>

            {/* Queries List */}
            <div className="p-3">
                {loading ? (
                    <div className="flex justify-center items-center py-6">
                        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-[#2f3192]"></div>
                    </div>
                ) : filteredQueries.length > 0 ? (
                    <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1">
                        {filteredQueries.map((q) => (
                            <div
                                key={q.id}
                                className={`border rounded-lg p-3 transition-shadow hover:shadow-md ${q.is_resolved ? 'border-green-300 bg-green-50/30' : 'border-gray-300'
                                    }`}
                            >
                                <div className="flex items-start justify-between mb-2">
                                    <div className="flex items-center space-x-2">
                                        <div className="w-7 h-7 rounded-full bg-gradient-to-r from-[#2f3192] to-[#335478] flex items-center justify-center text-white text-xs font-bold">
                                            {q.user_name ? q.user_name.charAt(0).toUpperCase() : 'U'}
                                        </div>
                                        <div>
                                            <p className="text-xs font-medium text-black flex items-center">
                                                {q.user_name || 'Unknown User'}
                                                <span className="ml-1 text-[11px] text-black">
                                                    ({q.user_id || 'N/A'})
                                                </span>
                                            </p>
                                            <p className="text-[11px] text-black flex items-center mt-0.5">
                                                {formatDate(q.created_at)}
                                            </p>
                                        </div>
                                    </div>
                                    <span className={`px-1.5 py-0.5 rounded-full text-[11px] font-medium ${q.is_resolved
                                        ? 'bg-green-100 text-green-700'
                                        : 'bg-yellow-100 text-yellow-700'
                                        }`}>
                                        {q.is_resolved ? 'Resolved' : 'Pending'}
                                    </span>
                                </div>

                                <h4 className="text-xs font-medium text-black mb-1.5">
                                    {q.subject || 'No Subject'}
                                </h4>

                                <p className="text-xs text-black bg-white p-2 rounded-lg border border-gray-200 mb-2.5">
                                    {q.query}
                                </p>

                                <div className="flex justify-end space-x-1.5">
                                    <button
                                        onClick={() => handleToggleResolve(q.id, q.is_resolved)}
                                        className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors flex items-center space-x-1 ${q.is_resolved
                                            ? 'bg-gray-100 text-black hover:bg-gray-200'
                                            : 'bg-green-100 text-green-700 hover:bg-green-200'
                                            }`}
                                    >
                                        {q.is_resolved ? (
                                            <>
                                                <FaUndo className="text-[10px]" />
                                                <span>Mark Unresolved</span>
                                            </>
                                        ) : (
                                            <>
                                                <FaCheck className="text-[10px]" />
                                                <span>Mark Resolved</span>
                                            </>
                                        )}
                                    </button>
                                    <button
                                        onClick={() => handleDeleteQuery(q.id)}
                                        className="px-2.5 py-1 bg-red-100 text-red-700 hover:bg-red-200 rounded-lg text-[11px] font-medium transition-colors flex items-center space-x-1"
                                    >
                                        <FaTrash className="text-[10px]" />
                                        <span>Delete</span>
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="text-center py-6">
                        <FaExclamationCircle className="text-3xl text-gray-400 mx-auto mb-2" />
                        <p className="text-xs text-black">No queries found</p>
                        {filter !== 'all' && (
                            <button
                                onClick={() => setFilter('all')}
                                className="mt-2 text-[#2f3192] hover:text-[#3a5885] text-[11px] font-medium"
                            >
                                Show all queries
                            </button>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

export default AdminQueries;