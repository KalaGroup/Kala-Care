import React, { useState, useEffect, useRef } from 'react';
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
import { startUpload, finishUpload, useUploads } from '../utils/uploadStatus';
import { visibleImportFileTypes } from '../utils/pagePermission';

const API_BASE_URL = import.meta.env.VITE_BACKEND_URL;

// Id of this page's running background import. Module scope on purpose: the
// component's `uploading` state dies when the user navigates away, but the
// request keeps running — on remount the page re-detects the job from here.
let activeImportJobId = null;

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
    "LMS Data from Insia",
    "Open SR Load Report",
    "MaxTTR - Oil Change SR Zero Labour Flag",
    "Response Time & MaxTTR Details",
    "CDI Detail Report",
    "EFSR Report",
    "AMC Agreement Expiry Planner",
    "All Invoice Detailed Report"
];

// Display names differing from the backend file type (none right now — the
// former "Open SR Data" was renamed on the backend itself).
const FILE_TYPE_LABELS = {};
const getFileTypeLabel = (type) => FILE_TYPE_LABELS[type] || type;

// Order shown in the file-type dropdown: A -> Z on the label the user actually
// reads (FILE_TYPES itself stays in backend order, so adding a type there needs
// no thought about where it lands in the menu).
const FILE_TYPES_SORTED = [...FILE_TYPES].sort((a, b) =>
    getFileTypeLabel(a).localeCompare(getFileTypeLabel(b), undefined, { sensitivity: 'base' })
);

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
    // Full header list of the real export. Only the six in
    // FILE_TYPE_IMPORTANT_COLUMNS are stored in their own DB fields; the other
    // fifteen ride along as dynamic columns.
    "AMC Agreement Expiry Planner": [
        "ZONE NAME", "SD ID", "SD NAME", "BRANCH ID", "BRANCH NAME",
        "AGREEMENT NUMBER", "AGREEMENT NAME", "AGREEMENT TYPE", "AGREEMENT STATUS",
        "AGREEMENT START DATE", "AGREEMENT END DATE", "NUMBER OF AGREEMENT YEARS",
        "SEGMENT", "INSTANCE ID", "APPLICATION CODE", "ENGINE SERIAL NO",
        "ENGINE MODEL", "ACCOUNT NAME", "CUSTOMER NAME", "CUSTOMER PHONE NUMBER",
        "INSTALLATION SITE ADDRESS"
    ],
    // Second LMS layout: the same lead export WITHOUT an Instance ID. Only the
    // seven columns in FILE_TYPE_IMPORTANT_COLUMNS are stored in their own DB
    // fields; the other nineteen ride along as dynamic columns.
    "LMS Data from Insia": [
        "LEAD NUMBER", "LEAD CREATED DATE", "MODE OF LEAD CREATION",
        "LEAD RAISED BY", "LEAD RAISED FOR", "SD NAME", "SD ID", "BRANCH NAME",
        "BRANCH ID", "PRODUCT LIST", "PRODUCT TYPE", "LEAD ASSIGNED TO",
        "LEAD STATUS", "ACCOUNT ID", "ACCOUNT NAME", "ZONE", "LEAD SR NUMBER",
        "ENGINE MODEL", "KVA RATING", "SERVICE ENGINEER NAME",
        "TELE CALLER NAME", "QUOTATION NUMBER", "QUOTATION SUBMIT DATE",
        "QUOTATION APPROVAL DATE", "ORDER NUMBER", "ORDER CREATION DATE"
    ],
    // Full header list of the real export (29 columns). Only the ten in
    // FILE_TYPE_IMPORTANT_COLUMNS are stored in their own DB fields; the other
    // nineteen ride along as dynamic columns.
    "All Invoice Detailed Report": [
        "ZONE NAME", "SD ID", "SD NAME", "BRANCH ID", "BRANCH NAME", "SEGMENT",
        "INSTANCE ID", "APPLICATION CODE", "ENGINE SERIAL NUMBER", "ACCOUNT NAME",
        "SR NUMBER", "SR TYPE", "SR SUBTYPE", "SR CLOSE DATE", "INVOICE SEGMENT",
        "INVOICE TYPE", "INVOICE NUMBER", "INVOICE DATE", "INVOICE STATUS",
        "INVOICE CANCEL REASON", "INVOICE CANCEL DATE", "INVOICE AMOUNT",
        "TOTAL NET TAXABLE AMOUNT", "TOTAL DISCOUNT AMOUNT", "CGST AMOUNT",
        "SGST AMOUNT", "IGST AMOUNT", "UGST AMOUNT", "TOTAL FRIEGHT AMOUNT"
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
        "SIC Code", "SIC Code Type", "Labour Invoice Number", "Labour Invoice Amount",
        "Part Invoice Amount",
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
    "MaxTTR - Oil Change SR Zero Labour Flag": [
        "ZONE NAME", "ASM NAME", "SD ID", "SD NAME", "BRANCH ID", "BRANCH NAME",
        "INSTANCE ID", "APPLICATION CODE", "ENGINE SERIAL NO", "ENGINE MODEL",
        "SEGMENT", "PRODUCT SEGMENT", "ACCOUNT NAME", "SR NUMBER", "SR TYPE",
        "SR SUBTYPE", "SR OPEN DATE", "SR CLOSE DATE", "MODE OF SR",
        "ZERO LABOUR FLAG", "OIL CHANGE FLAG", "COUNT OF TASKS"
    ],
    "Response Time & MaxTTR Details": [
        "ZONE NAME", "ASM NAME", "SD ID", "SD NAME", "BRANCH ID", "BRANCH NAME",
        "INSTANCE ID", "APPLICATION CODE", "ENGINE SERIAL NO", "SEGMENT",
        "PRODUCT SEGMENT", "GOEM OEM", "ACCOUNT NAME", "SR NUMBER", "SR TYPE",
        "SR SUBTYPE", "SR OPEN DATE", "SR TASK START DATE", "SR TASK END DATE",
        "SR CLOSE DATE", "ENGINEER REMARKS", "SE NAME", "SE TICKET NUM",
        "RESPONSE TIME RANGE IN HRS", "Response Time",
        "MaxTTR on Task Closed in hrs", "MaxTTR on SR Closed in hrs"
    ],
    // CDI Detail Report / EFSR Report list ONLY their fixed columns — every
    // other header in those files is imported automatically as dynamic data.
    "CDI Detail Report": [
        "ASSET NUMBER", "SR NUMBER", "BRANCH NAME", "X TECHNICIAN ID",
        "X TECHNICIAN NAME", "CDI CATEGORY", "Overall Experience",
        "ACTIVITY END DATE", "X ACCOUNT NAME", "FEEDBACK TKN CUST NAME",
        "FEEDBACK TKN CUST NUM"
    ],
    "EFSR Report": [
        "Instance ID", "SD Branch Code", "Service Request No.",
        "Appointment Number", "SR Type",
        "Task Assigned Date & Time", "Task End Date", "SR Closed Date",
        "SR Status", "Service Engineer Name", "Service Engineer UID",
        "Account", "Installation Site Address", "Customer Name",
        "Customer contact number"
    ]
};

