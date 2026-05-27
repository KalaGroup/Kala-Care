import React, { useState } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
import {
    DocumentArrowUpIcon,
    CheckCircleIcon,
    XCircleIcon,
    InformationCircleIcon,
    CloudArrowUpIcon,
    ChevronDownIcon,
    TableCellsIcon,
    EyeIcon,
    ArrowPathIcon,
    DocumentTextIcon,
    ExclamationTriangleIcon
} from '@heroicons/react/24/outline';
import * as XLSX from 'xlsx';

const API_BASE_URL = import.meta.env.VITE_BACKEND_URL;

const FILE_TYPES = [
    "AMC Agreement History",
    "Asset Detailed Report",
    "Asset Details with Last Oil Service",
    "Anubandhan Plus Quotes Report",
    "Anubandhan Quotes Report",
    "BandhanPlus Quotes Report",
    "Pulse Quotation - Service Only",
    "Regular Bandhan Customers Report",
    "LMS Data for ERP",
    "Open SR Load Report"
];

// Define expected columns for each file type to display in the UI
const FILE_TYPE_COLUMNS = {
    "AMC Agreement History": [
        "ZONE NAME", "SD ID", "SD NAME", "BRANCH ID", "BRANCH NAME",
        "INSTANCE ID", "SEGMENT", "KVA RATING", "ENGINE MODEL",
        "AGREEMENT NUMBER", "NUMBER OF AGREEMENT YEARS", "AGREEMENT NAME",
        "AGREEMENT STATUS", "AGREEMENT TYPE", "AGREEMENT CREATED DATE",
        "AGREEMENT START DATE", "AGREEMENT END DATE", "AGREEMENT PRODUCT NAME",
        "LAST AGREEMENT NUMBER", "LAST AGREEMENT NO OF YEARS", "LAST AGREEMENT TYPE",
        "LAST AGREEMENT STATUS", "LAST AGREEMENT PRODUCT NAME",
        "LAST AGREEMENT START DATE", "LAST AGREEMENT END DATE"
    ],
    "Asset Detailed Report": [
        "ZONE NAME", "SD ID", "SD NAME", "BRANCH ID", "BRANCH NAME",
        "DISTRICT", "ASSET NUMBER", "COMMISSIONING DATE", "INSTALLATION DATE",
        "GOEM OEM", "APPLICATION CODE", "ENGINE SERIAL NO", "ENGINE MODEL",
        "ACCOUNT NAME", "CUSTOMER NAME", "CONTACT PHONE NUMBER", "CONTACT EMAIL ID",
        "WARRANTY EXPIRY DATE", "INSTALLATION SITE ADDRESS", "PRODUCT SEGMENT",
        "SEGMENT", "CUSTOMER SEGMENT", "ASSET OPERATIONAL STATUS",
        "KRM NUMBER", "KRM STATUS", "KRM ACTIVE DATE", "KRM INACTIVE DATE",
        "KRM SUBSCRIPTION START DATE", "KRM SUBSCRIPTION END DATE", "KVA RATING"
    ],
    "Asset Details with Last Oil Service": [
        "ZONE NAME", "SD ID", "SD NAME", "BRANCH ID", "BRANCH NAME",
        "ASSET NUMBER", "COMMISSIONING DATE", "PRODUCT SEGMENT", "APPLICATION CODE",
        "ENGINE SERIAL NO", "ACCOUNT NAME", "CONTACT PHONE NUMBER",
        "LAST CLOSED SR NUMBER", "LAST SR TYPE", "LAST SR SUBTYPE",
        "LAST SR CLOSE DATE", "LAST OIL CHANGE SR NUMBER", "LAST OIL CHANGE SR TYPE",
        "LAST OIL CHANGE SR SUB TYPE", "LAST OIL CHANGE DATE",
        "INSTALLATION SITE ADDRESS", "LAST SERVICE HRS"
    ],
    "Anubandhan Plus Quotes Report": [
        "Id", "QuotationRefNo", "CompanyName", "EngineNo", "ContactPersonName",
        "MobileNo", "EmailId", "GensetKVA", "Zone", "State", "City", "Location",
        "NoOfYears", "GensetRunningPerYear", "CreatedDateTime", "Status",
        "PaymentType", "TransactionId", "BankName", "AccountNo", "DateOfPayment",
        "PaymentUpdateDateTime", "IsNEFTConfirm", "IsChequeConfirm",
        "Cheque deposited-Address of YES Bank Branch", "cheque given-Name of KOEL Dealership",
        "Cheque Deposited", "Cheque To Dealer", "Employee Name", "Pulse Id",
        "IsInvoiceSent", "IsRefund", "AgentId", "QuotePrice",
        "Quotation Value Including tax", "Name of Agent", "Actual Amount",
        "Reason of Short Payment", "Status updated by Admin", "Quotation Expiry Date",
        "IsExpired", "Payment Updated Month", "Pulse Instance ID", "New Price Applicable",
        "QuotationType"
    ],
    "Anubandhan Quotes Report": [
        "Id", "QuotationRefNo", "CompanyName", "EngineNo", "ContactPersonName",
        "MobileNo", "EmailId", "GensetKVA", "Zone", "State", "City", "Location",
        "NoOfYears", "GensetRunningPerYear", "CreatedDateTime", "Status",
        "PaymentType", "TransactionId", "BankName", "AccountNo", "DateOfPayment",
        "PaymentUpdateDateTime", "IsNEFTConfirm", "IsChequeConfirm",
        "Cheque deposited-Address of YES Bank Branch", "cheque given-Name of KOEL Dealership",
        "Cheque Deposited", "Cheque To Dealer", "Employee Name", "Pulse Id",
        "IsInvoiceSent", "IsRefund", "AgentId", "QuotePrice",
        "Quotation Value Including tax", "Name of Agent", "Actual Amount",
        "Reason of Short Payment", "Status updated by Admin", "Quotation Expiry Date",
        "IsExpired", "Payment Updated Month", "Pulse Instance ID", "New Price Applicable",
        "QuotationType"
    ],
    "BandhanPlus Quotes Report": [
        "Id", "QuotationRefNo", "CompanyName", "EngineNo", "ContactPersonName",
        "MobileNo", "EmailId", "GensetKVA", "Zone", "State", "City", "Location",
        "NoOfYears", "GensetRunningPerYear", "CreatedDateTime", "Status",
        "PaymentType", "TransactionId", "BankName", "AccountNo", "DateOfPayment",
        "PaymentUpdateDateTime", "IsNEFTConfirm", "IsChequeConfirm",
        "Cheque deposited-Address of YES Bank Branch", "cheque given-Name of KOEL Dealership",
        "Cheque Deposited", "Cheque To Dealer", "Employee Name", "Pulse Id",
        "IsInvoiceSent", "IsRefund", "AgentId", "QuotePrice",
        "Quotation Value Including tax", "Name of Agent", "Actual Amount",
        "Reason of Short Payment", "Status updated by Admin", "Quotation Expiry Date",
        "IsExpired", "Payment Updated Month", "Pulse Instance ID", "New Price Applicable",
        "QuotationType"
    ],
    "Pulse Quotation - Service Only": [
        "Creation Date", "Quote ID", "First level observations", "Quote Status",
        "SR Type", "SR Sub Type", "Instance Id", "Account", "Bill To Address",
        "Ship To Address", "First Name", "Last Name", "Account/Contact Phone Number",
        "Installation Site Address", "Account/Contact Primary Email", "Service Dealer",
        "Labor Amount", "Parts Amount", "Total Amount", "Prepared By", "Recommended By",
        "Finance Company Address", "Account Number", "Purpose Of Quotation", "SR#:",
        "Quote Revised Flag", "Quote Submitted Date", "Exception Enquiry #", "Lead #",
        "Quotation Lead Assigned Name", "Quotation Lead Assigned Job Title",
        "Quotation Lead Assigned Phone Number", "Quotation Lead Assigned UID"
    ],
    "Regular Bandhan Customers Report": [
        "Name of Agent", "Quotation Ref No.", "Password", "Genset Number", "Name",
        "Email", "Mobile", "PAN Card No.", "Billing State", "Billing City",
        "Billing Location", "Billing Address 1", "Billing Address 2", "Billing Pincode",
        "DG State", "DG City", "DG Location", "DG Address 1", "DG Address 2",
        "DG Pincode", "Type of Customer", "Date", "GSTN No.", "Payment type",
        "Payment Update Date", "Contact Person Name", "Zone", "Actual Amount",
        "Reason of Short Payment", "Status updated by Admin"
    ],
    "LMS Data for ERP": [
        "Lead Number", "Lead Created Date", "Lead Raised By", "Lead Status",
        "Lead Raised For", "Lead Assigned To", "SD Code", "SD Name",
        "SD Branch Name", "SD Branch Code", "Service Request Number", "SR Type",
        "SR Sub Type", "Account ID", "Account Name", "Account Contact Number",
        "Account Contact Email ID", "Tele-Caller Name", "Tele-Caller UID",
        "Tele Caller Mobile Number", "Enquiry Allocation Remarks", "Instance ID",
        "Engine App Code", "Engine Serial No", "Engine Model", "Pin Code",
        "Segment", "kVA Rating", "Commissioning Date", "Installation Site Address",
        "City", "District", "State", "Asset Contact Name", "Asset Contact Phone Number",
        "eFSR Contact Name", "eFSR Customer Number", "Qualifying Date", "Quotation Type",
        "Quotation Number", "Quotation Approved Date", "Mode Of Lead Creation",
        "Quotation Submit Date", "Quotation Labour Amt", "Quotation Part Amt",
        "Total Quote Amount", "Quotation Lead Assigned Name", "Quotation Lead Assigned UID",
        "Quotation Lead Assigned Job Title", "Enquiry Loss Reason", "Service Engineer Name",
        "Service Engineer UID", "Service Engineer Mobile Number", "Order Number",
        "SIC Code", "SIC Code Type", "Labour Invoice Number", "Part Invoice Amount",
        "Lead Source", "Next Action Required", "New Contact", "Lead Contact Number",
        "Next Action Date", "Lead Assign To SD", "Part Invoice Number"
    ],
    "Open SR Load Report": [
        "Instance Id [Asset #]", "Service Request #", "SR Due Date", "SR Type",
        "Appointment Date", "Service Dealer", "Status", "Problem Code",
        "Close Date/Time", "VOC", "Contact Last Name", "Installation Site Address",
        "Account", "Engine App Code", "Engine Serial#", "Segment", "Engine Series",
        "Engine Model", "Ticket#", "Task Start Date", "Task End Date",
        "Under Monitoring Date", "Under Monitoring Remark", "Convert PM to Wet PM Flag",
        "Convert PM to Wet PM Flag updated Date", "Convert PM to Wet PM Flag updated by",
        "eFSR Engineer Remarks", "Quick Ticket SR Comments", "Actual SR Due Date",
        "SR Sub-Type", "Customer Name", "Customer Mobile #", "Genset Appcode",
        "Primary Phone#", "Contact Name", "Mode", "Special Tool", "Special Tool Name",
        "Repeat", "Assigned To", "Oil Change Flg", "Claim Created", "Agreement #",
        "Cancellation Reason", "CSP Cancellation Reasons", "CSP Cancellation Remarks",
        "ASM/ASE Remarks", "ASM/ASE Remarks Date", "Battery Charger Availability",
        "Wet PM Due Flag", "Cap Limit Approval Remarks", "Cap Limit Deviation Remarks",
        "Cap Limit Deviation Status", "Cap limit User details", "CSP Prepone Flag",
        "CSP Prepone Flag updated By", "Bandhan PM SR closure within 15 days flag",
        "Bandhan PM Lock Removal flag updated by", "Bandhan PM Lock Removal flag updated Date",
        "Bandhan PM SR Closure @90 days max after PM Due Date flag",
        "Bandhan PM Due Date Lock Removal flag updated by",
        "Bandhan PM Due Date Lock Removal flag updated Date",
        "Bandhan Job card creation prior to 60 days flag",
        "Bandhan PM JC creation Lock Removal flag updated by",
        "Bandhan PM JC creation Lock Removal flag updated Date",
        "Account Id", "SR Created BY", "eFSR KRM Number", "Dry CSP Approved by",
        "Dry CSP Approved Date"
    ]
};

