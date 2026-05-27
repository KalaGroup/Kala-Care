import React, { useState, useEffect } from 'react';
import axios from 'axios';
import Swal from 'sweetalert2';
import {
    FaPaperPlane, FaHistory, FaTimes, FaTrash, FaClock, FaExclamationCircle
} from 'react-icons/fa';

const API_BASE_URL = import.meta.env.VITE_BACKEND_URL;

const EmpQuery = ({ user, onClose, showToast }) => {
    const [subject, setSubject] = useState('');
    const [query, setQuery] = useState('');
    const [loading, setLoading] = useState(false);
    const [myQueries, setMyQueries] = useState([]);
    const [showMyQueries, setShowMyQueries] = useState(false);
    const [fetchingQueries, setFetchingQueries] = useState(false);

    useEffect(() => {
        if (showMyQueries && user) fetchMyQueries();
    }, [showMyQueries]);

    const fetchMyQueries = async () => {
        setFetchingQueries(true);
        try {
            const response = await axios.get(`${API_BASE_URL}/queries/my-queries`, {
                headers: { 'user-id': user.user_id, 'user-role': user.role }
            });
            if (response.data.success) setMyQueries(response.data.queries);
        } catch (err) {
            console.error('Error fetching queries:', err);
            Swal.fire('Error!', 'Failed to load your queries', 'error');
        } finally {
            setFetchingQueries(false);
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!subject.trim() || !query.trim()) {
            Swal.fire('Error!', 'Please fill in both subject and query', 'error');
            return;
        }
        setLoading(true);
        try {
            const response = await axios.post(
                `${API_BASE_URL}/queries/create`,
                { subject, query },
                { headers: { 'user-id': user.user_id, 'user-name': user.name, 'user-role': user.role, 'Content-Type': 'application/json' } }
            );
            if (response.data.success) {
                await Swal.fire('Success!', 'Query submitted successfully!', 'success');
                setSubject('');
                setQuery('');
                if (showMyQueries) fetchMyQueries();
            }
        } catch (err) {
            Swal.fire('Error!', err.response?.data?.detail || 'Failed to submit query', 'error');
        } finally {
            setLoading(false);
        }
    };

    const handleDeleteMyQuery = async (queryId) => {
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
                    headers: { 'user-id': user.user_id, 'user-role': user.role }
                });
                if (response.data.success) {
                    await Swal.fire('Deleted!', 'Query deleted successfully', 'success');
                    fetchMyQueries();
                }
            } catch (err) {
                Swal.fire('Error!', err.response?.data?.detail || 'Failed to delete query', 'error');
            }
        }
    };

    const formatDate = (d) => new Date(d).toLocaleDateString(); // Changed to show only date

    return (
        <div className="bg-white rounded-2xl shadow-lg overflow-hidden border border-gray-200">
            {/* Header */}
            <div className="px-4 py-3 border-b border-gray-200 flex justify-between items-center bg-gradient-to-r from-[#2f3192]/8 to-transparent">
                <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-[#2f3192]/15 flex items-center justify-center">
                        <FaPaperPlane className="text-[#2f3192] text-sm" />
                    </div>
                    <div>
                        <h3 className="text-sm font-bold text-black">Submit a Query</h3>
                        <p className="text-xs text-black">We'll get back to you soon</p>
                    </div>
                </div>
                <div className="flex items-center gap-1.5">
                    <button
                        onClick={() => setShowMyQueries(!showMyQueries)}
                        className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold bg-gray-100 hover:bg-gray-200 text-black rounded-lg transition-colors"
                    >
                        <FaHistory className="text-[11px]" />
                        {showMyQueries ? 'New Query' : 'My History'}
                    </button>
                    {onClose && (
                        <button onClick={onClose} className="p-1 text-black hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
                            <FaTimes className="text-sm" />
                        </button>
                    )}
                </div>
            </div>

            <div className="p-4">
                {!showMyQueries ? (
                    /* New Query Form */
                    <form onSubmit={handleSubmit} className="space-y-3.5">
                        <div>
                            <label className="block text-xs font-bold text-black uppercase tracking-wide mb-1">Subject</label>
                            <input
                                type="text"
                                value={subject}
                                onChange={e => setSubject(e.target.value)}
                                placeholder="Brief topic of your query"
                                className="w-full px-3 py-2 text-xs border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#2f3192]/30 focus:border-[#2f3192] bg-gray-50/50 placeholder-black transition-all text-black"
                                maxLength="200"
                                required
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-black uppercase tracking-wide mb-1">Query Details</label>
                            <textarea
                                value={query}
                                onChange={e => setQuery(e.target.value)}
                                placeholder="Describe your query in detail…"
                                rows="4"
                                className="w-full px-3 py-2 text-xs border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#2f3192]/30 focus:border-[#2f3192] bg-gray-50/50 placeholder-black resize-none transition-all text-black"
                                required
                            />
                        </div>
                        <div className="flex justify-end">
                            <button
                                type="submit"
                                disabled={loading}
                                className="flex items-center gap-1.5 text-white px-2 py-1 rounded-xl text-xs font-semibold transition-all hover:opacity-90 active:scale-95 disabled:opacity-50 shadow-sm"
                                style={{ backgroundColor: '#2f3192', boxShadow: '0 4px 14px rgba(64,96,147,0.35)' }}
                            >
                                {loading ? (
                                    <><div className="w-3.5 h-3.5 rounded-full border-2 border-white/40 border-t-white animate-spin" /><span>Submitting…</span></>
                                ) : (
                                    <><FaPaperPlane className="text-xs" /><span>Submit Query</span></>
                                )}
                            </button>
                        </div>
                    </form>
                ) : (
                    /* Query History */
                    <div>
                        {fetchingQueries ? (
                            <div className="flex justify-center items-center py-8">
                                <div className="w-7 h-7 rounded-full border-3 border-gray-200 border-t-[#2f3192] animate-spin" />
                            </div>
                        ) : myQueries.length > 0 ? (
                            <div className="space-y-2.5 max-h-96 overflow-y-auto pr-1">
                                {myQueries.map(q => (
                                    <div key={q.id} className="border border-gray-300 rounded-xl p-3 hover:shadow-sm transition-shadow bg-white">
                                        <div className="flex justify-between items-start mb-1.5">
                                            <div className="flex-1 min-w-0">
                                                <h4 className="text-sm font-semibold text-black flex items-center gap-1.5 flex-wrap">
                                                    {q.subject}
                                                    {q.is_resolved && (
                                                        <span className="px-1.5 py-0.5 bg-emerald-100 text-emerald-700 text-xs rounded-full font-bold">✓ Resolved</span>
                                                    )}
                                                </h4>
                                                <p className="text-xs text-black flex items-center gap-0.5 mt-0.5">
                                                    {formatDate(q.created_at)}
                                                </p>
                                            </div>
                                            <button
                                                onClick={() => handleDeleteMyQuery(q.id)}
                                                className="ml-1.5 p-1 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors flex-shrink-0"
                                                title="Delete"
                                            >
                                                <FaTrash className="text-xs" />
                                            </button>
                                        </div>
                                        <p className="text-sm text-black bg-gray-50 p-2 rounded-lg leading-relaxed">{q.query}</p>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="text-center py-8">
                                <FaExclamationCircle className="text-3xl text-gray-400 mx-auto mb-2" />
                                <p className="text-black text-xs font-medium">No queries yet</p>
                                <button
                                    onClick={() => setShowMyQueries(false)}
                                    className="mt-2 text-[#2f3192] hover:text-[#335478] text-xs font-semibold"
                                >
                                    Submit your first query →
                                </button>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

export default EmpQuery;