// ============================================================================
// REQUIRED COLUMNS — the record keys a file MUST contain; upload is blocked
// without them. Mirrors the backend's critical-column validation exactly.
// ============================================================================
const FILE_TYPE_REQUIRED_COLUMNS = {
    // AGREEMENT TYPE decides what the AMC & Bandhan Projection report counts (a
    // D/BAMC type or not), AGREEMENT START DATE puts it in a month, and the
    // import itself FILTERS on AGREEMENT STATUS to keep one Active row per
    // genset. Without any of the three the file must not be accepted: the import
    // would fail on the status column, and a file missing type or start date
    // would load and leave that report silently empty.
    "AMC Population Report": ["INSTANCE ID", "AGREEMENT NUMBER", "AGREEMENT TYPE",
                              "AGREEMENT STATUS", "AGREEMENT START DATE"],
    // ASSET OPERATIONAL STATUS decides Service Penetration's population — an
    // "Inactive" asset is retired and stays out of the installed base.
    "Asset Detailed Report": ["ASSET NUMBER", "ENGINE SERIAL NO", "ASSET OPERATIONAL STATUS"],
    "Asset Details with Last Oil Service": ["ASSET NUMBER", "ENGINE SERIAL NO"],
    "Anubandhan Plus Quotes Report": ["Pulse Instance ID", "QuotationRefNo", "EngineNo"],
    "Anubandhan Quotes Report": ["Pulse Instance ID", "QuotationRefNo", "EngineNo"],
    "BandhanPlus Quotes Report": ["Pulse Instance ID", "QuotationRefNo", "EngineNo"],
    "Pulse Quotation - Service Only": ["Instance Id", "Quote ID"],
    "Regular Bandhan Customers Report": ["Pulse Instance ID", "Quotation Ref No"],
    // Everything the Employee Productivity report reads out of LMS: without
    // any of these the report loses a whole column without saying why.
    "LMS Data for ERP": [
        "Instance ID", "Lead Number", "Lead Created Date", "Lead Raised For",
        "SD Branch Code", "SD Branch Name", "Service Engineer Name",
        "Service Engineer UID", "Part Invoice Amount", "Labour Invoice Amount"
    ],
    "Open SR Load Report": ["Service Request #", "Instance Id [Asset #]", "Engine Serial#"],
    "MaxTTR - Oil Change SR Zero Labour Flag": ["INSTANCE ID", "SR NUMBER", "SR TYPE", "SR SUBTYPE"],
    // SR TYPE drives the report's SR Type split, BRANCH NAME the branch label,
    // SEGMENT splits Service Penetration's serviced assets into IND / PG.
    // SR TASK END DATE (added 2026-08-19) is the attendance date Employee
    // Productivity counts 'Days present on Task end' on — without it that column
    // and every Productivity figure read zero, so the upload is blocked.
    // RESPONSE TIME RANGE IN HRS + MaxTTR on SR Closed in hrs (added
    // 2026-08-21) are the two columns the Service Load and Response sheet reads
    // its 4 Hrs / 24 Hrs / 48 Hrs percentages from, verbatim. A file without
    // them makes those three tabs read 0% for every branch, which looks exactly
    // like nobody meeting the SLA — so the upload is blocked instead.
    "Response Time & MaxTTR Details": [
        "BRANCH ID", "BRANCH NAME", "INSTANCE ID", "SR NUMBER", "SR TYPE",
        "SEGMENT", "SR OPEN DATE", "SR TASK END DATE", "SR CLOSE DATE",
        "SE NAME", "SE TICKET NUM",
        "RESPONSE TIME RANGE IN HRS", "Response Time", "MaxTTR on SR Closed in hrs"
    ],
    // Only the record key is mandatory — the other fixed columns are warned
    // about (important), never blocking.
    "CDI Detail Report": ["SR NUMBER"],
    // The record key is Appointment Number + Service Engineer UID + Task
    // Assigned Date & Time, so all three are mandatory; the SR number stays
    // required because every row is displayed and grouped by it.
    "EFSR Report": ["Service Request No.", "Appointment Number",
        "Service Engineer UID", "Task Assigned Date & Time"],
    // Both halves of the record key, plus the date the planner exists for.
    // INSTANCE ID alone loses 19.8% of the real export (a genset renews) and
    // AGREEMENT NUMBER alone loses 1.4% (one agreement covers a fleet).
    "AMC Agreement Expiry Planner": ["INSTANCE ID", "AGREEMENT NUMBER",
        "AGREEMENT END DATE"],
    // Only the record key is mandatory — the other six fixed columns are
    // warned about (important), never blocking.
    "LMS Data from Insia": ["LEAD NUMBER"],
    // INVOICE NUMBER is the record key; the other six are every column the
    // Open Quotation Tracker reads. Without INVOICE DATE no row lands in a
    // period, without STATUS the cancelled lines count as real business, without
    // SEGMENT the OTC lines flood the service figures, without TYPE nothing
    // splits into labour and parts, without AMOUNT every value reads zero, and
    // without BRANCH ID / BRANCH NAME no row can be placed on a branch — each
    // of which looks like a real number rather than a missing column.
    // INSTANCE ID and ACCOUNT NAME are deliberately NOT required: the file's OTC
    // and Agreement lines legitimately have no genset.
    "All Invoice Detailed Report": [
        "INVOICE NUMBER", "INVOICE DATE", "INVOICE STATUS", "INVOICE SEGMENT",
        "INVOICE TYPE", "INVOICE AMOUNT", "BRANCH ID", "BRANCH NAME"
    ]
};

