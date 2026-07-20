import React, { useState, useEffect } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
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
    ExclamationTriangleIcon,
    ClockIcon
} from '@heroicons/react/24/outline';
import * as XLSX from 'xlsx';

const API_BASE_URL = import.meta.env.VITE_BACKEND_URL;

const FILE_TYPES = [
    "AMC Population Report",
    "Asset Detailed Report",
    "Asset Details with Last Oil Service",
    "Anubandhan Plus Quotes Report",
    "Anubandhan Quotes Report",
    "BandhanPlus Quotes Report",
    "Pulse Quotation - Service Only",
    "Regular Bandhan Customers Report",
    "LMS Data for ERP",
    "Open SR Load Report",
    "Open SR Data"
];

// Frontend-only display names; the original value is still sent to the backend
const FILE_TYPE_LABELS = {
    "Open SR Data": "Close SR Report"
};
const getFileTypeLabel = (type) => FILE_TYPE_LABELS[type] || type;

// Define expected columns for each file type to display in the UI
const FILE_TYPE_COLUMNS = {
    //commented by nik
    // "AMC Agreement History": [
    //     "ZONE NAME", "SD ID", "SD NAME", "BRANCH ID", "BRANCH NAME",
    //     "INSTANCE ID", "SEGMENT", "KVA RATING", "ENGINE MODEL",
    //     "AGREEMENT NUMBER", "NUMBER OF AGREEMENT YEARS", "AGREEMENT NAME",
    //     "AGREEMENT STATUS", "AGREEMENT TYPE", "AGREEMENT CREATED DATE",
    //     "AGREEMENT START DATE", "AGREEMENT END DATE", "AGREEMENT PRODUCT NAME",
    //     "LAST AGREEMENT NUMBER", "LAST AGREEMENT NO OF YEARS", "LAST AGREEMENT TYPE",
    //     "LAST AGREEMENT STATUS", "LAST AGREEMENT PRODUCT NAME",
    //     "LAST AGREEMENT START DATE", "LAST AGREEMENT END DATE"
    // ],
    //added by nik
    "AMC Population Report": [
        "ZONE NAME", "SD ID", "SD NAME", "BRANCH ID", "BRANCH NAME",
        "INSTANCE ID", "SEGMENT", "KVA RATING", "ENGINE MODEL",
        "AGREEMENT NUMBER", "NUMBER OF AGREEMENT YEARS", "AGREEMENT NAME",
        "AGREEMENT STATUS", "AGREEMENT TYPE", "AGREEMENT CREATED DATE",
        "AGREEMENT START DATE", "AGREEMENT END DATE", "AGREEMENT PRODUCT NAME",
        "AGREEMENT INVOICE TYPE", "COMMISSIONING DATE",
        "LAST AGREEMENT NO OF YEARS", "LAST AGREEMENT TYPE",
        "LAST AGREEMENT STATUS", "LAST AGREEMENT PRODUCT NAME",
        "LAST AGREEMENT START DATE", "LAST AGREEMENT END DATE"
    ],
    "Asset Detailed Report": [
        "ZONE NAME", "SD ID", "SD NAME", "BRANCH ID", "BRANCH NAME",
        "DISTRICT", "ASSET NUMBER", "COMMISSIONING DATE", "INSTALLATION DATE",
        "GOEM OEM", "APPLICATION CODE", "EMISSION NORM", "ENGINE SERIAL NO", "ENGINE MODEL",
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
        "Id", "Quotation Ref No", "Company Name", "Engine No", "Contact Person Name",
        "Mobile No", "Email Id", "Genset KVA", "Zone", "State", "City", "Location",
        "No Of Years", "Genset Running Per Year", "Created Date Time", "Status",
        "PaymentType", "Transaction Id", "Bank Name", "Account No", "Date Of Payment",
        "Payment Update Date Time", "Is NEFT Confirm", "Is Cheque Confirm",
        "Cheque deposited-Address of YES Bank Branch", "cheque given-Name of KOEL Dealership",
        "Cheque Deposited", "Cheque To Dealer", "Employee Name", "Pulse Id",
        "Is Invoice Sent", "Is Refund", "Agent Id", "QuotePrice",
        "Quotation Value Including tax", "Name of Agent", "Actual Amount",
        "Reason of Short Payment", "Status updated by Admin", "Quotation Expiry Date",
        "IsExpired", "Payment Updated Month", "Pulse Instance ID", "New Price Applicable",
        "Quotation Type", "First PM Date", "Agreement start date"
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
    ],
    "Open SR Data": [
        "ZONE NAME", "ASM NAME", "SD ID", "SD NAME", "BRANCH ID", "BRANCH NAME",
        "INSTANCE ID", "APPLICATION CODE", "ENGINE SERIAL NO", "ENGINE MODEL",
        "SEGMENT", "PRODUCT SEGMENT", "ACCOUNT NAME", "SR NUMBER", "SR TYPE",
        "SR SUBTYPE", "SR OPEN DATE", "SR CLOSE DATE", "MODE OF SR",
        "ZERO LABOUR FLAG", "OIL CHANGE FLAG", "COUNT OF TASKS"
    ]
};

