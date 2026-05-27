import React, { useState } from 'react';
import { FaTrash, FaTimes, FaExclamationTriangle, FaDownload, FaDatabase, FaUsers, FaHistory, FaQuestionCircle } from 'react-icons/fa';
import Swal from 'sweetalert2';
import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_BACKEND_URL;

const DeleteDataModal = ({ onClose, showToast }) => {
    const [confirmText, setConfirmText] = useState('');
    const [loading, setLoading] = useState(false);
    const [backupLoading, setBackupLoading] = useState(false);
    const [selectedOptions, setSelectedOptions] = useState({
        customerData: false,
        usersData: false,
        updateHistory: false,
        employeeQueries: false
    });

    const dataOptions = [
        {
            id: 'customerData',
            label: 'Customer, Campaign and Followups Data',
            description: 'Remove all customers, campaigns, and follow-up records',
            icon: <FaDatabase className="text-blue-500" />
        },
        {
            id: 'usersData',
            label: 'Users Data',
            description: 'Remove all user accounts except Master Admin',
            icon: <FaUsers className="text-green-500" />
        },
        {
            id: 'updateHistory',
            label: 'Customer Update Data',
            description: 'Remove all customer edit history records',
            icon: <FaHistory className="text-purple-500" />
        },
        {
            id: 'employeeQueries',
            label: 'Employee Query Data',
            description: 'Remove all employee queries and responses',
            icon: <FaQuestionCircle className="text-orange-500" />
        }
    ];

    const handleOptionChange = (optionId) => {
        setSelectedOptions(prev => ({
            ...prev,
            [optionId]: !prev[optionId]
        }));
    };

    const handleBackup = async (optionId) => {
        const option = dataOptions.find(opt => opt.id === optionId);
        if (!option) return;

        setBackupLoading(true);
        try {
            const response = await axios.post(
                `${API_BASE_URL}/admin/backup-data`,
                { dataType: optionId },
                { responseType: 'blob' }
            );

            const url = window.URL.createObjectURL(new Blob([response.data]));
            const link = document.createElement('a');
            link.href = url;
            const date = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
            link.setAttribute('download', `${optionId}_backup_${date}.zip`);
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.URL.revokeObjectURL(url);

            Swal.fire({
                title: 'Backup Created!',
                text: `${option.label} backup has been downloaded successfully.`,
                icon: 'success',
                confirmButtonColor: '#406093',
                timer: 2000
            });
        } catch (err) {
            Swal.fire({
                title: 'Backup Failed!',
                text: err.response?.data?.detail || 'Failed to create backup',
                icon: 'error',
                confirmButtonColor: '#406093'
            });
        } finally {
            setBackupLoading(false);
        }
    };

    const handleDeleteData = async () => {
        const hasSelectedOption = Object.values(selectedOptions).some(value => value === true);
        if (!hasSelectedOption) {
            showToast('error', 'Please select at least one data type to delete');
            return;
        }

        if (confirmText !== 'DELETE DATA') {
            Swal.fire({
                title: 'Confirmation Required',
                text: 'Please type "DELETE DATA" to confirm deletion',
                icon: 'warning',
                confirmButtonColor: '#406093'
            });
            return;
        }

        // First warning - Backup reminder
        const backupResult = await Swal.fire({
            title: 'Important!',
            html: `
                <div class="text-left">
                    <p class="mb-2">You are about to delete selected data. This action cannot be undone!</p>
                    <p class="mb-1.5 font-semibold text-red-600">Please ensure you have:</p>
                    <ul class="list-disc list-inside space-y-0.5 mb-2">
                        <li>✓ Taken backups of all data you want to keep</li>
                        <li>✓ Exported any important information</li>
                        <li>✓ Confirmed with your team before proceeding</li>
                    </ul>
                    <p class="text-xs text-black">You can use the backup buttons next to each option to save your data before deletion.</p>
                </div>
            `,
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#d33',
            cancelButtonColor: '#406093',
            confirmButtonText: 'Yes, I have taken backup',
            cancelButtonText: 'No, take me back'
        });

        if (!backupResult.isConfirmed) {
            return;
        }

        // Second warning - Final confirmation
        const finalResult = await Swal.fire({
            title: '🚨 Final Warning!',
            html: `
                <div class="text-left">
                    <p class="mb-2 font-bold text-red-600">You are about to permanently delete:</p>
                    <ul class="list-disc list-inside mb-2">
                        ${selectedOptions.customerData ? '<li>✓ Customer, Campaign and Followups Data</li>' : ''}
                        ${selectedOptions.usersData ? '<li>✓ Users Data</li>' : ''}
                        ${selectedOptions.updateHistory ? '<li>✓ Customer Update Data</li>' : ''}
                        ${selectedOptions.employeeQueries ? '<li>✓ Employee Query Data</li>' : ''}
                    </ul>
                    <p class="text-xs text-black mt-2">This data cannot be recovered once deleted.</p>
                    <p class="text-xs font-bold text-red-600 mt-1.5">Are you absolutely sure?</p>
                </div>
            `,
            icon: 'error',
            showCancelButton: true,
            confirmButtonColor: '#d33',
            cancelButtonColor: '#6B7280',
            confirmButtonText: 'Yes, delete permanently',
            cancelButtonText: 'No, cancel'
        });

        if (!finalResult.isConfirmed) {
            return;
        }

        setLoading(true);
        try {
            const response = await axios.post(
                `${API_BASE_URL}/admin/delete-selected-data`,
                { 
                    confirm: confirmText,
                    dataTypes: selectedOptions
                }
            );

            if (response.data.success) {
                Swal.fire({
                    title: 'Data Deleted!',
                    html: `
                        <div class="text-left">
                            <p class="mb-1.5">The following data has been successfully deleted:</p>
                            <ul class="list-disc list-inside">
                                ${response.data.deleted?.customerData ? '<li>✓ Customer, Campaign and Followups Data</li>' : ''}
                                ${response.data.deleted?.usersData ? '<li>✓ Users Data</li>' : ''}
                                ${response.data.deleted?.updateHistory ? '<li>✓ Customer Update Data</li>' : ''}
                                ${response.data.deleted?.employeeQueries ? '<li>✓ Employee Query Data</li>' : ''}
                            </ul>
                        </div>
                    `,
                    icon: 'success',
                    confirmButtonColor: '#406093',
                    confirmButtonText: 'OK'
                }).then(() => {
                    onClose();
                    setTimeout(() => {
                        window.location.reload();
                    }, 1500);
                });
            }
        } catch (err) {
            Swal.fire({
                title: 'Error!',
                text: err.response?.data?.detail || 'Failed to delete data',
                icon: 'error',
                confirmButtonColor: '#406093'
            });
        } finally {
            setLoading(false);
        }
    };

    const getSelectedCount = () => {
        return Object.values(selectedOptions).filter(v => v === true).length;
    };

    return (
        <div className="fixed inset-0 backdrop-blur-sm bg-black/50 flex items-center justify-center p-3 z-50 overflow-y-auto">
            <div className="bg-white rounded-xl p-5 max-w-2xl w-full shadow-2xl max-h-[80vh] overflow-y-auto">
                <div className="flex justify-between items-center mb-3 bg-white pb-2">
                    <h3 className="text-base font-semibold text-red-600 flex items-center space-x-1.5">
                        <FaTrash className="text-red-600 text-sm" />
                        <span>Delete Data Management</span>
                    </h3>
                    <button
                        onClick={onClose}
                        className="text-black hover:text-gray-600 transition-colors p-0.5"
                    >
                        <FaTimes />
                    </button>
                </div>

                <div className="mb-3 p-2.5 bg-red-50 border border-red-200 rounded-lg">
                    <div className="flex items-start space-x-1.5">
                        <FaExclamationTriangle className="text-red-500 mt-0.5 flex-shrink-0 text-sm" />
                        <div>
                            <p className="text-xs font-medium text-red-800">Critical Warning: This action cannot be undone!</p>
                            <p className="text-[11px] text-red-600 mt-0.5">
                                Please take backups of any data you want to keep before proceeding with deletion.
                                Use the backup buttons next to each option to save your data.
                            </p>
                        </div>
                    </div>
                </div>

                <div className="space-y-3 mb-5">
                    <label className="block text-xs font-medium text-black mb-1.5">
                        Select data to delete:
                    </label>
                    
                    <div className="space-y-2.5">
                        {dataOptions.map((option) => (
                            <div key={option.id} className="border border-gray-200 rounded-lg p-3 hover:bg-gray-50 transition-colors">
                                <div className="flex items-start justify-between">
                                    <div className="flex items-start space-x-2.5 flex-1">
                                        <input
                                            type="checkbox"
                                            checked={selectedOptions[option.id]}
                                            onChange={() => handleOptionChange(option.id)}
                                            className="mt-0.5 w-3.5 h-3.5 text-red-600 focus:ring-red-500 border-gray-300 rounded"
                                        />
                                        <div className="flex-1">
                                            <div className="flex items-center space-x-1.5">
                                                {option.icon}
                                                <label className="font-medium text-black text-xs cursor-pointer">
                                                    {option.label}
                                                </label>
                                            </div>
                                            <p className="text-[11px] text-black mt-0.5 ml-5">
                                                {option.description}
                                            </p>
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => handleBackup(option.id)}
                                        disabled={backupLoading}
                                        className="ml-3 px-2.5 py-1 bg-green-500 hover:bg-green-600 text-white rounded-lg text-[11px] font-medium transition-colors flex items-center space-x-1 whitespace-nowrap disabled:opacity-50"
                                    >
                                        <FaDownload className="text-[10px]" />
                                        <span>Backup</span>
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="border-t border-gray-200 pt-3 mb-3">
                    <div className="mb-3">
                        <label className="block text-[11px] font-medium text-black mb-0.5">
                            Type <span className="font-mono font-bold text-red-600">"DELETE DATA"</span> to confirm deletion
                        </label>
                        <input
                            type="text"
                            placeholder="DELETE DATA"
                            value={confirmText}
                            onChange={(e) => setConfirmText(e.target.value)}
                            className="w-full px-2.5 py-1.5 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent font-mono text-black"
                        />
                    </div>
                </div>

                {getSelectedCount() > 0 && (
                    <div className="mb-3 p-2 bg-yellow-50 border border-yellow-200 rounded-lg">
                        <p className="text-[11px] text-yellow-800">
                            <FaExclamationTriangle className="inline mr-0.5 text-[10px]" />
                            You have selected {getSelectedCount()} data type(s) for deletion. {getSelectedCount() === 4 ? 'All data will be removed!' : 'Please review your selection before proceeding.'}
                        </p>
                    </div>
                )}

                <div className="flex space-x-2.5 pt-1.5">
                    <button
                        type="button"
                        onClick={handleDeleteData}
                        disabled={loading || getSelectedCount() === 0 || confirmText !== 'DELETE DATA'}
                        className={`flex-1 bg-red-600 hover:bg-red-700 text-white py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center justify-center space-x-1.5 ${
                            (loading || getSelectedCount() === 0 || confirmText !== 'DELETE DATA') 
                                ? 'opacity-50 cursor-not-allowed' 
                                : ''
                        }`}
                    >
                        {loading ? (
                            <>
                                <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-white"></div>
                                <span>Deleting...</span>
                            </>
                        ) : (
                            <>
                                <FaTrash className="text-[10px]" />
                                <span>Delete Selected Data</span>
                            </>
                        )}
                    </button>
                    <button
                        type="button"
                        onClick={onClose}
                        className="flex-1 bg-gray-100 hover:bg-gray-200 text-black py-1.5 rounded-lg text-xs font-medium transition-colors"
                    >
                        Cancel
                    </button>
                </div>
            </div>
        </div>
    );
};

export default DeleteDataModal;