const Import = () => {
    const [files, setFiles] = useState([]);
    const [uploading, setUploading] = useState(false);
    const [results, setResults] = useState([]);
    const [selectedFileType, setSelectedFileType] = useState('');
    const [dragActive, setDragActive] = useState(false);
    const [filePreview, setFilePreview] = useState(null);
    const [previewLoading, setPreviewLoading] = useState(false);
    const [showPreview, setShowPreview] = useState(false);
    const [formatError, setFormatError] = useState(null);
    const navigate = useNavigate();

    const themeColor = '#2f3192';
    const themeShades = {
        light: 'rgba(64, 96, 147, 0.1)',
        medium: 'rgba(64, 96, 147, 0.5)',
        dark: '#335478',
    };

    // Helper function to extract instance ID from Asset # format
    const extractInstanceIdFromAsset = (instanceIdAsset) => {
        if (!instanceIdAsset) return null;
        const instanceStr = String(instanceIdAsset).trim();

        // Check if it contains "Asset #: " pattern
        if (instanceStr.includes("Asset #:")) {
            const parts = instanceStr.split("Asset #:");
            if (parts.length > 1) {
                return parts[1].trim();
            }
        }

        return instanceStr;
    };

    // Updated readExcelFile function with proper parsing
    const readExcelFile = (file) => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();

            reader.onload = (e) => {
                try {
                    const data = new Uint8Array(e.target.result);
                    const workbook = XLSX.read(data, { type: 'array' });

                    // Get first sheet
                    const firstSheetName = workbook.SheetNames[0];
                    const worksheet = workbook.Sheets[firstSheetName];

                    // Convert to JSON with headers - use header: 1 to get array of arrays
                    const jsonData = XLSX.utils.sheet_to_json(worksheet, {
                        header: 1,
                        defval: '', // Default value for empty cells
                        blankrows: false // Skip empty rows
                    });

                    if (jsonData.length > 0) {
                        // Filter out completely empty rows
                        const nonEmptyRows = jsonData.filter(row =>
                            row && row.some && row.some(cell =>
                                cell !== undefined && cell !== null && cell !== ''
                            )
                        );

                        if (nonEmptyRows.length > 0) {
                            // Get headers from the first non-empty row
                            const headers = nonEmptyRows[0].map(h =>
                                h !== undefined && h !== null ? String(h).trim() : ''
                            ).filter(h => h !== ''); // Remove empty headers

                            // Get data rows (skip header row)
                            const dataRows = nonEmptyRows.slice(1, 11); // Get first 10 data rows for preview

                            resolve({
                                fileName: file.name,
                                sheetName: firstSheetName,
                                totalRows: nonEmptyRows.length - 1, // Subtract header row
                                totalColumns: headers.length,
                                headers: headers,
                                previewRows: dataRows
                            });
                        } else {
                            reject(new Error('File contains no data'));
                        }
                    } else {
                        reject(new Error('File is empty'));
                    }
                } catch (error) {
                    console.error('Excel parsing error:', error);
                    reject(error);
                }
            };

            reader.onerror = (error) => reject(error);
            reader.readAsArrayBuffer(file);
        });
    };

    // Updated validateFileFormat function with proper LMS handling
    const validateFileFormat = (headers, fileType) => {
        const expected = FILE_TYPE_COLUMNS[fileType] || [];

        // Clean headers: trim and remove extra spaces
        const cleanHeaders = headers.map(h => {
            if (!h) return '';
            return String(h).trim().replace(/\s+/g, ' ');
        }).filter(h => h !== ''); // Remove empty headers

        // For all file types, use case-insensitive matching
        const headersUpper = cleanHeaders.map(h => h.toUpperCase());
        const expectedUpper = expected.map(col =>
            String(col).trim().replace(/\s+/g, ' ').toUpperCase()
        );

        // Find missing columns
        const missingColumns = expectedUpper.filter(expectedCol =>
            !headersUpper.includes(expectedCol)
        );

        if (missingColumns.length > 0) {
            // Map back to original expected column names for better error message
            const missingOriginalNames = missingColumns.map(missing => {
                const index = expectedUpper.indexOf(missing);
                return expected[index];
            });

            // Show first 10 missing columns
            const missingList = missingOriginalNames.slice(0, 10).join(', ');
            const remainingCount = missingOriginalNames.length - 10;
            const missingMessage = remainingCount > 0
                ? `${missingList} and ${remainingCount} more columns`
                : missingList;

            return {
                valid: false,
                message: `File format doesn't match ${fileType}. Missing columns: ${missingMessage}`
            };
        }

        return { valid: true, message: '' };
    };

    const handleFileChange = async (e) => {
        const selectedFiles = Array.from(e.target.files);
        // Check file size (100MB limit to match backend)
        const maxSize = 100 * 1024 * 1024; // 100MB in bytes
        const validFiles = selectedFiles.filter(file => file.size <= maxSize);

        if (validFiles.length !== selectedFiles.length) {
            toast.error('Some files exceed the 100MB size limit');
        }

        setFiles(validFiles);
        setResults([]);
        setShowPreview(false);
        setFormatError(null);

        if (validFiles.length > 0) {
            await previewFile(validFiles[0]);
        }
    };

    const previewFile = async (file) => {
        setPreviewLoading(true);
        setFormatError(null);
        try {
            const previewData = await readExcelFile(file);
            setFilePreview(previewData);

            // Validate format if file type is selected
            if (selectedFileType) {
                const validation = validateFileFormat(previewData.headers, selectedFileType);
                if (!validation.valid) {
                    setFormatError(validation.message);
                    toast.error(validation.message);
                } else {
                    setFormatError(null);
                    toast.success('File format validation passed!');
                }
            }

            setShowPreview(true);
        } catch (error) {
            console.error('Preview error:', error);
            toast.error('Failed to load file preview');
            setFilePreview(null);
        } finally {
            setPreviewLoading(false);
        }
    };

    const handleDrag = (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.type === "dragenter" || e.type === "dragover") {
            setDragActive(true);
        } else if (e.type === "dragleave") {
            setDragActive(false);
        }
    };

    const handleDrop = async (e) => {
        e.preventDefault();
        e.stopPropagation();
        setDragActive(false);

        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            const droppedFiles = Array.from(e.dataTransfer.files);
            // Check file size
            const maxSize = 100 * 1024 * 1024; // 100MB
            const validFiles = droppedFiles.filter(file => file.size <= maxSize &&
                (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')));

            if (validFiles.length !== droppedFiles.length) {
                toast.error('Some files exceed the 100MB size limit or are not Excel files');
            }

            setFiles(validFiles);
            setResults([]);
            setShowPreview(false);
            setFormatError(null);

            if (validFiles.length > 0) {
                await previewFile(validFiles[0]);
            }
        }
    };

    const handleUpload = async () => {
        if (files.length === 0) { toast.error('Please select a file'); return; }
        if (!selectedFileType) { toast.error('Please select a file type'); return; }

        const file = files[0];
        if (!file.name.endsWith('.xlsx') && !file.name.endsWith('.xls')) {
            toast.error('Please select a valid Excel file (.xlsx or .xls)');
            return;
        }
        if (filePreview) {
            const validation = validateFileFormat(filePreview.headers, selectedFileType);
            if (!validation.valid) { toast.error(validation.message); return; }
        }

        const formData = new FormData();
        formData.append('file', file);
        formData.append('file_type', selectedFileType);

        setUploading(true);
        const uploadToast = toast.loading('Uploading file...');

        try {
            // 1. Submit the job
            const submitRes = await axios.post(`${API_BASE_URL}/import/excel`, formData, {
                headers: { 'Content-Type': 'multipart/form-data' },
            });

            const { job_id } = submitRes.data;
            toast.dismiss(uploadToast);
            const processingToast = toast.loading('Processing... this may take a minute for large files.');

            // 2. Poll until done or failed
            const poll = async () => {
                const MAX_POLLS = 300; // 5 minutes at 1s intervals
                for (let i = 0; i < MAX_POLLS; i++) {
                    await new Promise(r => setTimeout(r, 2000)); // wait 2s between polls
                    const statusRes = await axios.get(`${API_BASE_URL}/import/status/${job_id}`);
                    const job = statusRes.data;

                    if (job.status === 'done') {
                        toast.dismiss(processingToast);
                        toast.success(job.message);
                        setResults([{
                            filename: file.name,
                            status: 'success',
                            message: `Processed ${job.total_processed} records — New: ${job.imported_count}, Updated: ${job.updated_count}`,
                            imported_count: job.imported_count,
                            updated_count: job.updated_count,
                            total_processed: job.total_processed,
                        }]);
                        setTimeout(() => { toast.success('Redirecting...'); navigate('/customers'); }, 2000);
                        setFiles([]); setSelectedFileType(''); setFilePreview(null);
                        setShowPreview(false); setFormatError(null);
                        return;
                    }

                    if (job.status === 'failed') {
                        toast.dismiss(processingToast);
                        toast.error(job.message || 'Import failed');
                        setResults([{ filename: file.name, status: 'error', message: job.message }]);
                        return;
                    }
                    // still 'queued' or 'processing' → keep polling
                }
                toast.dismiss(processingToast);
                toast.error('Import timed out on client side — check server logs');
            };

            await poll();

        } catch (error) {
            toast.dismiss(uploadToast);
            const errorMessage = error.response?.data?.detail || error.message || 'Upload failed';
            toast.error(errorMessage);
            setResults([{ filename: file.name, status: 'error', message: errorMessage }]);
        } finally {
            setUploading(false);
        }
    };

    const removeFile = () => {
        setFiles([]);
        setResults([]);
        setFilePreview(null);
        setShowPreview(false);
        setFormatError(null);
        toast.success('File removed successfully');
    };

    const togglePreview = () => {
        setShowPreview(!showPreview);
    };

    const triggerFileInput = () => {
        document.getElementById('file-input').click();
    };

    const handleFileTypeChange = async (e) => {
        const newFileType = e.target.value;
        setSelectedFileType(newFileType);
        setFormatError(null);

        // Re-validate if we have a file preview
        if (filePreview && newFileType) {
            const validation = validateFileFormat(filePreview.headers, newFileType);
            if (!validation.valid) {
                setFormatError(validation.message);
                toast.error(validation.message);
            } else {
                toast.success('File format matches selected type!');
            }
        }
    };

    return (
        <div className="min-h-screen from-gray-50 to-gray-100 py-0">
            <div className="max-w-7xl mx-auto px-3 sm:px-4 lg:px-4">
                {/* Header Section */}
                <div className="mb-3 sm:mb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
                    <div className="flex items-center gap-2 sm:gap-3">

                        <div>
                            <h1 className="text-xl sm:text-xl font-bold text-black">Upload Data Here...</h1>
                            <p className="text-xs sm:text-sm text-black/50 mt-0.5">
                                Upload Excel files to import customer data. Preview your file before uploading to verify the structure.
                            </p>
                        </div>
                    </div>
                </div>

                {/* Main Card */}
                <div className="bg-white rounded-xl sm:rounded-2xl shadow-lg sm:shadow-xl overflow-hidden">
                    {/* Card Header */}
                    <div
                        className="px-3 sm:px-4 py-2 sm:py-3"
                        style={{ background: "#2f3192" }}
                    >
                        <h2 className="text-sm sm:text-base font-semibold text-white">Upload New File</h2>
                        <p className="text-white text-opacity-90 text-[10px] sm:text-xs mt-0.5 sm:mt-1">Select a file type and upload your Excel document</p>
                    </div>

                    {/* Card Body */}
                    <div className="p-3 sm:p-4">
                        <div className="space-y-3 sm:space-y-4">
                            {/* File Type Selection */}
                            <div>
                                <label className="block text-[11px] sm:text-xs font-semibold text-black mb-1 sm:mb-1.5">
                                    File Type <span className="text-red-500">*</span>
                                </label>
                                <div className="relative max-w-md">
                                    <select
                                        value={selectedFileType}
                                        onChange={handleFileTypeChange}
                                        className="w-full appearance-none border rounded-lg shadow-sm px-2 sm:px-3 py-1.5 sm:py-2 pr-7 sm:pr-8 text-[11px] sm:text-xs focus:ring-2 transition-all bg-white text-black"
                                        style={{
                                            borderColor: selectedFileType ? '#2f3192' : '#D1D5DB',
                                            '--tw-ring-color': '#2f3192'
                                        }}
                                        onFocus={(e) => e.target.style.borderColor = '#2f3192'}
                                        onBlur={(e) => e.target.style.borderColor = selectedFileType ? '#2f3192' : '#D1D5DB'}
                                        disabled={uploading}
                                    >
                                        <option value="" disabled>Select a file type</option>
                                        {FILE_TYPES.map(type => (
                                            <option key={type} value={type}>{type}</option>
                                        ))}
                                    </select>
                                    <ChevronDownIcon
                                        className="absolute right-2 sm:right-2.5 top-1/2 transform -translate-y-1/2 h-3 w-3 sm:h-3.5 sm:w-3.5 pointer-events-none"
                                        style={{ color: selectedFileType ? '#2f3192' : '#9CA3AF' }}
                                    />
                                </div>
                                <p className="mt-0.5 text-[10px] text-black">Choose the type of data you're importing</p>
                            </div>

                            {/* File Format Display Section - Shows expected columns for selected file type */}
                            {selectedFileType && FILE_TYPE_COLUMNS[selectedFileType] && (
                                <div className="bg-blue-50 rounded-lg border border-blue-200 overflow-hidden">
                                    <div className="px-2 sm:px-3 py-1.5 sm:py-2 border-b border-blue-200 bg-blue-100/50">
                                        <h3 className="text-[11px] sm:text-xs font-semibold text-black flex items-center gap-1.5">
                                            <DocumentTextIcon className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                                            Expected File Format for: {selectedFileType}
                                        </h3>
                                    </div>
                                    <div className="p-2 sm:p-3 overflow-x-auto">
                                        <div className="min-w-full">
                                            <div className="text-[10px] sm:text-xs text-black mb-1 font-medium">Total Columns: {FILE_TYPE_COLUMNS[selectedFileType].length}</div>
                                            <div className="bg-white rounded-lg border border-blue-200 p-2 max-h-24 overflow-y-auto">
                                                <div className="flex flex-wrap gap-1.5">
                                                    {FILE_TYPE_COLUMNS[selectedFileType].map((col, idx) => (
                                                        <span
                                                            key={idx}
                                                            className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-mono bg-gray-100 text-black border border-gray-200"
                                                        >
                                                            {col}
                                                        </span>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* File Upload Area */}
                            <div>
                                <label className="block text-[11px] sm:text-xs font-semibold text-black mb-1 sm:mb-1.5">
                                    Excel File <span className="text-red-500">*</span>
                                </label>

                                {/* Drop Zone */}
                                <div
                                    onDragEnter={handleDrag}
                                    onDragLeave={handleDrag}
                                    onDragOver={handleDrag}
                                    onDrop={handleDrop}
                                    onClick={triggerFileInput}
                                    className={`
                        relative border-2 border-dashed rounded-lg p-3 sm:p-5 transition-all cursor-pointer
                        ${uploading ? 'opacity-50 cursor-not-allowed' : ''}
                    `}
                                    style={{
                                        borderColor: dragActive
                                            ? themeColor
                                            : files.length > 0
                                                ? themeColor
                                                : '#D1D5DB',
                                        backgroundColor: dragActive || files.length > 0
                                            ? themeShades.light
                                            : 'transparent'
                                    }}
                                >
                                    <input
                                        id="file-input"
                                        type="file"
                                        accept=".xlsx,.xls"
                                        onChange={handleFileChange}
                                        className="hidden"
                                        disabled={uploading}
                                    />

                                    <div className="text-center">
                                        <CloudArrowUpIcon
                                            className={`mx-auto h-6 w-6 sm:h-8 sm:w-8`}
                                            style={{
                                                color: dragActive || files.length > 0
                                                    ? themeColor
                                                    : '#9CA3AF'
                                            }}
                                        />

                                        {files.length > 0 ? (
                                            <div className="space-y-1.5 sm:space-y-2">
                                                <p className="text-[11px] sm:text-xs font-medium text-black">Selected file:</p>
                                                <div className="flex flex-col xs:flex-row items-center justify-center gap-1.5 sm:gap-2">
                                                    <div className="flex items-center gap-1.5 bg-white px-2 py-1 rounded-full border shadow-sm max-w-full">
                                                        <DocumentTextIcon
                                                            className="h-3 w-3 shrink-0"
                                                            style={{ color: themeColor }}
                                                        />
                                                        <span className="text-[10px] sm:text-xs text-black truncate max-w-[120px] xs:max-w-[160px] sm:max-w-xs">
                                                            {files[0].name}
                                                        </span>
                                                        <span className="text-[10px] text-black shrink-0">
                                                            ({(files[0].size / 1024 / 1024).toFixed(2)} MB)
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>
                                        ) : (
                                            <div>
                                                <p className="text-[11px] sm:text-xs font-medium text-black">
                                                    Drag and drop your file here, or click to browse
                                                </p>
                                                <p className="mt-0.5 text-[10px] text-black">
                                                    Supports: .xlsx, .xls (Max: 100MB)
                                                </p>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Action Buttons */}
                                {files.length > 0 && !uploading && (
                                    <div className="flex items-center justify-end gap-1.5 mt-2">
                                        {filePreview && (
                                            <button
                                                onClick={togglePreview}
                                                className="inline-flex items-center gap-1 px-2 py-1 text-[10px] sm:text-xs font-medium rounded-lg transition-colors border"
                                                style={{
                                                    backgroundColor: themeShades.light,
                                                    color: themeColor,
                                                    borderColor: themeColor
                                                }}
                                            >
                                                <EyeIcon className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                                                {showPreview ? 'Hide Preview' : 'Show Preview'}
                                            </button>
                                        )}
                                        <button
                                            onClick={removeFile}
                                            className="inline-flex items-center gap-1 px-2 py-1 bg-red-50 text-red-600 text-[10px] sm:text-xs font-medium rounded-lg hover:bg-red-100 transition-colors border border-red-200"
                                        >
                                            <XCircleIcon className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                                            Remove File
                                        </button>
                                    </div>
                                )}
                            </div>

                            {/* Format Error Message */}
                            {formatError && (
                                <div className="bg-red-50 border border-red-200 rounded-lg p-2 sm:p-3">
                                    <div className="flex items-start gap-1.5">
                                        <ExclamationTriangleIcon className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-red-500 flex-shrink-0 mt-0.5" />
                                        <div>
                                            <h4 className="text-[11px] sm:text-xs font-medium text-red-800">File Format Error</h4>
                                            <p className="text-[10px] sm:text-xs text-red-600 mt-0.5">{formatError}</p>
                                            <p className="text-[10px] text-red-500 mt-1">
                                                Please select the correct file type or check your file format.
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* File Preview Section */}
                            {showPreview && filePreview && (
                                <div className="mt-3 sm:mt-4 border rounded-lg sm:rounded-xl overflow-hidden">
                                    <div className="px-2 sm:px-3 py-1.5 sm:py-2 border-b flex flex-col xs:flex-row xs:items-center justify-between gap-1.5"
                                        style={{ backgroundColor: themeShades.light }}>
                                        <div className="flex items-center gap-1.5">
                                            <TableCellsIcon className="h-3 w-3 sm:h-3.5 sm:w-3.5" style={{ color: themeColor }} />
                                            <h3 className="text-[11px] sm:text-xs font-semibold text-black">File Preview</h3>
                                        </div>
                                        <div className="text-[10px] sm:text-xs text-black">
                                            <span className="font-medium">{filePreview.totalRows}</span> rows ·{' '}
                                            <span className="font-medium">{filePreview.totalColumns}</span> cols
                                        </div>
                                    </div>

                                    <div className="overflow-x-auto max-h-48 sm:max-h-64">
                                        <table className="min-w-full divide-y divide-gray-200 text-[10px] sm:text-xs">
                                            <thead className="bg-gray-50 sticky top-0">
                                                <tr>
                                                    {filePreview.headers.map((header, index) => (
                                                        <th
                                                            key={index}
                                                            className="px-1.5 sm:px-2 py-1 sm:py-1.5 text-left font-medium text-black uppercase tracking-wider border-r last:border-r-0 whitespace-nowrap"
                                                        >
                                                            {header || `Col ${index + 1}`}
                                                        </th>
                                                    ))}
                                                </tr>
                                            </thead>
                                            <tbody className="bg-white divide-y divide-gray-200">
                                                {filePreview.previewRows.map((row, rowIndex) => (
                                                    <tr key={rowIndex} className="hover:bg-gray-50">
                                                        {filePreview.headers.map((_, colIndex) => (
                                                            <td
                                                                key={colIndex}
                                                                className="px-1.5 sm:px-2 py-1 sm:py-1.5 border-r last:border-r-0 whitespace-nowrap text-black"
                                                            >
                                                                {row && row[colIndex] !== undefined && row[colIndex] !== null
                                                                    ? String(row[colIndex])
                                                                    : '-'}
                                                            </td>
                                                        ))}
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>

                                    {filePreview.totalRows > 10 && (
                                        <div className="bg-gray-50 px-2 sm:px-3 py-1 text-[10px] sm:text-xs text-black text-center border-t">
                                            Showing first 10 rows of {filePreview.totalRows} total rows
                                        </div>
                                    )}
                                </div>
                            )}

                            {previewLoading && (
                                <div className="text-center py-2 sm:py-3">
                                    <div className="inline-flex items-center gap-1.5 text-black">
                                        <ArrowPathIcon className="animate-spin h-3 w-3 sm:h-3.5 sm:w-3.5" style={{ color: themeColor }} />
                                        <span className="text-[10px] sm:text-xs">Loading file preview...</span>
                                    </div>
                                </div>
                            )}

                            {/* Upload Button - Desktop */}
                            <div className="hidden sm:flex items-center gap-3 pt-2">
                                <button
                                    onClick={handleUpload}
                                    disabled={uploading || files.length === 0 || !selectedFileType || formatError}
                                    className="flex items-center gap-1.5 px-3 sm:px-4 py-1.5 sm:py-2 text-white text-[11px] sm:text-xs font-medium rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-md hover:shadow-lg transform hover:-translate-y-0.5"
                                    style={{
                                        background: `linear-gradient(135deg, ${themeColor}, ${themeShades.dark})`,
                                    }}
                                >
                                    {uploading ? (
                                        <>
                                            <ArrowPathIcon className="animate-spin h-3 w-3 sm:h-3.5 sm:w-3.5" />
                                            <span>Uploading...</span>
                                        </>
                                    ) : (
                                        <>
                                            <DocumentArrowUpIcon className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                                            <span>Upload File</span>
                                        </>
                                    )}
                                </button>

                                {files.length > 0 && selectedFileType && !uploading && !formatError && (
                                    <span className="text-[10px] sm:text-xs text-black truncate max-w-xs">
                                        Ready: {files[0].name}
                                    </span>
                                )}
                            </div>

                            {/* Mobile upload button */}
                            <div className="sm:hidden flex justify-center pt-1">
                                <button
                                    onClick={handleUpload}
                                    disabled={uploading || files.length === 0 || !selectedFileType || formatError}
                                    className="w-full flex items-center justify-center gap-1.5 px-3 py-2 text-white text-[11px] font-medium rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-md"
                                    style={{
                                        background: `linear-gradient(135deg, ${themeColor}, ${themeShades.dark})`,
                                    }}
                                >
                                    {uploading ? (
                                        <>
                                            <ArrowPathIcon className="animate-spin h-3 w-3" />
                                            <span>Uploading...</span>
                                        </>
                                    ) : (
                                        <>
                                            <DocumentArrowUpIcon className="h-3 w-3" />
                                            <span>Upload File</span>
                                        </>
                                    )}
                                </button>
                            </div>

                            {/* Results Section */}
                            {results.length > 0 && (
                                <div className="mt-3 sm:mt-4 border-t pt-3 sm:pt-4">
                                    <h3 className="text-xs sm:text-sm font-semibold text-black mb-2 sm:mb-3">Upload Results</h3>
                                    <div className="space-y-1.5 sm:space-y-2">
                                        {results.map((result, index) => (
                                            <div
                                                key={index}
                                                className={`
                                    flex items-start gap-1.5 sm:gap-2 p-2 sm:p-3 rounded-lg sm:rounded-xl
                                    ${result.status === 'success'
                                                        ? 'bg-green-50 border border-green-200'
                                                        : 'bg-red-50 border border-red-200'
                                                    }
                                `}
                                            >
                                                {result.status === 'success' ? (
                                                    <CheckCircleIcon className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-green-600 flex-shrink-0 mt-0.5" />
                                                ) : (
                                                    <XCircleIcon className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-red-600 flex-shrink-0 mt-0.5" />
                                                )}
                                                <div className="flex-1 min-w-0">
                                                    <p className={`text-[11px] sm:text-xs font-medium truncate ${result.status === 'success' ? 'text-green-800' : 'text-red-800'
                                                        }`}>
                                                        {result.filename}
                                                    </p>
                                                    <p className={`text-[10px] sm:text-xs ${result.status === 'success' ? 'text-green-600' : 'text-red-600'
                                                        }`}>
                                                        {result.message}
                                                    </p>
                                                    {result.status === 'success' && result.imported_count !== undefined && (
                                                        <div className="mt-0.5 flex gap-2 text-[10px]">
                                                            <span className="text-green-600">New: {result.imported_count}</span>
                                                            <span className="text-blue-600">Updated: {result.updated_count}</span>
                                                            <span className="text-black">Total: {result.total_processed}</span>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {results.length > 0 && results[0].status === 'success' && (
                    <div className="mt-3 sm:mt-4 p-3 sm:p-4 border rounded-lg"
                        style={{ backgroundColor: themeShades.light, borderColor: themeColor }}>
                        <p className="text-xs sm:text-sm flex items-center gap-2" style={{ color: themeColor }}>
                            <ArrowPathIcon className="animate-spin h-3 w-3 sm:h-4 sm:w-4" />
                            Redirecting to customers page in 2 seconds...
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default Import;