// ============================================================================
// REQUIRED COLUMNS — the record keys a file MUST contain; upload is blocked
// without them. Mirrors the backend's critical-column validation exactly.
// ============================================================================
const FILE_TYPE_REQUIRED_COLUMNS = {
    "AMC Population Report": ["INSTANCE ID", "AGREEMENT NUMBER"],
    "Asset Detailed Report": ["ASSET NUMBER", "ENGINE SERIAL NO"],
    "Asset Details with Last Oil Service": ["ASSET NUMBER", "ENGINE SERIAL NO"],
    "Anubandhan Plus Quotes Report": ["Pulse Instance ID", "QuotationRefNo", "EngineNo"],
    "Anubandhan Quotes Report": ["Pulse Instance ID", "QuotationRefNo", "EngineNo"],
    "BandhanPlus Quotes Report": ["Pulse Instance ID", "QuotationRefNo", "EngineNo"],
    "Pulse Quotation - Service Only": ["Instance Id", "Quote ID"],
    "Regular Bandhan Customers Report": ["Pulse Instance ID", "Quotation Ref No"],
    "LMS Data for ERP": ["Instance ID", "Lead Number"],
    "Open SR Load Report": ["Service Request #", "Instance Id [Asset #]", "Engine Serial#"],
    "Open SR Data": ["INSTANCE ID", "SR NUMBER", "SR TYPE", "SR SUBTYPE"]
};

// ============================================================================
// IMPORTANT COLUMNS — the fixed columns the system actually uses from each
// file (matching, customer master, Drive / Non-Drive pages). They are matched
// flexibly (case / spaces / punctuation / known alternate spellings). If one
// is missing the upload still proceeds but the user is warned. Every other
// column is dynamic: imported automatically as extra data.
// ============================================================================
const FILE_TYPE_IMPORTANT_COLUMNS = {
    "AMC Population Report": [
        "INSTANCE ID", "AGREEMENT STATUS", "AGREEMENT NUMBER", "AGREEMENT NAME",
        "BRANCH ID", "AGREEMENT START DATE", "AGREEMENT END DATE", "KVA RATING"
    ],
    "Asset Detailed Report": [
        "ASSET NUMBER", "ENGINE SERIAL NO", "BRANCH ID", "WARRANTY EXPIRY DATE",
        "GOEM OEM", "SEGMENT", "ENGINE MODEL", "KVA RATING", "ACCOUNT NAME",
        "CUSTOMER NAME", "CONTACT PHONE NUMBER", "CONTACT EMAIL ID",
        "INSTALLATION SITE ADDRESS", "COMMISSIONING DATE", "PRODUCT SEGMENT",
        "APPLICATION CODE", "EMISSION NORM", "KRM NUMBER", "KRM STATUS"
    ],
    "Asset Details with Last Oil Service": [
        "ASSET NUMBER", "ENGINE SERIAL NO", "BRANCH ID", "LAST OIL CHANGE DATE",
        "LAST OIL CHANGE SR TYPE", "LAST SR CLOSE DATE", "LAST CLOSED SR NUMBER",
        "LAST SR TYPE", "LAST SR SUBTYPE", "LAST SERVICE HRS",
        "ACCOUNT NAME", "CONTACT PHONE NUMBER"
    ],
    "Anubandhan Plus Quotes Report": [
        "Pulse Instance ID", "EngineNo", "QuotationRefNo", "CompanyName",
        "MobileNo", "EmailId", "City", "CreatedDateTime"
    ],
    "Anubandhan Quotes Report": [
        "Pulse Instance ID", "EngineNo", "QuotationRefNo", "CompanyName",
        "MobileNo", "EmailId", "City", "CreatedDateTime"
    ],
    "BandhanPlus Quotes Report": [
        "Pulse Instance ID", "EngineNo", "QuotationRefNo", "CompanyName",
        "MobileNo", "EmailId", "City", "CreatedDateTime"
    ],
    "Pulse Quotation - Service Only": [
        "Instance Id", "Quote ID", "Account", "Account/Contact Phone Number",
        "Account/Contact Primary Email", "Installation Site Address",
        "Creation Date", "Total Amount"
    ],
    "Regular Bandhan Customers Report": [
        "Pulse Instance ID", "Genset Number", "Quotation Ref No.", "Name",
        "Mobile", "Email", "Billing Location", "DG Location",
        "Billing City", "DG City"
    ],
    "LMS Data for ERP": [
        "Instance ID", "Lead Number", "SD Branch Code", "Account Name",
        "Account Contact Number", "Account Contact Email ID",
        "Installation Site Address", "Lead Created Date", "Lead Status",
        "Lead Raised By", "SR Type", "SR Sub Type", "KVA Rating",
        "Service Engineer", "Tele Caller", "Quotation Number",
        "Quotation Submit Date", "Quotation Approval Date", "Order Number"
    ],
    "Open SR Load Report": [
        "Service Request #", "Instance Id [Asset #]", "Engine Serial#",
        "SR Due Date", "SR Type", "SR Sub-Type", "Status", "Account",
        "Customer Name", "Customer Mobile #", "Primary Phone#",
        "Installation Site Address", "Oil Change Flg", "Segment", "Engine Model",
        "SR Created Date", "Close Date/Time"
    ],
    "Open SR Data": [
        "INSTANCE ID", "BRANCH ID", "ENGINE SERIAL NO", "ACCOUNT NAME",
        "SR NUMBER", "SR TYPE", "SR SUBTYPE", "SR OPEN DATE", "SR CLOSE DATE",
        "OIL CHANGE FLAG", "ZERO LABOUR FLAG"
    ]
};