// ============================================================================
// IMPORTANT COLUMNS — the fixed columns the system actually uses from each
// file (matching, customer master, Drive / Non-Drive pages). They are matched
// flexibly (case / spaces / punctuation / known alternate spellings). If one
// is missing the upload still proceeds but the user is warned. Every other
// column is dynamic: imported automatically as extra data.
// ============================================================================
// Columns a REPORT counts rows on directly, rather than merely storing, mapped
// to what that column IS in the report. They are NOT styled apart in the
// important-columns list — every chip there is drawn the same — they are named
// in the note under it instead, one sentence per report.
const REPORT_COUNTED_COLUMNS = {
    // The entire month column of Annual Reports -> AMC & Bandhan Projection,
    // across all four Bandhan files.
    "PaymentUpdateDateTime": "the month column of Annual Reports \u2192 AMC & Bandhan Projection",
    "Payment Update Date Time": "the month column of Annual Reports \u2192 AMC & Bandhan Projection",
    // Open Quotation Tracker: a quotation is counted on each amount that is above
    // zero and the same column is summed for its value, so these two columns ARE
    // the quote half of that report.
    "Labor Amount": "the Labour Quote columns of the Open Quotation Tracker",
    "Parts Amount": "the Part Quote columns of the Open Quotation Tracker",
    // ... and these are its invoice half.
    "INVOICE TYPE": "the labour / part split of the Open Quotation Tracker",
    "INVOICE AMOUNT": "the Invoice Amount columns of the Open Quotation Tracker",
};