// Alternate spellings accepted for required/important columns (word-level
// renames that case/space normalization can't bridge). Mirrors backend aliases.
const IMPORTANT_COLUMN_ALIASES = {
    "Open SR Load Report": {
        "Engine Serial#": ["Engine Serial No", "Engine Serial Number"],
        "Service Request #": ["Service Request No", "Service Request Number"],
        "Instance Id [Asset #]": ["Instance Id", "Instance ID", "Asset Number"],
        "Oil Change Flg": ["Oil Change Flag"]
    },
    "Open SR Data": {
        "INSTANCE ID": ["Instance Id [Asset #]", "Instance Id", "Asset Number"],
        "SR SUBTYPE": ["SR SUB TYPE", "SR SUB-TYPE"],
        "ZERO LABOUR FLAG": ["ZERO LABOR FLAG"],
        "OIL CHANGE FLAG": ["OIL CHANGE FLG"]
    },
    "Regular Bandhan Customers Report": {
        "Genset Number": ["Genset No", "Engine No"],
        "Name": ["Company Name"],
        "Mobile": ["Mobile No", "Mobile Number"],
        "Email": ["Email Id", "Email ID"],
        // Location source is Billing/DG Location; Billing/DG City is the
        // fallback — any one of the group counts as present.
        "Billing Location": ["Location", "DG Location"],
        "DG Location": ["Location", "Billing Location"],
        "Billing City": ["City", "DG City"],
        "DG City": ["City", "Billing City"],
        "Quotation Ref No.": ["Quotation Ref No", "QuotationRefNo"]
    },
    "LMS Data for ERP": {
        "SD Branch Code": ["BRANCH ID"],
        "Service Engineer": ["Service Engineer Name"],
        "Tele Caller": ["Tele-Caller Name", "Tele Caller Name"],
        "Quotation Approval Date": ["Quotation Approved Date"],
        "KVA Rating": ["kVA Rating"]
    }
};