const FILE_TYPE_IMPORTANT_COLUMNS = {
    "AMC Population Report": [
        "INSTANCE ID", "AGREEMENT STATUS", "AGREEMENT NUMBER", "AGREEMENT NAME",
        "BRANCH ID", "AGREEMENT START DATE", "AGREEMENT END DATE", "KVA RATING"
    ],
    "Asset Detailed Report": [
        "ASSET NUMBER", "ENGINE SERIAL NO", "BRANCH ID", "WARRANTY EXPIRY DATE",
        "GOEM OEM", "SEGMENT", "ASSET OPERATIONAL STATUS", "ENGINE MODEL",
        "KVA RATING", "ACCOUNT NAME",
        "CUSTOMER NAME", "CONTACT PHONE NUMBER", "CONTACT EMAIL ID",
        "INSTALLATION SITE ADDRESS", "COMMISSIONING DATE", "PRODUCT SEGMENT",
        "APPLICATION CODE", "EMISSION NORM", "KRM NUMBER", "KRM STATUS"
    ],
    "Asset Details with Last Oil Service": [
        "ASSET NUMBER", "ENGINE SERIAL NO", "BRANCH ID", "LAST OIL CHANGE DATE",
        "LAST OIL CHANGE SR TYPE", "LAST SR CLOSE DATE", "LAST CLOSED SR NUMBER",
        "LAST SR TYPE", "LAST SR SUBTYPE", "LAST SERVICE HRS",
        // ACCOUNT NAME / CONTACT PHONE NUMBER / INSTALLATION SITE ADDRESS are
        // what this file contributes to the customer master.
        "ACCOUNT NAME", "CONTACT PHONE NUMBER", "INSTALLATION SITE ADDRESS"
    ],
    // PaymentUpdateDateTime is the month column of Annual Reports ->
    // AMC & Bandhan Projection: that column counts the rows of these four files
    // whose payment timestamp falls in the month being read. A file that arrives
    // without it imports fine and leaves the sheet's month empty, which is
    // exactly the kind of silence worth a warning.
    "Anubandhan Plus Quotes Report": [
        "Pulse Instance ID", "EngineNo", "QuotationRefNo", "CompanyName",
        "MobileNo", "EmailId", "State", "City", "Location",
        "CreatedDateTime", "Status", "PaymentUpdateDateTime"
    ],
    // PaymentUpdateDateTime is the month column of Annual Reports ->
    // AMC & Bandhan Projection: that column counts the rows of these four files
    // whose payment timestamp falls in the month being read. A file that arrives
    // without it imports fine and leaves the sheet's month empty, which is
    // exactly the kind of silence worth a warning.
    "Anubandhan Quotes Report": [
        "Pulse Instance ID", "EngineNo", "QuotationRefNo", "CompanyName",
        "MobileNo", "EmailId", "State", "City", "Location",
        "CreatedDateTime", "Status", "PaymentUpdateDateTime"
    ],
    // PaymentUpdateDateTime is the month column of Annual Reports ->
    // AMC & Bandhan Projection: that column counts the rows of these four files
    // whose payment timestamp falls in the month being read. A file that arrives
    // without it imports fine and leaves the sheet's month empty, which is
    // exactly the kind of silence worth a warning.
    "BandhanPlus Quotes Report": [
        "Pulse Instance ID", "EngineNo", "QuotationRefNo", "CompanyName",
        "MobileNo", "EmailId", "State", "City", "Location",
        "CreatedDateTime", "Status", "PaymentUpdateDateTime"
    ],
    // Service Dealer / Labor Amount / Parts Amount are the quote half of the
    // Open Quotation Tracker: the dealer string carries the branch (this
    // file has no branch id column at all), and a row counts as a labour
    // quotation when Labor Amount is above zero and as a part quotation when
    // Parts Amount is. Creation Date is what puts it in the period.
    "Pulse Quotation - Service Only": [
        "Instance Id", "Quote ID", "Account", "Account/Contact Phone Number",
        "Account/Contact Primary Email", "Installation Site Address",
        "Creation Date", "Service Dealer", "Labor Amount", "Parts Amount",
        "Total Amount"
    ],
    // This file spells the payment stamp with spaces; see the note above.
    // City is listed under the name the file and the importer both use, not as
    // the "Billing City" / "DG City" pair it used to be: import_regular_bandhan
    // reads a single row.get('City') into one `city` column, so the pair drew
    // two chips for one field and neither of them matched a real header. The
    // older spellings stay accepted as aliases.
    "Regular Bandhan Customers Report": [
        "Pulse Instance ID", "Genset Number", "Quotation Ref No.", "Name",
        "Mobile", "Email", "Billing Location", "DG Location",
        "State", "City", "Status", "Payment Update Date Time"
    ],
    "LMS Data for ERP": [
        "Instance ID", "Lead Number", "SD Branch Code", "SD Branch Name",
        "Account Name", "Account Contact Number", "Account Contact Email ID",
        "Installation Site Address", "Lead Created Date", "Lead Status",
        "Lead Raised By", "Lead Raised For", "SR Type", "SR Sub Type",
        "KVA Rating", "Service Engineer Name",
        "Service Engineer UID", "Part Invoice Amount", "Labour Invoice Amount",
        "Tele Caller", "Quotation Type", "Quotation Number",
        "Quotation Submit Date", "Quotation Approval Date", "Order Number"
    ],
    "Open SR Load Report": [
        "Service Request #", "Instance Id [Asset #]", "Engine Serial#",
        "SR Due Date", "SR Type", "SR Sub-Type", "Status", "Account",
        "Customer Name", "Customer Mobile #", "Primary Phone#",
        "Installation Site Address", "Oil Change Flg", "Segment", "Engine Model",
        // Engine App Code + Engine Series feed the Welcome Letter module —
        // fixed columns, not dynamic ones.
        "Engine App Code", "Engine Series",
        "SR Created Date", "Close Date/Time"
    ],
    "MaxTTR - Oil Change SR Zero Labour Flag": [
        "INSTANCE ID", "BRANCH ID", "ENGINE SERIAL NO", "ACCOUNT NAME",
        "SR NUMBER", "SR TYPE", "SR SUBTYPE", "SR OPEN DATE", "SR CLOSE DATE",
        "OIL CHANGE FLAG", "ZERO LABOUR FLAG"
    ],
    "Response Time & MaxTTR Details": [
        "BRANCH ID", "BRANCH NAME", "INSTANCE ID", "SR NUMBER", "SR TYPE",
        "SEGMENT", "SR OPEN DATE", "SR TASK END DATE", "SR CLOSE DATE",
        "SE NAME", "SE TICKET NUM",
        // ACCOUNT NAME is the customer name this file contributes.
        "ACCOUNT NAME",
        "RESPONSE TIME RANGE IN HRS", "Response Time", "MaxTTR on SR Closed in hrs"
    ],
    "CDI Detail Report": [
        // ASSET NUMBER is the genset key — the relation to the customers table
        "ASSET NUMBER", "SR NUMBER", "BRANCH NAME", "X TECHNICIAN ID",
        "X TECHNICIAN NAME", "CDI CATEGORY", "Overall Experience",
        "ACTIVITY END DATE", "X ACCOUNT NAME", "FEEDBACK TKN CUST NAME",
        "FEEDBACK TKN CUST NUM"
    ],
    "EFSR Report": [
        // Instance ID is the relation to the customers table
        "Instance ID", "SD Branch Code", "Service Request No.",
        "Appointment Number", "SR Type",
        "Task Assigned Date & Time", "Task End Date", "SR Closed Date",
        "SR Status", "Service Engineer Name", "Service Engineer UID",
        "Account", "Installation Site Address", "Customer Name",
        "Customer contact number"
    ],
    // The seven fixed columns of the second LMS layout. LEAD NUMBER is the
    // record key and LEAD SR NUMBER is the relation to the customers table:
    // this file has no Instance ID, so the SR the lead was raised on is what
    // resolves a lead to a genset. Everything else in the file is dynamic.
    "LMS Data from Insia": [
        "LEAD NUMBER", "LEAD CREATED DATE", "BRANCH ID", "ACCOUNT NAME",
        "LEAD SR NUMBER", "SERVICE ENGINEER NAME", "ORDER CREATION DATE"
    ],
    // The four fields the app reads plus AGREEMENT END DATE (what the planner
    // is for) and AGREEMENT NUMBER (the second half of the record key).
    // Everything else in the file is dynamic.
    "AMC Agreement Expiry Planner": [
        "INSTANCE ID", "AGREEMENT NUMBER", "BRANCH ID", "ACCOUNT NAME",
        "INSTALLATION SITE ADDRESS", "AGREEMENT END DATE"
    ],
    // INVOICE NUMBER is the record key and INSTANCE ID is the relation to the
    // customers table — carried only by this file's Service lines, since the OTC
    // and Agreement lines have no genset. The rest are what the Open Quotation
    // Tracker reads. Everything else in the file is dynamic.
    "All Invoice Detailed Report": [
        "INVOICE NUMBER", "INSTANCE ID", "BRANCH ID", "BRANCH NAME",
        "ACCOUNT NAME", "INVOICE DATE", "INVOICE STATUS", "INVOICE SEGMENT",
        "INVOICE TYPE", "INVOICE AMOUNT"
    ]
};

// Alternate spellings accepted for required/important columns (word-level
// renames that case/space normalization can't bridge). Mirrors backend aliases.
const IMPORTANT_COLUMN_ALIASES = {
    "Asset Detailed Report": {
        // EMISSION NORM is a FIXED column: this is the ONLY import that carries
        // the norm, and the engine model -> attachment master behind the Welcome
        // Letter and the drive Letter Master reads it off asset_detailed. KOEL
        // exports spell it with a double m often enough that the header must
        // never be allowed to fall through to a dynamic column.
        "EMISSION NORM": ["EMMISSION NORM", "EMISSION NORMS", "EMMISSION NORMS",
            "EMISSION"]
    },
    "Open SR Load Report": {
        "Engine Serial#": ["Engine Serial No", "Engine Serial Number"],
        "Service Request #": ["Service Request No", "Service Request Number"],
        "Instance Id [Asset #]": ["Instance Id", "Instance ID", "Asset Number"],
        "Oil Change Flg": ["Oil Change Flag"],
        "Engine App Code": ["Engine Application Code", "Engine Appcode", "App Code"],
        "Engine Series": ["Series"]
    },
    "MaxTTR - Oil Change SR Zero Labour Flag": {
        "INSTANCE ID": ["Instance Id [Asset #]", "Instance Id", "Asset Number"],
        "SR SUBTYPE": ["SR SUB TYPE", "SR SUB-TYPE"],
        "ZERO LABOUR FLAG": ["ZERO LABOR FLAG"],
        "OIL CHANGE FLAG": ["OIL CHANGE FLG"]
    },
    "Response Time & MaxTTR Details": {
        "INSTANCE ID": ["Instance Id [Asset #]", "Instance Id", "Asset Number"],
        "SR NUMBER": ["SR NO", "SR #", "SERVICE REQUEST NUMBER"],
        "SR SUBTYPE": ["SR SUB TYPE", "SR SUB-TYPE"],
        "SE TICKET NUM": ["SE TICKET NUMBER", "SE TICKET NO"],
        "SR TASK START DATE": ["TASK START DATE", "SR TASK START DATE & TIME",
            "SR TASK START DATETIME"],
        "SR TASK END DATE": ["TASK END DATE", "SR TASK END DATE & TIME",
            "SR TASK END DATETIME", "SR TASK CLOSED DATE"],
        "RESPONSE TIME RANGE IN HRS": ["RESPONSE TIME RANGE IN HOURS"],
        "MaxTTR on Task Closed in hrs": ["MAXTTR ON TASK CLOSED IN HOURS"],
        "MaxTTR on SR Closed in hrs": ["MAXTTR ON SR CLOSED IN HOURS"]
    },
    "CDI Detail Report": {
        "ASSET NUMBER": ["INSTANCE ID", "Instance Id [Asset #]", "Instance Id"],
        "X ACCOUNT NAME": ["ACCOUNT NAME", "ACCOUNT"],
        "FEEDBACK TKN CUST NAME": ["FEEDBACK TAKEN CUSTOMER NAME",
            "FEEDBACK TKN CUSTOMER NAME"],
        "FEEDBACK TKN CUST NUM": ["FEEDBACK TAKEN CUSTOMER NUMBER",
            "FEEDBACK TKN CUST NUMBER"],
        "SR NUMBER": ["SR NO", "SR #", "SERVICE REQUEST NUMBER", "Service Request No."],
        "BRANCH NAME": ["SD BRANCH NAME", "BRANCH"],
        "X TECHNICIAN ID": ["TECHNICIAN ID", "X TECHNICIAN CODE"],
        "X TECHNICIAN NAME": ["TECHNICIAN NAME"],
        "Overall Experience": ["OVERALL EXPERIENCE RATING", "OVERALL EXP"],
        "ACTIVITY END DATE": ["ACTIVITY END DATE & TIME", "ACTIVITY END DATETIME"]
    },
    "EFSR Report": {
        "Instance ID": ["INSTANCE ID", "Instance Id [Asset #]", "Instance Id",
            "Asset Number"],
        "Account": ["Account Name", "ACCOUNT NAME"],
        "Installation Site Address": ["INSTALLATION SITE ADDRESS",
            "Installation Address", "Site Address"],
        "Customer Name": ["CUSTOMER NAME"],
        "Customer contact number": ["Customer Contact Number",
            "CUSTOMER CONTACT NUMBER", "Customer contact no"],
        "Service Request No.": ["Service Request No", "Service Request Number",
            "Service Request #", "SR NUMBER", "SR No."],
        "Appointment Number": ["Appointment No", "Appointment No.", "Appointment #",
            "Appointment Id", "Appointment ID", "Appt Number", "Appt No",
            "Task Number", "Task No"],
        "Task Assigned Date & Time": ["Task Assigned Date", "Task Assign Date",
            "Task Assigned Date and Time"],
        "Task End Date": ["Task End Date & Time", "Task End Date and Time",
            "Task Ended Date", "Task Completion Date"],
        "SD Branch Code": ["SD Branch Id", "BRANCH ID", "Branch Code"],
        "SR Closed Date": ["SR Close Date", "SR Closed Date & Time", "SR Closure Date"],
        "Service Engineer Name": ["Service Engineer", "SE Name"],
        "Service Engineer UID": ["Service Engineer Uid", "SE UID", "SE Ticket Num"]
    },
    "Regular Bandhan Customers Report": {
        "Genset Number": ["Genset No", "Engine No"],
        "Name": ["Company Name"],
        "Mobile": ["Mobile No", "Mobile Number"],
        "Email": ["Email Id", "Email ID"],
        // Location source is Billing/DG Location — any one of the group counts
        // as present.
        "Billing Location": ["Location", "DG Location"],
        "DG Location": ["Location", "Billing Location"],
        // Older exports of this file named the city column Billing/DG City.
        "City": ["Billing City", "DG City"],
        "Quotation Ref No.": ["Quotation Ref No", "QuotationRefNo"]
    },
    "AMC Agreement Expiry Planner": {
        "INSTANCE ID": ["Instance Id [Asset #]", "Instance Id", "Asset Number"],
        "AGREEMENT NUMBER": ["AGREEMENT NO", "AGREEMENT #"],
        "AGREEMENT END DATE": ["AGREEMENT EXPIRY DATE", "EXPIRY DATE",
            "AGREEMENT END DT"],
        "ACCOUNT NAME": ["ACCOUNT"],
        "BRANCH ID": ["SD BRANCH CODE", "BRANCH CODE"],
        "INSTALLATION SITE ADDRESS": ["INSTALLATION ADDRESS", "SITE ADDRESS"]
    },
    "LMS Data from Insia": {
        // The ERP layout of the same report spells these differently.
        "LEAD NUMBER": ["Lead Number", "LEAD NO", "LEAD #"],
        "LEAD CREATED DATE": ["Lead Created Date", "LEAD CREATION DATE",
            "LEAD CREATED DATE & TIME"],
        "BRANCH ID": ["SD Branch Code", "SD BRANCH CODE", "BRANCH CODE"],
        "ACCOUNT NAME": ["Account Name", "ACCOUNT", "CUSTOMER NAME"],
        "LEAD SR NUMBER": ["Service Request Number", "SR NUMBER", "SR NO",
            "LEAD SR NO", "LEAD SERVICE REQUEST NUMBER"],
        "SERVICE ENGINEER NAME": ["Service Engineer", "SE NAME"],
        "ORDER CREATION DATE": ["Order Creation Date", "ORDER DATE",
            "ORDER CREATED DATE"]
    },
    "All Invoice Detailed Report": {
        "INSTANCE ID": ["Instance Id [Asset #]", "Instance Id", "ASSET NUMBER"],
        "INVOICE NUMBER": ["INVOICE NO", "INVOICE NO.", "INVOICE #"],
        "INVOICE DATE": ["INVOICE DATE & TIME", "INVOICE DATETIME"],
        "INVOICE AMOUNT": ["INVOICE VALUE", "TOTAL INVOICE AMOUNT"],
        "INVOICE TYPE": ["INVOICE LINE TYPE"],
        "INVOICE SEGMENT": ["INVOICE BUSINESS SEGMENT"],
        "BRANCH ID": ["SD BRANCH CODE", "BRANCH CODE"],
        "BRANCH NAME": ["SD BRANCH NAME"],
        "ACCOUNT NAME": ["ACCOUNT", "CUSTOMER NAME"]
    },
    "LMS Data for ERP": {
        "SD Branch Code": ["BRANCH ID"],
        "SD Branch Name": ["BRANCH NAME"],
        "Service Engineer Name": ["Service Engineer"],
        "Tele Caller": ["Tele-Caller Name", "Tele Caller Name"],
        "Quotation Approval Date": ["Quotation Approved Date"],
        "KVA Rating": ["kVA Rating"]
    }
};