// "engine serial no." / "ENGINE  SERIAL NO" / "EngineSerialNo" all become
// "engineserialno" — spacing, case and punctuation never block an import.
const tightHeader = (name) =>
    String(name ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');

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
    const [lastUpdatedInfo, setLastUpdatedInfo] = useState(null);
    const [lastUpdatedLoading, setLastUpdatedLoading] = useState(false);
    // Manual header mapping for important columns the file spells differently
    // (e.g. file has "Dt" instead of "SR Due Date"): { importantColumn: fileHeader | '__SKIP__' }
    const [columnMapping, setColumnMapping] = useState({});
    const [mappingInfo, setMappingInfo] = useState({ notFound: [], missing: [], unmatchedHeaders: [] });
    const [showUploadConfirm, setShowUploadConfirm] = useState(false);

    // CSS variables from index.css — identical to the old hardcoded colors in
    // light mode, and switch automatically to the sky accent in dark mode.
    const themeColor = 'var(--erp-accent)';
    const themeShades = {
        light: 'var(--erp-accent-light)',
        medium: 'var(--erp-accent-medium)',
        dark: 'var(--erp-accent-dark)',
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

    // Format the UTC ISO timestamp into readable IST date/time
    const formatDateTime = (isoString) => {
        if (!isoString) return null;
        const date = new Date(isoString);
        return date.toLocaleString('en-IN', {
            day: '2-digit', month: 'short', year: 'numeric',
            hour: '2-digit', minute: '2-digit', hour12: true
        });
    };

    // Fetch the newest updated_at for the selected file type
    const fetchLastUpdated = async (fileType) => {
        if (!fileType) {
            setLastUpdatedInfo(null);
            return;
        }
        setLastUpdatedLoading(true);
        try {
            const res = await axios.get(`${API_BASE_URL}/import/last-updated`, {
                params: { file_type: fileType }
            });
            setLastUpdatedInfo(res.data);
        } catch (error) {
            console.error('Failed to fetch last updated info:', error);
            setLastUpdatedInfo(null);
        } finally {
            setLastUpdatedLoading(false);
        }
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

    // Missing IMPORTANT columns BLOCK the upload. The user can resolve a name
    // mismatch (e.g. file says "Dt" but the column is "SR Due Date") by mapping
    // the file column in the preview box; the mapping is applied on the server,
    // the Excel file itself is never modified. Columns are matched flexibly
    // (case / spaces / punctuation ignored, plus known alternate spellings).
    const validateFileFormat = (headers, fileType, mapping = {}) => {
        const required = FILE_TYPE_REQUIRED_COLUMNS[fileType] || [];
        const important = FILE_TYPE_IMPORTANT_COLUMNS[fileType] || [];
        const aliases = IMPORTANT_COLUMN_ALIASES[fileType] || {};

        const cleanHeaders = headers.filter(h => h !== undefined && h !== null && String(h).trim() !== '');
        const headerKeys = new Set(cleanHeaders.map(h => tightHeader(h)));
        const requiredKeys = new Set(required.map(c => tightHeader(c)));

        const autoFound = (col) => {
            const candidates = [col, ...(aliases[col] || [])];
            return candidates.some(cand => headerKeys.has(tightHeader(cand)));
        };

        // Important columns the file does not contain under any accepted spelling
        const notFound = important.filter(col => !autoFound(col));

        // Of those, which are still unresolved after the user's manual mapping?
        const missing = notFound.filter(col => {
            const chosen = mapping[col];
            if (chosen === '__SKIP__') {
                // "Not in file" is never allowed for required key columns
                return requiredKeys.has(tightHeader(col));
            }
            return !(chosen && headerKeys.has(tightHeader(chosen)));
        });

        // File headers not auto-matched to any important column — these are the
        // candidates the user can map from
        const importantKeys = new Set();
        important.forEach(col => {
            [col, ...(aliases[col] || [])].forEach(c => importantKeys.add(tightHeader(c)));
        });
        const unmatchedHeaders = cleanHeaders.filter(h => !importantKeys.has(tightHeader(h)));

        // How many headers are new/renamed → imported as dynamic columns
        const knownKeys = new Set((FILE_TYPE_COLUMNS[fileType] || []).map(c => tightHeader(c)));
        importantKeys.forEach(k => knownKeys.add(k));
        const dynamicCount = [...headerKeys].filter(k => k && !knownKeys.has(k)).length;

        if (missing.length > 0) {
            const requiredMissing = missing.filter(c => requiredKeys.has(tightHeader(c)));
            return {
                valid: false,
                notFound, missing, unmatchedHeaders, dynamicCount,
                message: `Missing important column(s) for ${getFileTypeLabel(fileType)}: ${missing.map(c => c.toUpperCase()).join(', ')}. `
                    + (requiredMissing.length > 0
                        ? 'Match them to a file column below (required columns cannot be skipped).'
                        : 'Match them to a file column below, or mark them as not in the file.')
            };
        }

        return {
            valid: true,
            notFound, missing, unmatchedHeaders, dynamicCount,
            message: dynamicCount > 0
                ? `All important columns found. ${dynamicCount} extra column(s) will be imported as dynamic data.`
                : 'All important columns found.'
        };
    };

    const handleFileChange = async (e) => {
        const inputEl = e.target;
        const selectedFiles = Array.from(inputEl.files);
        // Check file size (100MB limit to match backend)
        const maxSize = 100 * 1024 * 1024; // 100MB in bytes
        const validFiles = selectedFiles.filter(file => file.size <= maxSize);

        if (validFiles.length !== selectedFiles.length) {
            toast.error('Some files exceed the 100MB size limit');
        }

        // Reset the input so the SAME file can be selected again later
        inputEl.value = '';

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
        setColumnMapping({});
        try {
            const previewData = await readExcelFile(file);
            setFilePreview(previewData);

            // Validate format if file type is selected
            if (selectedFileType) {
                const validation = validateFileFormat(previewData.headers, selectedFileType, {});
                setMappingInfo({
                    notFound: validation.notFound || [],
                    missing: validation.missing || [],
                    unmatchedHeaders: validation.unmatchedHeaders || []
                });
                if (!validation.valid) {
                    setFormatError(validation.message);
                    toast.error(validation.message);
                } else {
                    setFormatError(null);
                    toast.success(validation.message || 'File format validation passed!');
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

    // Re-validate whenever the file type or the user's column mapping changes,
    // so mapping a column immediately clears (or updates) the blocking error.
    useEffect(() => {
        if (!filePreview || !selectedFileType) return;
        const validation = validateFileFormat(filePreview.headers, selectedFileType, columnMapping);
        setMappingInfo({
            notFound: validation.notFound || [],
            missing: validation.missing || [],
            unmatchedHeaders: validation.unmatchedHeaders || []
        });
        setFormatError(validation.valid ? null : validation.message);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedFileType, columnMapping, filePreview]);

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

    // Step 1: validate, then ask the user to confirm file + type before uploading
    const handleUpload = () => {
        if (files.length === 0) { toast.error('Please select a file'); return; }
        if (!selectedFileType) { toast.error('Please select a file type'); return; }

        const file = files[0];
        if (!file.name.endsWith('.xlsx') && !file.name.endsWith('.xls')) {
            toast.error('Please select a valid Excel file (.xlsx or .xls)');
            return;
        }
        if (filePreview) {
            const validation = validateFileFormat(filePreview.headers, selectedFileType, columnMapping);
            if (!validation.valid) { toast.error(validation.message); return; }
        }

        setShowUploadConfirm(true);
    };

    // Step 2: the actual upload, runs only after the user confirms
    const performUpload = async () => {
        setShowUploadConfirm(false);
        const file = files[0];
        if (!file) return;

        const formData = new FormData();
        formData.append('file', file);
        formData.append('file_type', selectedFileType);
        // Send the manual header mapping (e.g. {"Dt": "SR Due Date"}) so the
        // server imports those columns under their proper names
        const mappingPayload = {};
        Object.entries(columnMapping).forEach(([importantCol, fileHeader]) => {
            if (fileHeader && fileHeader !== '__SKIP__') {
                mappingPayload[fileHeader] = importantCol;
            }
        });
        if (Object.keys(mappingPayload).length > 0) {
            formData.append('column_mapping', JSON.stringify(mappingPayload));
        }

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
                        setFiles([]); setSelectedFileType(''); setFilePreview(null);
                        setShowPreview(false); setFormatError(null);
                        setColumnMapping({}); setMappingInfo({ notFound: [], missing: [], unmatchedHeaders: [] });
                        const fileInput = document.getElementById('file-input');
                        if (fileInput) fileInput.value = '';
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
        // Clear the actual file input so a new/same file can be picked again
        const fileInput = document.getElementById('file-input');
        if (fileInput) fileInput.value = '';
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
        setColumnMapping({});

        // Fetch when this file type's data was last updated
        fetchLastUpdated(newFileType);

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
            <div className="max-w-7xl mx-auto px-3 sm:px-4 lg:px-4 max-md:px-2">
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
                    <div className="px-3 sm:px-4 py-2 sm:py-3 bg-[#2f3192]">
                        <h2 className="text-sm sm:text-base font-semibold text-white">Upload New File</h2>
                        <p className="text-white text-opacity-90 text-[10px] sm:text-xs mt-0.5 sm:mt-1">Select a file type and upload your Excel document</p>
                    </div>

                    {/* Card Body */}
                    <div className="p-3 sm:p-4">
                        <div className="space-y-3 sm:space-y-4">
                            {/* File Type Selection + Last Updated Info in one row */}
                            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2 md:gap-4">
                                {/* File Type Selection */}
                                <div className="w-full md:w-auto">
                                    <label className="block text-[11px] sm:text-xs font-semibold text-black mb-1 sm:mb-1.5">
                                        File Type <span className="text-red-500">*</span>
                                    </label>
                                    <div className="relative w-full md:w-80">
                                        <select
                                            value={selectedFileType}
                                            onChange={handleFileTypeChange}
                                            className="w-full appearance-none border border-gray-200 rounded-lg shadow-sm px-2 sm:px-3 py-1.5 sm:py-2 pr-7 sm:pr-8 text-[11px] sm:text-xs focus:ring-2 transition-all bg-white text-black"
                                            style={{
                                                borderColor: selectedFileType ? 'var(--erp-accent)' : '#D1D5DB',
                                                '--tw-ring-color': 'var(--erp-accent)'
                                            }}
                                            onFocus={(e) => e.target.style.borderColor = 'var(--erp-accent)'}
                                            onBlur={(e) => e.target.style.borderColor = selectedFileType ? 'var(--erp-accent)' : '#D1D5DB'}
                                            disabled={uploading}
                                        >
                                            <option value="" disabled>Select a file type</option>
                                            {FILE_TYPES.map(type => (
                                                <option key={type} value={type}>{getFileTypeLabel(type)}</option>
                                            ))}
                                        </select>
                                        <ChevronDownIcon
                                            className="absolute right-2 sm:right-2.5 top-1/2 transform -translate-y-1/2 h-3 w-3 sm:h-3.5 sm:w-3.5 pointer-events-none"
                                            style={{ color: selectedFileType ? 'var(--erp-accent)' : '#9CA3AF' }}
                                        />
                                    </div>
                                    <p className="mt-0.5 text-[10px] text-black">Choose the type of data you're importing</p>
                                </div>

                                {/* Last Updated Info — newest updated_at for the selected file type */}
                                {selectedFileType && (
                                    <div className="flex md:justify-end shrink-0 max-md:w-full">
                                        {lastUpdatedLoading ? (
                                            <span className="text-[10px] sm:text-xs text-black flex items-center gap-1.5">
                                                <ArrowPathIcon className="animate-spin h-3 w-3" style={{ color: themeColor }} />
                                                Checking last update...
                                            </span>
                                        ) : lastUpdatedInfo && lastUpdatedInfo.last_updated ? (
                                            <div className="inline-flex items-center gap-3 whitespace-nowrap px-3 py-2 border border-gray-200 rounded-md bg-gray-50 max-md:flex-wrap max-md:whitespace-normal max-md:w-full">
                                                <ClockIcon className="h-3.5 w-3.5 sm:h-4 sm:w-4 flex-shrink-0" style={{ color: themeColor }} />
                                                <span className="text-[10px] sm:text-xs text-black">
                                                    <span className="font-semibold">Last data update:</span>{" "}
                                                    {formatDateTime(lastUpdatedInfo.last_updated)}
                                                </span>
                                                <span className="text-[10px] sm:text-xs text-black">
                                                    <span className="font-semibold">Total records:</span>{" "}
                                                    {lastUpdatedInfo.total_records.toLocaleString("en-IN")}
                                                </span>
                                            </div>
                                        ) : (
                                            <span className="text-[10px] sm:text-xs text-black">
                                                No data has been uploaded yet for this file type.
                                            </span>
                                        )}
                                    </div>
                                )}
                            </div>

                            {/* File Format Display Section - Shows expected columns for selected file type */}
                            {selectedFileType && FILE_TYPE_COLUMNS[selectedFileType] && (
                                <div className="bg-blue-50 rounded-lg border border-blue-200 overflow-hidden">
                                    <div className="px-2 sm:px-3 py-1.5 sm:py-2 border-b border-blue-200 bg-blue-100/50">
                                        <h3 className="text-[11px] sm:text-xs font-semibold text-black flex items-center gap-1.5">
                                            <DocumentTextIcon className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                                            Expected File Format for: {getFileTypeLabel(selectedFileType)}
                                        </h3>
                                    </div>
                                    <div className="p-2 sm:p-3 overflow-x-auto">
                                        <div className="min-w-full">
                                            {(() => {
                                                const importantCols = FILE_TYPE_IMPORTANT_COLUMNS[selectedFileType] || [];
                                                return (
                                                    <>
                                                        <div className="text-[10px] sm:text-xs text-black mb-1 font-medium">
                                                            Important columns in this file: {importantCols.length}
                                                        </div>
                                                        <div className="bg-white rounded-lg border border-blue-200 p-2 max-h-28 overflow-y-auto">
                                                            <div className="flex flex-wrap gap-1.5">
                                                                {importantCols.map((col, idx) => (
                                                                    <span
                                                                        key={idx}
                                                                        className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-mono bg-gray-100 text-black border border-gray-200"
                                                                    >
                                                                        {col.toUpperCase()}
                                                                    </span>
                                                                ))}
                                                            </div>
                                                        </div>
                                                        <div className="text-[10px] sm:text-[11px] text-gray-600 mt-1.5 leading-snug">
                                                            Column names can be spelled in any case, spacing or punctuation (e.g. "engine serial no." is accepted).
                                                            Every other column in the file is imported automatically as a dynamic column.
                                                        </div>
                                                    </>
                                                );
                                            })()}
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
                                                    <div className="flex items-center gap-1.5 bg-white px-2 py-1 rounded-full border border-gray-200 shadow-sm max-w-full">
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
                                    <div className="flex items-center justify-end gap-1.5 mt-2 max-sm:flex-wrap max-md:flex-wrap max-md:gap-2">
                                        {filePreview && (
                                            <button
                                                onClick={togglePreview}
                                                className="inline-flex items-center gap-1 px-2 py-1 text-[10px] sm:text-xs font-medium rounded-lg transition-colors border border-gray-200"
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
                                                Match the missing columns below, select the correct file type, or fix the file.
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Column Mapping — resolve important columns the file names differently */}
                            {filePreview && selectedFileType && mappingInfo.notFound.length > 0 && (
                                <div className="bg-white border border-gray-300 rounded-lg p-2 sm:p-3">
                                    <h4 className="text-[11px] sm:text-xs font-semibold text-black mb-1">
                                        Match file columns
                                    </h4>
                                    <p className="text-[10px] sm:text-[11px] text-gray-600 mb-2">
                                        These important columns were not found in the file. If the file has them
                                        under a different name (e.g. "Dt" instead of "Date"), select that column —
                                        it will be imported with the correct name. Your Excel file is not changed.
                                    </p>
                                    <div className="space-y-1.5">
                                        {mappingInfo.notFound.map((col) => {
                                            const isRequired = (FILE_TYPE_REQUIRED_COLUMNS[selectedFileType] || [])
                                                .some(r => tightHeader(r) === tightHeader(col));
                                            const usedHeaders = new Set(
                                                Object.entries(columnMapping)
                                                    .filter(([c, h]) => c !== col && h && h !== '__SKIP__')
                                                    .map(([, h]) => h)
                                            );
                                            const options = mappingInfo.unmatchedHeaders.filter(h => !usedHeaders.has(h));
                                            const resolved = columnMapping[col] && (
                                                columnMapping[col] === '__SKIP__' ? !isRequired : true
                                            );
                                            return (
                                                <div key={col} className="flex items-center gap-2 flex-wrap">
                                                    <span className="font-mono text-[10px] sm:text-[11px] px-1.5 py-0.5 bg-gray-100 border border-gray-200 rounded-md">
                                                        {col.toUpperCase()}{isRequired ? ' *' : ''}
                                                    </span>
                                                    <span className="text-[10px] text-gray-400">=</span>
                                                    <select
                                                        value={columnMapping[col] || ''}
                                                        onChange={(e) => setColumnMapping(prev => ({ ...prev, [col]: e.target.value }))}
                                                        className="text-[10px] sm:text-[11px] border border-gray-300 rounded-md px-1.5 py-1 bg-white max-w-[240px]"
                                                    >
                                                        <option value="">-- select file column --</option>
                                                        {options.map(h => (
                                                            <option key={h} value={h}>{h}</option>
                                                        ))}
                                                        {!isRequired && (
                                                            <option value="__SKIP__">Not in file — continue without it</option>
                                                        )}
                                                    </select>
                                                    {resolved && (
                                                        <CheckCircleIcon className="h-3.5 w-3.5 text-green-600" />
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                    <p className="text-[10px] text-gray-500 mt-1.5">
                                        * required — the upload stays blocked until these are matched.
                                    </p>
                                </div>
                            )}

                            {/* File Preview Section */}
                            {showPreview && filePreview && (
                                <div className="mt-3 sm:mt-4 border border-gray-200 rounded-lg sm:rounded-xl overflow-hidden">
                                    <div className="px-2 sm:px-3 py-1.5 sm:py-2 border-b border-gray-200 flex flex-col xs:flex-row xs:items-center justify-between gap-1.5"
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
                                                            className="px-1.5 sm:px-2 py-1 sm:py-1.5 text-left font-medium text-black uppercase tracking-wider border-r border-gray-200 last:border-r-0 whitespace-nowrap"
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
                                                                className="px-1.5 sm:px-2 py-1 sm:py-1.5 border-r border-gray-200 last:border-r-0 whitespace-nowrap text-black"
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
                                        <div className="bg-gray-50 px-2 sm:px-3 py-1 text-[10px] sm:text-xs text-black text-center border-t border-gray-200">
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
                                <div className="mt-3 sm:mt-4 border-t border-gray-200 pt-3 sm:pt-4">
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
                                                        <div className="mt-0.5 flex gap-2 text-[10px] max-sm:flex-wrap">
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
            </div>

            {/* Upload Confirmation Modal */}
            {showUploadConfirm && files[0] && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm p-4 sm:p-5">
                        <div className="flex items-start gap-2">
                            <InformationCircleIcon className="h-5 w-5 flex-shrink-0" style={{ color: themeColor }} />
                            <div className="min-w-0 flex-1">
                                <h3 className="text-sm font-semibold text-black">Confirm upload</h3>
                                <p className="text-xs text-gray-600 mt-1">
                                    Please make sure this is the correct file before uploading:
                                </p>
                                <div className="mt-2 bg-gray-50 border border-gray-200 rounded-lg p-2 text-xs space-y-1">
                                    <div>
                                        <span className="text-gray-500">File: </span>
                                        <span className="font-medium text-black break-all">{files[0].name}</span>
                                    </div>
                                    <div>
                                        <span className="text-gray-500">Import as: </span>
                                        <span className="font-medium text-black">{getFileTypeLabel(selectedFileType)}</span>
                                    </div>
                                    {filePreview && (
                                        <div>
                                            <span className="text-gray-500">Rows: </span>
                                            <span className="font-medium text-black">{filePreview.totalRows}</span>
                                            <span className="text-gray-500"> · Columns: </span>
                                            <span className="font-medium text-black">{filePreview.totalColumns}</span>
                                        </div>
                                    )}
                                    {Object.entries(columnMapping).filter(([, h]) => h && h !== '__SKIP__').length > 0 && (
                                        <div>
                                            <span className="text-gray-500">Matched columns: </span>
                                            <span className="font-medium text-black">
                                                {Object.entries(columnMapping)
                                                    .filter(([, h]) => h && h !== '__SKIP__')
                                                    .map(([col, hdr]) => `${hdr} → ${col}`)
                                                    .join(', ')}
                                            </span>
                                        </div>
                                    )}
                                </div>
                                <p className="text-[11px] text-gray-500 mt-2">
                                    Existing records with the same key will be updated; new records will be added.
                                </p>
                            </div>
                        </div>
                        <div className="flex justify-end gap-2 mt-4">
                            <button
                                onClick={() => setShowUploadConfirm(false)}
                                className="px-3 py-1.5 text-xs rounded-lg border border-gray-300 text-black hover:bg-gray-50"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={performUpload}
                                className="px-3 py-1.5 text-xs rounded-lg text-white font-medium hover:opacity-90"
                                style={{ background: themeColor }}
                            >
                                Yes, upload this file
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Import;