// What the picker, the drop zone and the upload button all accept. The BACKEND
// already reads .xlsx, legacy .xls, the HTML-table exports some portals name
// ".xls", and CSV/TSV — this list was the only thing turning a CSV away, which
// is the format several of the portal reports come out as.
const ACCEPTED_EXTENSIONS = ['.xlsx', '.xls', '.csv', '.tsv', '.txt'];
const ACCEPT_ATTR = ACCEPTED_EXTENSIONS.join(',');
const ACCEPT_LABEL = '.xlsx, .xls, .csv';
const isAcceptedFile = (name) =>
    ACCEPTED_EXTENSIONS.some((ext) => String(name || '').toLowerCase().endsWith(ext));

// "engine serial no." / "ENGINE  SERIAL NO" / "EngineSerialNo" all become
// "engineserialno" — spacing, case and punctuation never block an import.
const tightHeader = (name) =>
    String(name ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');

// A real workbook announces itself in its first bytes; everything else that
// reaches this page is text (CSV / TSV, or an HTML table saved as .xls).
const ZIP_MAGIC = [0x50, 0x4b, 0x03, 0x04];                           // .xlsx / .xlsm
const OLE2_MAGIC = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];  // legacy .xls
const startsWithMagic = (bytes, magic) => magic.every((b, i) => bytes[i] === b);

// Decode an upload to text. The BOM decides, and here it is the whole problem:
// the ERP exports a "csv" that is actually UTF-16, TAB separated, and the
// browser build of SheetJS cannot decode that on its own — it needs the
// optional codepage table, which is not bundled, so XLSX.read threw and the
// page could only say "Failed to load file preview". TextDecoder is native.
const decodeUpload = (bytes) => {
    let encoding = 'utf-8';
    if (bytes[0] === 0xff && bytes[1] === 0xfe) encoding = 'utf-16le';
    else if (bytes[0] === 0xfe && bytes[1] === 0xff) encoding = 'utf-16be';
    let text = new TextDecoder(encoding).decode(bytes);
    // U+FFFD scattered through it means it was never UTF-8: the portals also
    // emit windows-1252 for the odd rupee sign or long dash.
    if (encoding === 'utf-8') {
        const bad = (text.match(/\uFFFD/g) || []).length;
        if (bad > 0 && bad > text.length / 1000) {
            text = new TextDecoder('windows-1252').decode(bytes);
        }
    }
    return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;      // strip BOM
};

// ---- Excel serial dates -------------------------------------------------
// A date cell the portal exported with GENERAL formatting is just a number:
// "days since 1899-12-30". The Open SR export does this for SR Due Date and
// Appointment Date, so the preview used to show 46368 / 43990.22916666666
// where the user expects a date. Mirrors excel_serial_to_datetime() in
// server/app/controllers/import_controller.py, including the narrow window
// (1902..2173) that keeps an ID or an amount from being read as a date.
const EXCEL_EPOCH_MS = Date.UTC(1899, 11, 30);
const SERIAL_MIN = 1000;
const SERIAL_MAX = 100000;

const excelSerialToDate = (value) => {
    if (value === null || value === undefined || value instanceof Date) return null;
    let serial;
    if (typeof value === 'number') {
        serial = value;
    } else {
        const text = String(value).trim();
        if (!/^\d{4,6}(\.\d+)?$/.test(text)) return null;   // a real date has separators
        serial = Number(text);
    }
    if (!Number.isFinite(serial) || serial < SERIAL_MIN || serial > SERIAL_MAX) return null;
    // Read back in UTC below, so the browser's own timezone never shifts the day.
    return new Date(EXCEL_EPOCH_MS + Math.round(serial * 86400) * 1000);
};

// Only a column that CALLS ITSELF a date may have a bare number shown as one.
// "update"/"updated" is stripped first: it is the one common word containing
// "date" that is not one. Kept in step with _looks_like_date_header() server side.
const looksLikeDateHeader = (name) =>
    /(date|expiry|dob)/i.test(String(name ?? '').replace(/update(?:d(?!ate))?/gi, ''));

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const pad2 = (n) => String(n).padStart(2, '0');

// dd-MMM-yyyy, with the clock only when the cell actually carries one.
const formatSheetDate = (d) => {
    const day = d.getUTCDate(), mon = d.getUTCMonth(), year = d.getUTCFullYear();
    const h = d.getUTCHours(), m = d.getUTCMinutes(), sec = d.getUTCSeconds();
    const stamp = `${pad2(day)}-${MONTHS[mon]}-${year}`;
    return (h || m || sec) ? `${stamp} ${pad2(h)}:${pad2(m)}` : stamp;
};

// What one preview cell shows. `header` decides whether a bare number is a date.
const formatPreviewCell = (value, header) => {
    if (value === null || value === undefined || value === '') return '-';
    if (value instanceof Date) {
        // cellDates gave us a real date; SheetJS builds it in local time.
        return formatSheetDate(new Date(Date.UTC(
            value.getFullYear(), value.getMonth(), value.getDate(),
            value.getHours(), value.getMinutes(), value.getSeconds()
        )));
    }
    if (looksLikeDateHeader(header)) {
        const asDate = excelSerialToDate(value);
        if (asDate) return formatSheetDate(asDate);
    }
    return String(value);
};

// The delimiter that splits this file's own rows CONSISTENTLY — a mirror of
// _pick_separator in the backend importer, so the preview shows exactly what
// the server will read. Each candidate is scored on how many of the first rows
// share the file's modal field count; a wrong separator scores badly on both.
const pickSeparator = (text) => {
    const lines = text.split(/\r\n|\r|\n/).filter((l) => l.trim()).slice(0, 50);
    if (!lines.length) return ',';
    let best = null;
    let bestScore = null;
    [',', ';', '\t', '|'].forEach((sep) => {
        const widths = {};
        lines.forEach((l) => {
            const n = l.split(sep).length;
            widths[n] = (widths[n] || 0) + 1;
        });
        const width = Object.keys(widths).map(Number).filter((w) => w >= 2)
            .sort((a, b) => (widths[b] - widths[a]) || (b - a))[0];
        if (!width) return;                       // this separator never appears
        const score = [widths[width], width];
        if (!bestScore || score[0] > bestScore[0]
            || (score[0] === bestScore[0] && score[1] > bestScore[1])) {
            best = sep;
            bestScore = score;
        }
    });
    return best || ',';                           // genuinely single-column
};

const Import = () => {
    // Who is logged in. Master Admin uploads everything; a branch admin /
    // employee reaches this page through the "Data Upload Access" flag granted
    // from Profile, and their per-file list narrows the file-type menu below
    // (the server enforces the same list on the upload endpoint).
    const currentUser = (() => {
        try { return JSON.parse(sessionStorage.getItem('user')) || null; } catch { return null; }
    })();
    const allowedFileTypes = visibleImportFileTypes(currentUser);
    const visibleFileTypes = FILE_TYPES_SORTED.filter(t => allowedFileTypes.includes(t));

    const [files, setFiles] = useState([]);
    const [uploading, setUploading] = useState(false);
    // Uploading as far as the UI is concerned: either this mount started it, or
    // a previous mount did and the background job is still running.
    const activeJobs = useUploads();
    const busy = uploading || activeJobs.some((j) => j.id === activeImportJobId);
    const [results, setResults] = useState([]);
    const [selectedFileType, setSelectedFileType] = useState('');
    const [fileTypeMenuOpen, setFileTypeMenuOpen] = useState(false);
    const fileTypeMenuCloseTimer = useRef(null);
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
                    // A workbook goes to SheetJS as bytes; anything else is
                    // decoded here and handed over as TEXT with its own
                    // separator, so neither encoding nor delimiter depends on a
                    // sniff that can throw.
                    const isWorkbook = startsWithMagic(data, ZIP_MAGIC)
                        || startsWithMagic(data, OLE2_MAGIC);
                    let workbook;
                    if (isWorkbook) {
                        // cellDates: a date-formatted cell comes back as a real
                        // Date instead of its serial number. Cells the export
                        // left as General are still numbers -- formatPreviewCell
                        // converts those, by header name.
                        workbook = XLSX.read(data, { type: 'array', cellDates: true });
                    } else {
                        const text = decodeUpload(data);
                        if (!text.trim()) throw new Error('File is empty');
                        workbook = XLSX.read(text, {
                            type: 'string', FS: pickSeparator(text), raw: true,
                        });
                    }

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
        if (busy) return;   // the drop zone is disabled while an import runs

        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            const droppedFiles = Array.from(e.dataTransfer.files);
            // Check file size
            const maxSize = 100 * 1024 * 1024; // 100MB
            const validFiles = droppedFiles.filter(file => file.size <= maxSize
                && isAcceptedFile(file.name));

            if (validFiles.length !== droppedFiles.length) {
                toast.error(`Some files exceed the 100MB size limit or are not ${ACCEPT_LABEL} files`);
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
        if (!isAcceptedFile(file.name)) {
            toast.error(`Please select a valid report file (${ACCEPT_LABEL})`);
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
        // Register with the app-wide background-upload tracker (same as the Part
        // Detail Info master import): the upload + processing poll are plain
        // requests that keep running if the user changes page, and UploadGuard
        // shows the floating banner and warns before the tab is closed/reloaded.
        const bgJob = startUpload(`${getFileTypeLabel(selectedFileType)} import`);
        activeImportJobId = bgJob;
        const uploadToast = toast.loading('Uploading file...');

        try {
            // 1. Submit the job
            const submitRes = await axios.post(`${API_BASE_URL}/import/excel`, formData, {
                headers: {
                    'Content-Type': 'multipart/form-data',
                    // The server checks this user's Data Upload rights and logs
                    // them as the uploader ("Last data update ... by").
                    'user-id': String(currentUser?.user_id || ''),
                },
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
            finishUpload(bgJob);
            if (activeImportJobId === bgJob) activeImportJobId = null;
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
                <div className="bg-white rounded-xl sm:rounded-2xl shadow-lg sm:shadow-xl">
                    {/* Card Header */}
                    <div className="px-3 sm:px-4 py-2 sm:py-3 bg-[#2f3192] rounded-t-xl sm:rounded-t-2xl">
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
                                    <div
                                        className="relative w-full md:w-80"
                                        onMouseEnter={() => {
                                            if (busy) return;
                                            if (fileTypeMenuCloseTimer.current) clearTimeout(fileTypeMenuCloseTimer.current);
                                            setFileTypeMenuOpen(true);
                                        }}
                                        onMouseLeave={() => {
                                            fileTypeMenuCloseTimer.current = setTimeout(() => setFileTypeMenuOpen(false), 150);
                                        }}
                                    >
                                        <button
                                            type="button"
                                            onClick={() => !busy && setFileTypeMenuOpen(prev => !prev)}
                                            disabled={busy}
                                            className="w-full text-left border border-gray-200 rounded-lg shadow-sm px-2 sm:px-3 py-1.5 sm:py-2 pr-7 sm:pr-8 text-[11px] sm:text-xs transition-all bg-white text-black disabled:bg-gray-50 disabled:cursor-not-allowed"
                                            style={{ borderColor: selectedFileType ? 'var(--erp-accent)' : '#D1D5DB' }}
                                        >
                                            {selectedFileType ? getFileTypeLabel(selectedFileType) : <span className="text-gray-500">Select a file type</span>}
                                        </button>
                                        <ChevronDownIcon
                                            className={`absolute right-2 sm:right-2.5 top-1/2 -translate-y-1/2 h-3 w-3 sm:h-3.5 sm:w-3.5 pointer-events-none transition-transform ${fileTypeMenuOpen ? 'rotate-180' : ''}`}
                                            style={{ color: selectedFileType ? 'var(--erp-accent)' : '#9CA3AF' }}
                                        />
                                        {/* Capped height so the list stays compact — every file type
                                            is still reachable by scrolling inside the menu. */}
                                        {fileTypeMenuOpen && (
                                            <div className="absolute left-0 right-0 top-full z-30 bg-white border border-gray-200 rounded-lg shadow-lg max-h-72 overflow-y-auto overscroll-contain">
                                                {visibleFileTypes.map(type => (
                                                    <button
                                                        key={type}
                                                        type="button"
                                                        onClick={() => {
                                                            handleFileTypeChange({ target: { value: type } });
                                                            setFileTypeMenuOpen(false);
                                                        }}
                                                        className={`w-full text-left px-2 sm:px-3 py-1.5 sm:py-2 text-[11px] sm:text-xs hover:bg-gray-100 transition-colors ${selectedFileType === type ? 'font-semibold text-[#2f3192] bg-blue-50' : 'text-black'}`}
                                                    >
                                                        {getFileTypeLabel(type)}
                                                    </button>
                                                ))}
                                            </div>
                                        )}
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
                                                {/* WHO uploaded — from the upload log; data older
                                                    than the log simply shows no uploader. */}
                                                {lastUpdatedInfo.uploaded_by_name && (
                                                    <span className="text-[10px] sm:text-xs text-black">
                                                        <span className="font-semibold">Uploaded by:</span>{" "}
                                                        {lastUpdatedInfo.uploaded_by_name}
                                                    </span>
                                                )}
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
                                                // Every chip is drawn the same; the columns a report
                                                // COUNTS on are called out in the note below instead,
                                                // so the list itself reads as one flat set.
                                                // {report sentence -> the columns of THIS file it counts}
                                                const countedByReport = importantCols.reduce((acc, col) => {
                                                    const hit = Object.keys(REPORT_COUNTED_COLUMNS)
                                                        .find(c => tightHeader(c) === tightHeader(col));
                                                    if (!hit) return acc;
                                                    const what = REPORT_COUNTED_COLUMNS[hit];
                                                    (acc[what] = acc[what] || []).push(col.toUpperCase());
                                                    return acc;
                                                }, {});
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
                                                                        className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-mono border bg-gray-100 text-black border-gray-200"
                                                                    >
                                                                        {col.toUpperCase()}
                                                                    </span>
                                                                ))}
                                                            </div>
                                                        </div>
                                                        <div className="text-[10px] sm:text-[11px] text-gray-600 mt-1.5 leading-snug">
                                                            Column names can be spelled in any case, spacing or punctuation (e.g. "engine serial no." is accepted).
                                                            Every other column in the file is imported automatically as a dynamic column.
                                                            {Object.entries(countedByReport).map(([what, cols]) => (
                                                                <span key={what}> {cols.join(', ')} {cols.length > 1 ? 'are' : 'is'} read
                                                                    by a report: {what}.</span>
                                                            ))}
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
                        ${busy ? 'opacity-50 cursor-not-allowed' : ''}
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
                                        accept={ACCEPT_ATTR}
                                        onChange={handleFileChange}
                                        className="hidden"
                                        disabled={busy}
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
                                                    Supports: {ACCEPT_LABEL} (Max: 100MB)
                                                </p>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Action Buttons */}
                                {files.length > 0 && !busy && (
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
                                                                {formatPreviewCell(
                                                                    row ? row[colIndex] : null,
                                                                    filePreview.headers[colIndex]
                                                                )}
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
                                    disabled={busy || files.length === 0 || !selectedFileType || formatError}
                                    className="flex items-center gap-1.5 px-3 sm:px-4 py-1.5 sm:py-2 text-white text-[11px] sm:text-xs font-medium rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-md hover:shadow-lg transform hover:-translate-y-0.5"
                                    style={{
                                        background: `linear-gradient(135deg, ${themeColor}, ${themeShades.dark})`,
                                    }}
                                >
                                    {busy ? (
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

                                {files.length > 0 && selectedFileType && !busy && !formatError && (
                                    <span className="text-[10px] sm:text-xs text-black truncate max-w-xs">
                                        Ready: {files[0].name}
                                    </span>
                                )}
                            </div>

                            {/* Mobile upload button */}
                            <div className="sm:hidden flex justify-center pt-1">
                                <button
                                    onClick={handleUpload}
                                    disabled={busy || files.length === 0 || !selectedFileType || formatError}
                                    className="w-full flex items-center justify-center gap-1.5 px-3 py-2 text-white text-[11px] font-medium rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-md"
                                    style={{
                                        background: `linear-gradient(135deg, ${themeColor}, ${themeShades.dark})`,
                                    }}
                                >
                                    {busy ? (
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
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm p-4 sm:p-5 max-h-[90vh] overflow-y-auto">
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