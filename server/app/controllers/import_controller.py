import pandas as pd
from datetime import datetime, timedelta
from sqlalchemy.orm import Session
from sqlalchemy import and_, or_
from sqlalchemy.exc import IntegrityError
from fastapi import UploadFile, HTTPException
import io
import csv
import codecs
import re
import json

from app.time_utils import now_ist
from app.models.customer_model import (
    Customer, AMCAgreement, AssetDetailed, AssetService,
    AnubandhanPlusQuote, AnubandhanQuote, BandhanPlusQuote,
    PulseQuotation, RegularBandhan, LMSData, OpenSRLoadReport, MaxTTROilChangeSRZeroLabourFlag,
    ResponseTimeMaxTTR, CDIDetailReport, EFSRReport, AMCExpiryPlanner, LMSInsia,
    AllInvoiceReport
)

# ==========================================================================
# DYNAMIC COLUMN SUPPORT
#
# Every header the code knows about, per file type, spelled exactly the way
# the import functions reference it (the "canonical" name). Before any file
# is processed its headers are renamed to these canonical names using a
# flexible match (exact -> case/extra-space insensitive -> alphanumeric-only),
# so "agreement end date", "AGREEMENT  END  DATE" or "Agreement End Date"
# all import fine. Columns that match nothing here are treated as DYNAMIC:
# they are kept per-row as JSON in the new `extra_data` column instead of
# breaking the import.
# ==========================================================================

_QUOTE_FILE_COLUMNS = [
    'Id', 'QuotationRefNo', 'CompanyName', 'EngineNo', 'ContactPersonName',
    'MobileNo', 'EmailId', 'GensetKVA', 'Zone', 'State', 'City', 'Location',
    'NoOfYears', 'GensetRunningPerYear', 'CreatedDateTime', 'Status',
    'PaymentType', 'TransactionId', 'BankName', 'AccountNo', 'DateOfPayment',
    'PaymentUpdateDateTime', 'IsNEFTConfirm', 'IsChequeConfirm',
    'Cheque deposited-Address of YES Bank Branch', 'cheque given-Name of KOEL Dealership',
    'Cheque Deposited', 'Cheque To Dealer', 'Employee Name', 'Pulse Id',
    'IsInvoiceSent', 'IsRefund', 'AgentId', 'QuotePrice',
    'Quotation Value Including tax', 'Name of Agent', 'Actual Amount',
    'Reason of Short Payment', 'Status updated by Admin', 'Quotation Expiry Date',
    'IsExpired', 'Payment Updated Month', 'Pulse Instance ID', 'New Price Applicable',
    'QuotationType'
]

FILE_KNOWN_COLUMNS = {
    'AMC Population Report': [
        'INSTANCE ID', 'ZONE NAME', 'SD ID', 'SD NAME', 'BRANCH ID', 'BRANCH NAME',
        'SEGMENT', 'KVA RATING', 'ENGINE MODEL', 'AGREEMENT NUMBER',
        'NUMBER OF AGREEMENT YEARS', 'AGREEMENT NAME', 'AGREEMENT STATUS',
        'AGREEMENT TYPE', 'AGREEMENT CREATED DATE', 'AGREEMENT START DATE',
        'AGREEMENT END DATE', 'AGREEMENT PRODUCT NAME', 'AGREEMENT INVOICE TYPE',
        'COMMISSIONING DATE', 'LAST AGREEMENT NUMBER', 'LAST AGREEMENT NO OF YEARS',
        'LAST AGREEMENT TYPE', 'LAST AGREEMENT STATUS', 'LAST AGREEMENT PRODUCT NAME',
        'LAST AGREEMENT START DATE', 'LAST AGREEMENT END DATE'
    ],
    'Asset Detailed Report': [
        'ZONE NAME', 'SD ID', 'SD NAME', 'BRANCH ID', 'BRANCH NAME', 'DISTRICT',
        'ASSET NUMBER', 'COMMISSIONING DATE', 'INSTALLATION DATE', 'GOEM OEM',
        'APPLICATION CODE', 'EMISSION NORM', 'ENGINE SERIAL NO', 'ENGINE MODEL', 'ACCOUNT NAME',
        'CUSTOMER NAME', 'CONTACT PHONE NUMBER', 'CONTACT EMAIL ID',
        'WARRANTY EXPIRY DATE', 'INSTALLATION SITE ADDRESS', 'PRODUCT SEGMENT',
        'SEGMENT', 'CUSTOMER SEGMENT', 'ASSET OPERATIONAL STATUS', 'KRM NUMBER',
        'KRM STATUS', 'KRM ACTIVE DATE', 'KRM INACTIVE DATE',
        'KRM SUBSCRIPTION START DATE', 'KRM SUBSCRIPTION END DATE', 'KVA RATING'
    ],
    'Asset Details with Last Oil Service': [
        'ZONE NAME', 'SD ID', 'SD NAME', 'BRANCH ID', 'BRANCH NAME', 'ASSET NUMBER',
        'COMMISSIONING DATE', 'PRODUCT SEGMENT', 'APPLICATION CODE',
        'ENGINE SERIAL NO', 'ACCOUNT NAME', 'CONTACT PHONE NUMBER',
        'LAST CLOSED SR NUMBER', 'LAST SR TYPE', 'LAST SR SUBTYPE',
        'LAST SR CLOSE DATE', 'LAST OIL CHANGE SR NUMBER', 'LAST OIL CHANGE SR TYPE',
        'LAST OIL CHANGE SR SUB TYPE', 'LAST OIL CHANGE DATE',
        'INSTALLATION SITE ADDRESS', 'LAST SERVICE HRS'
    ],
    'Anubandhan Plus Quotes Report': _QUOTE_FILE_COLUMNS,
    'Anubandhan Quotes Report': _QUOTE_FILE_COLUMNS,
    'BandhanPlus Quotes Report': _QUOTE_FILE_COLUMNS,
    'Pulse Quotation - Service Only': [
        'Creation Date', 'Quote ID', 'First level observations', 'Quote Status',
        'SR Type', 'SR Sub Type', 'Instance Id', 'Account', 'Bill To Address',
        'Ship To Address', 'First Name', 'Last Name', 'Account/Contact Phone Number',
        'Installation Site Address', 'Account/Contact Primary Email', 'Service Dealer',
        'Labor Amount', 'Parts Amount', 'Total Amount', 'Prepared By', 'Recommended By',
        'Finance Company Address', 'Account Number', 'Purpose Of Quotation', 'SR#:',
        'Quote Revised Flag', 'Quote Submitted Date', 'Exception Enquiry #', 'Lead #',
        'Quotation Lead Assigned Name', 'Quotation Lead Assigned Job Title',
        'Quotation Lead Assigned Phone Number', 'Quotation Lead Assigned UID'
    ],
    'Regular Bandhan Customers Report': [
        'Id', 'Quotation Ref No', 'Company Name', 'Engine No', 'Contact Person Name',
        'Mobile No', 'Email Id', 'Genset KVA', 'Zone', 'State', 'City', 'Location',
        'No Of Years', 'Genset Running Per Year', 'Created Date Time', 'Status',
        'PaymentType', 'Transaction Id', 'Bank Name', 'Account No', 'Date Of Payment',
        'Payment Update Date Time', 'Is NEFT Confirm', 'Is Cheque Confirm',
        'Cheque deposited-Address of YES Bank Branch', 'cheque given-Name of KOEL Dealership',
        'Cheque Deposited', 'Cheque To Dealer', 'Employee Name', 'Pulse Id',
        'Is Invoice Sent', 'Is Refund', 'Agent Id', 'QuotePrice',
        'Quotation Value Including tax', 'Name of Agent', 'Actual Amount',
        'Reason of Short Payment', 'Status updated by Admin', 'Quotation Expiry Date',
        'IsExpired', 'Payment Updated Month', 'Pulse Instance ID', 'New Price Applicable',
        'Quotation Type', 'First PM Date', 'Agreement start date'
    ],
    'LMS Data for ERP': [
        'Sr. No.',  # running row number in some LMS layouts — recognized, not stored
        'Instance ID', 'Lead Number', 'Lead Created Date', 'Lead Raised By',
        'Lead Status', 'Lead Raised For', 'Lead Assigned To', 'SD Code', 'SD Name',
        'SD Branch Name', 'SD Branch Code', 'Service Request Number', 'SR Type',
        'SR Sub Type', 'SR Sub Type.1', 'Account ID', 'Account Name',
        'Account Contact Number', 'Account Contact Email ID', 'Tele-Caller Name',
        'Tele-Caller UID', 'Tele Caller Mobile Number', 'Enquiry Allocation Remarks',
        'Engine App Code', 'Engine Serial No', 'Engine Model', 'Pin Code', 'Segment',
        'kVA Rating', 'Commissioning Date', 'Installation Site Address', 'City',
        'District', 'State', 'Asset Contact Name', 'Asset Contact Phone Number',
        'eFSR Contact Name', 'eFSR Customer Number', 'Qualifying Date',
        'Quotation Type', 'Quotation Number', 'Quotation Approved Date',
        'Mode Of Lead Creation', 'Quotation Submit Date', 'Quotation Labour Amt',
        'Quotation Part Amt', 'Total Quote Amount', 'Quotation Lead Assigned Name',
        'Quotation Lead Assigned UID', 'Quotation Lead Assigned Job Title',
        'Enquiry Loss Reason', 'Service Engineer Name', 'Service Engineer UID',
        'Service Engineer Mobile Number', 'Order Number', 'SIC Code', 'SIC Code Type',
        'Labour Invoice Number', 'Labour Invoice Amount', 'Part Invoice Amount',
        'Part Invoice Number',
        'Lead Source', 'Next Action Required', 'New Contact', 'Lead Contact Number',
        'Next Action Date', 'Lead Assign To SD'
    ],
    # 'LMS Data from Insia' deliberately lists ONLY its seven fixed columns: every other
    # header in that file (MODE OF LEAD CREATION, LEAD RAISED BY / FOR, SD NAME,
    # SD ID, BRANCH NAME, PRODUCT LIST, PRODUCT TYPE, LEAD ASSIGNED TO,
    # LEAD STATUS, ACCOUNT ID, ZONE, ENGINE MODEL, KVA RATING,
    # TELE CALLER NAME, QUOTATION NUMBER, QUOTATION SUBMIT DATE,
    # QUOTATION APPROVAL DATE, ORDER NUMBER) is dynamic and lands in extra_data.
    'LMS Data from Insia': [
        'LEAD NUMBER', 'LEAD CREATED DATE', 'BRANCH ID', 'ACCOUNT NAME',
        'LEAD SR NUMBER', 'SERVICE ENGINEER NAME', 'ORDER CREATION DATE'
    ],
    'Open SR Load Report': [
        'Instance Id [Asset #]', 'Service Request #', 'SR Due Date', 'SR Type',
        'Appointment Date', 'Service Dealer', 'Status', 'Problem Code',
        'Close Date/Time', 'VOC', 'Contact Last Name', 'Installation Site Address',
        'Account', 'Engine App Code', 'Engine Serial#', 'Segment', 'Engine Series',
        'Engine Model', 'Ticket#', 'Task Start Date', 'Task End Date',
        'Under Monitoring Date', 'Under Monitoring Remark', 'Convert PM to Wet PM Flag',
        'Convert PM to Wet PM Flag updated Date', 'Convert PM to Wet PM Flag updated by',
        'eFSR Engineer Remarks', 'Quick Ticket SR Comments', 'Actual SR Due Date',
        'SR Sub-Type', 'Customer Name', 'Customer Mobile #', 'Genset Appcode',
        'Primary Phone#', 'Contact Name', 'Mode', 'Special Tool', 'Special Tool Name',
        'Repeat', 'Assigned To', 'Oil Change Flg', 'Claim Created', 'Agreement #',
        'Cancellation Reason', 'CSP Cancellation Reasons', 'CSP Cancellation Remarks',
        'ASM/ASE Remarks', 'ASM/ASE Remarks Date', 'Battery Charger Availability',
        'Wet PM Due Flag', 'Cap Limit Approval Remarks', 'Cap Limit Deviation Remarks',
        'Cap Limit Deviation Status', 'Cap limit User details', 'CSP Prepone Flag',
        'CSP Prepone Flag updated By', 'Bandhan PM SR closure within 15 days flag',
        'Bandhan PM Lock Removal flag updated by', 'Bandhan PM Lock Removal flag updated Date',
        'Bandhan PM SR Closure @90 days max after PM Due Date flag',
        'Bandhan PM Due Date Lock Removal flag updated by',
        'Bandhan PM Due Date Lock Removal flag updated Date',
        'Bandhan Job card creation prior to 60 days flag',
        'Bandhan PM JC creation Lock Removal flag updated by',
        'Bandhan PM JC creation Lock Removal flag updated Date',
        'Account Id', 'SR Created BY', 'SR Created Date', 'eFSR KRM Number',
        'Dry CSP Approved by', 'Dry CSP Approved Date',
        'Contact Phone Number', 'Contact Email'
    ],
    'MaxTTR - Oil Change SR Zero Labour Flag': [
        'INSTANCE ID', 'ZONE NAME', 'ASM NAME', 'SD ID', 'SD NAME', 'BRANCH ID',
        'BRANCH NAME', 'APPLICATION CODE', 'ENGINE SERIAL NO', 'ENGINE MODEL',
        'SEGMENT', 'PRODUCT SEGMENT', 'ACCOUNT NAME', 'SR NUMBER', 'SR TYPE',
        'SR SUBTYPE', 'SR OPEN DATE', 'SR CLOSE DATE', 'MODE OF SR',
        'ZERO LABOUR FLAG', 'OIL CHANGE FLAG', 'COUNT OF TASKS'
    ],
    'Response Time & MaxTTR Details': [
        'ZONE NAME', 'ASM NAME', 'SD ID', 'SD NAME', 'BRANCH ID', 'BRANCH NAME',
        'INSTANCE ID', 'APPLICATION CODE', 'ENGINE SERIAL NO', 'SEGMENT',
        'PRODUCT SEGMENT', 'GOEM OEM', 'ACCOUNT NAME', 'SR NUMBER', 'SR TYPE',
        'SR SUBTYPE', 'SR OPEN DATE', 'SR TASK START DATE', 'SR TASK END DATE',
        'SR CLOSE DATE', 'ENGINEER REMARKS', 'SE NAME', 'SE TICKET NUM',
        'RESPONSE TIME RANGE IN HRS', 'Response Time',
        'MaxTTR on Task Closed in hrs', 'MaxTTR on SR Closed in hrs'
    ],
    # CDI Detail Report / EFSR Report deliberately list ONLY their fixed
    # columns: every other header in those files is dynamic (extra_data).
    'CDI Detail Report': [
        'SR NUMBER', 'BRANCH NAME', 'X TECHNICIAN ID', 'X TECHNICIAN NAME',
        'CDI CATEGORY', 'Overall Experience', 'ACTIVITY END DATE',
        # The genset key: the relation from a CDI row to the customers table.
        'ASSET NUMBER',
        # The account the feedback is about, and who answered the survey.
        'X ACCOUNT NAME', 'FEEDBACK TKN CUST NAME', 'FEEDBACK TKN CUST NUM'
    ],
    'EFSR Report': [
        'SD Branch Code', 'Service Request No.', 'Appointment Number', 'SR Type',
        'SR Closed Date', 'SR Status', 'Service Engineer Name',
        'Service Engineer UID', 'Task Assigned Date & Time', 'Task End Date',
        # The relation from an eFSR task row to the customers table.
        'Instance ID',
        # The account and site (both feed the customer master) plus the
        # on-site contact for the visit.
        'Account', 'Installation Site Address', 'Customer Name',
        'Customer contact number'
    ],
    # AMC Agreement Expiry Planner: the five columns the app reads plus
    # AGREEMENT NUMBER, which is the second half of the record key. The file's
    # other 15 headers (ZONE NAME, SD ID/NAME, BRANCH NAME, AGREEMENT
    # NAME/TYPE/STATUS/START DATE, NUMBER OF AGREEMENT YEARS, SEGMENT,
    # APPLICATION CODE, ENGINE SERIAL NO, ENGINE MODEL, CUSTOMER NAME,
    # CUSTOMER PHONE NUMBER) are dynamic and land in extra_data.
    'AMC Agreement Expiry Planner': [
        'INSTANCE ID', 'AGREEMENT NUMBER', 'BRANCH ID', 'ACCOUNT NAME',
        'INSTALLATION SITE ADDRESS', 'AGREEMENT END DATE'
    ],
    # All Invoice Detailed Report: the nine columns the app reads plus INVOICE
    # NUMBER, which is the record key (30,242 rows -> 30,242 distinct numbers in
    # the real export). The file's other 19 headers (ZONE NAME, SD ID/NAME,
    # SEGMENT, APPLICATION CODE, ENGINE SERIAL NUMBER, SR NUMBER/TYPE/SUBTYPE,
    # SR CLOSE DATE, INVOICE CANCEL REASON/DATE, TOTAL NET TAXABLE AMOUNT,
    # TOTAL DISCOUNT AMOUNT, CGST/SGST/IGST/UGST AMOUNT, TOTAL FRIEGHT AMOUNT)
    # are dynamic and land in extra_data.
    'All Invoice Detailed Report': [
        'INVOICE NUMBER', 'BRANCH ID', 'BRANCH NAME', 'INSTANCE ID',
        'ACCOUNT NAME', 'INVOICE DATE', 'INVOICE STATUS', 'INVOICE SEGMENT',
        'INVOICE TYPE', 'INVOICE AMOUNT'
    ],
}

# Known alternate spellings that flexible matching alone cannot bridge
# (word-level renames, not just case/space differences).
FILE_COLUMN_ALIASES = {
    'Open SR Load Report': {
        'Oil Change Flg': ['Oil Change Flag'],
        'Engine Serial#': ['Engine Serial No', 'Engine Serial Number'],
        'Service Request #': ['Service Request No', 'Service Request Number'],
        'Instance Id [Asset #]': ['Instance Id', 'Instance ID', 'Asset Number'],
        # Engine App Code + Engine Series feed the Welcome Letter module —
        # keep them landing in their fixed columns whatever the file calls them.
        'Engine App Code': ['Engine Application Code', 'Engine Appcode', 'App Code'],
        'Engine Series': ['Series'],
    },
    'MaxTTR - Oil Change SR Zero Labour Flag': {
        'INSTANCE ID': ['Instance Id [Asset #]', 'Instance Id', 'Asset Number'],
        'SR SUBTYPE': ['SR SUB TYPE', 'SR SUB-TYPE'],
        'ZERO LABOUR FLAG': ['ZERO LABOR FLAG'],
        'OIL CHANGE FLAG': ['OIL CHANGE FLG'],
    },
    'Response Time & MaxTTR Details': {
        'INSTANCE ID': ['Instance Id [Asset #]', 'Instance Id', 'Asset Number'],
        'SR NUMBER': ['SR NO', 'SR #', 'SERVICE REQUEST NUMBER'],
        'SR SUBTYPE': ['SR SUB TYPE', 'SR SUB-TYPE'],
        'SE TICKET NUM': ['SE TICKET NUMBER', 'SE TICKET NO'],
        # SR TASK END DATE is a FIXED column: Employee Productivity counts
        # 'Days present on Task end' on it, so it must never fall through to
        # extra_data because the export spelled the header differently.
        'SR TASK START DATE': ['TASK START DATE', 'SR TASK START DATE & TIME',
                               'SR TASK START DATETIME'],
        'SR TASK END DATE': ['TASK END DATE', 'SR TASK END DATE & TIME',
                             'SR TASK END DATETIME', 'SR TASK CLOSED DATE'],
        'RESPONSE TIME RANGE IN HRS': ['RESPONSE TIME RANGE IN HOURS'],
        'MaxTTR on Task Closed in hrs': ['MAXTTR ON TASK CLOSED IN HOURS'],
        'MaxTTR on SR Closed in hrs': ['MAXTTR ON SR CLOSED IN HOURS'],
    },
    'LMS Data for ERP': {
        'kVA Rating': ['KVA RATING'],
        'SD Code': ['SD ID'],
        'SD Branch Code': ['BRANCH ID'],
        'SD Branch Name': ['BRANCH NAME'],
        # Second LMS layout (Sr. No. / Instance ID / SR Type / SR Sub Type /
        # Lead Status / KVA Rating / Service Engineer / Tele Caller /
        # Quotation Number / Quotation Submit Date / Quotation Approval Date /
        # Order Number)
        'Service Engineer Name': ['Service Engineer'],
        'Tele-Caller Name': ['Tele Caller'],
        'Quotation Approved Date': ['Quotation Approval Date'],
    },
    'CDI Detail Report': {
        'ASSET NUMBER': ['INSTANCE ID', 'Instance Id [Asset #]', 'Instance Id'],
        'X ACCOUNT NAME': ['ACCOUNT NAME', 'ACCOUNT'],
        'FEEDBACK TKN CUST NAME': ['FEEDBACK TAKEN CUSTOMER NAME',
                                   'FEEDBACK TKN CUSTOMER NAME'],
        'FEEDBACK TKN CUST NUM': ['FEEDBACK TAKEN CUSTOMER NUMBER',
                                  'FEEDBACK TKN CUST NUMBER'],
        'ACTIVITY END DATE': ['ACTIVITY END DATE & TIME', 'ACTIVITY END DATETIME'],
        'BRANCH NAME': ['SD BRANCH NAME', 'BRANCH'],
        'SR NUMBER': ['SR NO', 'SR #', 'SERVICE REQUEST NUMBER', 'Service Request No.'],
        'X TECHNICIAN ID': ['TECHNICIAN ID', 'X TECHNICIAN CODE'],
        'X TECHNICIAN NAME': ['TECHNICIAN NAME'],
        'Overall Experience': ['OVERALL EXPERIENCE RATING', 'OVERALL EXP'],
    },
    'EFSR Report': {
        'Instance ID': ['INSTANCE ID', 'Instance Id [Asset #]', 'Instance Id',
                        'Asset Number'],
        'Account': ['Account Name', 'ACCOUNT NAME'],
        'Installation Site Address': ['INSTALLATION SITE ADDRESS',
                                      'Installation Address', 'Site Address'],
        'Customer Name': ['CUSTOMER NAME'],
        'Customer contact number': ['Customer Contact Number',
                                    'CUSTOMER CONTACT NUMBER',
                                    'Customer contact no'],
        'Task Assigned Date & Time': ['Task Assigned Date', 'Task Assign Date',
                                      'Task Assigned Date and Time'],
        'Task End Date': ['Task End Date & Time', 'Task End Date and Time',
                          'Task Ended Date', 'Task Completion Date'],
        'Service Request No.': ['Service Request No', 'Service Request Number',
                                'Service Request #', 'SR NUMBER', 'SR No.'],
        'Appointment Number': ['Appointment No', 'Appointment No.', 'Appointment #',
                               'Appointment Id', 'Appointment ID', 'Appt Number',
                               'Appt No', 'Task Number', 'Task No'],
        'SD Branch Code': ['SD Branch Id', 'BRANCH ID', 'Branch Code'],
        'SR Closed Date': ['SR Close Date', 'SR Closed Date & Time', 'SR Closure Date'],
        'Service Engineer Name': ['Service Engineer', 'SE Name'],
        'Service Engineer UID': ['Service Engineer Uid', 'SE UID', 'SE Ticket Num'],
    },
    'AMC Population Report': {
        'KVA RATING': ['kVA Rating'],
    },
    'AMC Agreement Expiry Planner': {
        'INSTANCE ID': ['Instance Id [Asset #]', 'Instance Id', 'Asset Number'],
        'AGREEMENT NUMBER': ['AGREEMENT NO', 'AGREEMENT #'],
        'AGREEMENT END DATE': ['AGREEMENT EXPIRY DATE', 'EXPIRY DATE',
                               'AGREEMENT END DT'],
        'ACCOUNT NAME': ['ACCOUNT'],
        'BRANCH ID': ['SD BRANCH CODE', 'BRANCH CODE'],
        'INSTALLATION SITE ADDRESS': ['INSTALLATION ADDRESS', 'SITE ADDRESS'],
    },
    'LMS Data from Insia': {
        # This file is the LMS layout WITHOUT an Instance Id; the alternate
        # spellings are the ones the ERP layout of the same report uses.
        'LEAD NUMBER': ['Lead Number', 'LEAD NO', 'LEAD #'],
        'LEAD CREATED DATE': ['Lead Created Date', 'LEAD CREATION DATE',
                              'LEAD CREATED DATE & TIME'],
        'BRANCH ID': ['SD Branch Code', 'SD BRANCH CODE', 'BRANCH CODE'],
        'ACCOUNT NAME': ['Account Name', 'ACCOUNT', 'CUSTOMER NAME'],
        'LEAD SR NUMBER': ['Service Request Number', 'SR NUMBER', 'SR NO',
                           'LEAD SR NO', 'LEAD SERVICE REQUEST NUMBER'],
        'SERVICE ENGINEER NAME': ['Service Engineer', 'SE NAME'],
        'ORDER CREATION DATE': ['Order Creation Date', 'ORDER DATE',
                                'ORDER CREATED DATE'],
    },
    'All Invoice Detailed Report': {
        'INSTANCE ID': ['Instance Id [Asset #]', 'Instance Id', 'ASSET NUMBER'],
        'INVOICE NUMBER': ['INVOICE NO', 'INVOICE NO.', 'INVOICE #'],
        'INVOICE DATE': ['INVOICE DATE & TIME', 'INVOICE DATETIME'],
        'INVOICE AMOUNT': ['INVOICE VALUE', 'TOTAL INVOICE AMOUNT'],
        'INVOICE TYPE': ['INVOICE LINE TYPE'],
        'INVOICE SEGMENT': ['INVOICE BUSINESS SEGMENT'],
        'BRANCH ID': ['SD BRANCH CODE', 'BRANCH CODE'],
        'BRANCH NAME': ['SD BRANCH NAME'],
        'ACCOUNT NAME': ['ACCOUNT', 'CUSTOMER NAME'],
    },
    'Regular Bandhan Customers Report': {
        # Old/alternate export headers mapped onto the canonical ones
        'Engine No': ['Genset Number', 'Genset No'],
        'Company Name': ['Name'],
        'Mobile No': ['Mobile', 'Mobile Number'],
        'Email Id': ['Email', 'Email ID'],
        'Location': ['Billing Location', 'DG Location'],
        'City': ['Billing City', 'DG City'],
        'Quotation Ref No': ['Quotation Ref No.', 'QuotationRefNo'],
    },
}

# Report files: imported into their OWN table and linked to the customers table
# on instance_id, but they never trigger the cross-table matching / branch
# backfill passes that run after the other imports — those exist to reconcile
# the quote and SR files against each other, and neither of these feeds them.
# (CDI and EFSR DID once skip the customers table entirely; they now carry the
# genset key — CDI as ASSET NUMBER, EFSR as Instance ID — so each row belongs
# to a customer like every other import. LMS Data from Insia carries no genset key at
# all: its rows reach a customer through the SR the lead was raised on — see
# _resolve_instance_ids_by_sr — so the ones whose SR is not loaded yet stay
# unlinked until it is.)
STANDALONE_FILE_TYPES = {'CDI Detail Report', 'EFSR Report', 'LMS Data from Insia'}


# ==========================================================================
# UPLOAD READER
#
# Not every ".xls" that lands here is really an Excel workbook. The KOEL /
# eFSR web portals export their reports as an HTML <table> saved with an .xls
# extension (and some exports are plain CSV/TSV renamed the same way). pandas
# cannot sniff those and blows up with "Excel file format cannot be
# determined, you must specify an engine manually", so the format is detected
# from the file's own bytes here and handed to the right pandas reader.
# ==========================================================================

_ZIP_MAGIC = b'PK\x03\x04'          # .xlsx / .xlsm (zip container)
_OLE2_MAGIC = b'\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1'   # legacy binary .xls
_HTML_SNIFF = re.compile(rb'<\s*(!doctype\s+html|html|head|meta|body|table|tr|th)\b', re.I)


def read_upload_table(contents: bytes) -> pd.DataFrame:
    """Read an uploaded report into a DataFrame, whatever it actually is.

    Handles real .xlsx/.xlsm (zip), legacy binary .xls (OLE2), the HTML-table
    exports the portals name ".xls", and CSV/TSV. Raises HTTPException(400)
    with a readable message instead of leaking the pandas engine error."""
    if not contents:
        raise HTTPException(status_code=400, detail="The uploaded file is empty.")

    head = contents.lstrip()[:2048]

    if contents[:4] == _ZIP_MAGIC:
        return pd.read_excel(io.BytesIO(contents), engine='openpyxl')

    if contents[:8] == _OLE2_MAGIC:
        return pd.read_excel(io.BytesIO(contents), engine='xlrd')

    if _HTML_SNIFF.search(head):
        return _read_html_table(contents)

    # Unknown signature: let pandas try (covers .ods and anything with a
    # future engine), then fall back to HTML and finally to CSV/TSV.
    errors = []
    for reader in (_read_excel_any, _read_html_table, _read_delimited):
        try:
            return reader(contents)
        except Exception as e:
            errors.append(f"{reader.__name__.lstrip('_')}: {e}")

    # Say WHAT went wrong. The old message named the two formats the file
    # already was, which told nobody anything when a real .csv was refused.
    raise HTTPException(
        status_code=400,
        detail=("The file could not be read as Excel, an HTML report or a "
                "delimited text file. Save it as .xlsx (Excel Workbook) or .csv "
                "and upload it again. Details - " + " | ".join(errors)[:500])
    )


# Excel stores a date as "days since 1899-12-30", and a cell that never got a
# date number-format exports as that bare number instead of a date -- the Open
# SR export does exactly this for SR Due Date / Appointment Date, so the file
# arrives holding 46368 or 43990.22916666666. openpyxl/xlrd only convert cells
# that carry a date format, so those columns reached the DB as NULL.
#
# The window is deliberately narrow: only 1902-01-01 .. 2173-10-14 counts as a
# date, so an ID, a quantity or an amount that happens to sit in a date column
# is never silently turned into 1970.
_EXCEL_EPOCH = datetime(1899, 12, 30)
_SERIAL_MIN = 1000        # 1902-09-26
_SERIAL_MAX = 100000      # 2173-10-14


def excel_serial_to_datetime(value):
    """Convert an Excel date serial to a datetime, or None if `value` is not
    one. Accepts the number itself and the string form a CSV/text export
    produces ("46368", "43990.22916666666")."""
    if value is None or isinstance(value, (datetime, pd.Timestamp, bool)):
        return None
    if isinstance(value, (int, float)):
        serial = float(value)
    else:
        text = str(value).strip()
        # A real date always carries a separator; a pure number never does.
        if not re.fullmatch(r'\d{4,6}(\.\d+)?', text):
            return None
        serial = float(text)
    if not (_SERIAL_MIN <= serial <= _SERIAL_MAX):
        return None
    # Round to the nearest second: 0.22916666666 of a day is 05:30:00, and
    # floating point would otherwise land on 05:29:59.999.
    return _EXCEL_EPOCH + timedelta(seconds=round(serial * 86400))


# Only a column that CALLS ITSELF a date gets the serial treatment when it is
# dynamic -- an unmapped numeric column must never be guessed into a date.
# "Time" is not in the list on purpose: a bare clock time is a fraction of a
# day, which the serial window rejects anyway, while a DURATION column
# ("Downtime Hrs") would be inside it. "Update" is dropped first because it is
# the one common word that contains "date" without being one.
_DATE_HEADER_RE = re.compile(r'(date|expiry|dob)', re.IGNORECASE)
_NOT_A_DATE_RE = re.compile(r'update(?:d(?!ate))?', re.IGNORECASE)


def _looks_like_date_header(name) -> bool:
    return bool(_DATE_HEADER_RE.search(_NOT_A_DATE_RE.sub('', str(name or ''))))


def _read_excel_any(contents: bytes) -> pd.DataFrame:
    return pd.read_excel(io.BytesIO(contents))


def _read_html_table(contents: bytes) -> pd.DataFrame:
    """Parse an HTML-table export. Keeps the largest table on the page and
    strips the &nbsp; padding those exports are full of."""
    try:
        tables = pd.read_html(io.BytesIO(contents))
    except Exception as e:
        raise HTTPException(
            status_code=400,
            detail=f"The file looks like an HTML report but no data table could be read from it: {e}"
        )
    if not tables:
        raise HTTPException(status_code=400, detail="No data table found in the uploaded file.")

    df = max(tables, key=lambda t: t.shape[0] * max(t.shape[1], 1))
    df.columns = [str(c).replace('\xa0', ' ').strip() for c in df.columns]
    for col in df.columns:
        if df[col].dtype == object:
            df[col] = df[col].map(
                lambda v: v.replace('\xa0', ' ').strip() if isinstance(v, str) else v
            )
    return df


# The separators the portal / Excel exports actually use, in the order a tie is
# broken. Sniffing alone is not enough — see _pick_separator.
_CSV_SEPARATORS = (',', ';', '\t', '|')


def _decode_upload(contents: bytes) -> str:
    """Bytes -> text for a delimited file.

    A BOM is authoritative, and it is the one that matters here: Excel's
    "Unicode Text (*.txt)" and several portal exports are UTF-16, which
    latin-1 happily decodes into NUL-padded mojibake — the read then
    "succeeds" with column names like 'I\x00n\x00s\x00t...' instead of
    failing, so nothing downstream matches and the import silently does
    nothing. Without a BOM, try the encodings these files really come in;
    latin-1 is last because it can decode ANY byte and so must never be
    allowed to shadow a real one."""
    for bom, encoding in ((codecs.BOM_UTF8, 'utf-8-sig'),
                          (codecs.BOM_UTF32_LE, 'utf-32'),
                          (codecs.BOM_UTF32_BE, 'utf-32'),
                          (codecs.BOM_UTF16_LE, 'utf-16'),
                          (codecs.BOM_UTF16_BE, 'utf-16')):
        if contents.startswith(bom):
            try:
                return contents.decode(encoding)
            except (UnicodeDecodeError, LookupError):
                break

    # BOM-less UTF-16 (rare, but some exports drop it): every other byte is a
    # NUL, which no single-byte encoding would ever produce.
    if contents.count(b'\x00') > len(contents) // 4:
        for encoding in ('utf-16-le', 'utf-16-be'):
            try:
                return contents.decode(encoding)
            except UnicodeDecodeError:
                continue

    for encoding in ('utf-8-sig', 'cp1252', 'latin-1'):
        try:
            return contents.decode(encoding)
        except UnicodeDecodeError:
            continue
    return contents.decode('latin-1', errors='replace')


def _pick_separator(text: str) -> str:
    """The delimiter that parses this file's own header and rows CONSISTENTLY.

    Replaces pandas' `sep=None`, which delegates to csv.Sniffer and gets two
    common exports wrong without raising: a ONE-COLUMN file is split on the
    space inside its header ('Quote ID' -> 'Quote' + 'ID'), and a
    pipe-delimited file is not recognised at all. Each candidate is scored on
    how many of the first rows have the same field count as the header, then on
    how many columns that is — a wrong separator scores badly on both."""
    lines = [ln for ln in text.splitlines()[:50] if ln.strip()]
    if not lines:
        return ','

    best, best_score = None, None
    for sep in _CSV_SEPARATORS:
        try:
            rows = list(csv.reader(lines, delimiter=sep))
        except csv.Error:
            continue
        if not rows:
            continue
        widths = {}
        for r in rows:
            widths[len(r)] = widths.get(len(r), 0) + 1
        # The MODAL width, not the header's: an export with a title line above
        # its header would otherwise score every separator at one column.
        width = max((w for w in widths if w >= 2),
                    key=lambda w: (widths[w], w), default=0)
        if width < 2:
            continue                     # this separator does not appear at all
        score = (widths[width], width)
        if best_score is None or score > best_score:
            best, best_score = sep, score
    # Nothing split the file: it is genuinely single-column, and any separator
    # gives that same one column.
    return best or ','


def _read_delimited(contents: bytes) -> pd.DataFrame:
    """CSV / TSV — including the ones named .xls, exported as UTF-16, padded
    with blank lines, or carrying rows WIDER than their own header.

    That last one is why a perfectly ordinary portal CSV used to be rejected
    with "Unsupported file format": one unescaped separator inside a value
    makes the row wider than the header, and pandas aborts the whole read
    rather than keeping the file. Here the widest row decides the column count
    up front, so the stray fields land in their own 'Unnamed: n' columns (which
    the dynamic-column support then stores in extra_data) and NOT ONE ROW IS
    DROPPED."""
    text = _decode_upload(contents)
    if not text.strip():
        raise HTTPException(status_code=400, detail="The uploaded file is empty.")

    sep = _pick_separator(text)
    buf = lambda: io.StringIO(text)

    try:
        df = pd.read_csv(buf(), sep=sep, engine='python', skip_blank_lines=True)
        # When the header row is NARROWER than the data (an export with a title
        # line above its header), pandas does not complain — it quietly turns
        # the extra leading fields into a MultiIndex. Those are columns, so send
        # the file down the same path as a ragged one instead.
        if df.index.nlevels == 1:
            return df
    except pd.errors.ParserError:
        pass                             # ragged rows — handled below

    # Ragged: the WIDEST row decides the column count, so every stray field has
    # a column to land in instead of aborting the read.
    rows = [r for r in csv.reader(buf(), delimiter=sep) if any(str(c).strip() for c in r)]
    if not rows:
        raise HTTPException(status_code=400, detail="The uploaded file has no rows.")

    header = [str(h).strip() for h in rows[0]]
    widest = max(len(r) for r in rows)
    names = list(header) + [f'Unnamed: {i}' for i in range(len(header), widest)]
    # Duplicate headers would silently collapse into one column
    seen = {}
    for i, name in enumerate(names):
        if not name:
            name = f'Unnamed: {i}'
        if name in seen:
            seen[name] += 1
            name = f'{name}.{seen[name]}'
        else:
            seen[name] = 0
        names[i] = name
    # Re-serialise the rows padded to a single width and let pandas parse that.
    # Passing `names` straight to read_csv is not an option: it refuses a list
    # longer than the file's own header row, which is the entire problem here.
    # Every value goes back through csv.writer, so separators and quotes inside
    # a value survive, and dtype inference works exactly as on a clean file.
    out = io.StringIO()
    writer = csv.writer(out, lineterminator='\n')
    writer.writerow(names)
    for r in rows[1:]:
        row = list(r)[:len(names)]
        writer.writerow(row + [''] * (len(names) - len(row)))
    out.seek(0)
    return pd.read_csv(out, sep=',', engine='python', skip_blank_lines=True)


class ImportController:
    def __init__(self, db: Session):
        self.db = db
        # Optional user-defined header renames from the Import page:
        # {"file header": "important column name"} — applied before canonicalization.
        self.user_column_mapping = {}
    
    # ============ BULK PRELOAD HELPERS (NEW) ============
    def _bulk_load_by_instance_id(self, model, instance_ids):
        """Load all rows of `model` whose instance_id is in the list. Returns {instance_id: row}."""
        ids = list({iid for iid in instance_ids if iid})
        if not ids:
            return {}
        result = {}
        # Chunk to stay under DB IN-clause limits
        for i in range(0, len(ids), 1000):
            chunk = ids[i:i + 1000]
            rows = self.db.query(model).filter(model.instance_id.in_(chunk)).all()
            for r in rows:
                if r.instance_id and r.instance_id not in result:
                    result[r.instance_id] = r
        return result

    def _build_engine_to_instance_map(self, engine_serials):
        """One-shot map engine_serial_no -> instance_id from all source tables."""
        serials = list({s for s in engine_serials if s})
        if not serials:
            return {}
        mapping = {}
        sources = [
            (AssetDetailed, AssetDetailed.engine_serial_no),
            (AssetService, AssetService.engine_serial_no),
            (AnubandhanPlusQuote, AnubandhanPlusQuote.engine_no),
            (AnubandhanQuote, AnubandhanQuote.engine_no),
            (BandhanPlusQuote, BandhanPlusQuote.engine_no),
            (OpenSRLoadReport, OpenSRLoadReport.engine_serial_no),
        ]
        for i in range(0, len(serials), 1000):
            chunk = serials[i:i + 1000]
            for model, col in sources:
                rows = self.db.query(col, model.instance_id).filter(
                    col.in_(chunk), model.instance_id.isnot(None)
                ).all()
                for serial, iid in rows:
                    if serial and iid and serial not in mapping:
                        mapping[serial] = iid
        return mapping

    def _build_instance_to_branch_map(self, instance_ids):
        """One-shot map instance_id -> branch_id from all source tables."""
        ids = list({iid for iid in instance_ids if iid})
        if not ids:
            return {}
        mapping = {}
        sources = [AMCAgreement, AssetDetailed, AssetService, LMSData]
        for i in range(0, len(ids), 1000):
            chunk = ids[i:i + 1000]
            for model in sources:
                rows = self.db.query(model.instance_id, model.branch_id).filter(
                    model.instance_id.in_(chunk), model.branch_id.isnot(None)
                ).all()
                for iid, bid in rows:
                    if iid and bid and iid not in mapping:
                        mapping[iid] = bid
        return mapping
    # ============ END NEW HELPERS ============
    
    def parse_date(self, date_value):
        """Parse various date formats"""
        if pd.isna(date_value) or date_value is None or date_value == '':
            return None
        
        if isinstance(date_value, datetime):
            return date_value
        
        if isinstance(date_value, pd.Timestamp):
            return date_value.to_pydatetime()
        
        date_str = str(date_value).strip()
        
        # A date cell the portal exported with GENERAL formatting arrives as a
        # bare Excel serial ("46368", "43990.22916666666") -- openpyxl only
        # converts cells that carry a date number-format, so without this the
        # column silently imported as NULL.
        serial_date = excel_serial_to_datetime(date_value)
        if serial_date is not None:
            return serial_date
        
        # Try different date formats
        date_formats = [
            '%Y-%m-%d %H:%M:%S',
            '%Y-%m-%d',
            '%d-%m-%Y %H:%M:%S',
            '%d-%m-%Y',
            '%m/%d/%Y %H:%M:%S',
            '%m/%d/%Y',
            '%d/%m/%Y %H:%M:%S',
            '%d/%m/%Y',
            '%d-%m-%y %H:%M',
            '%d-%m-%y',
            '%d/%m/%y',
            '%Y/%m/%d',
            # eFSR export style: "7/22/2026, 4:57 PM" (with and without comma).
            # Appended at the END so no format that already parsed changes.
            '%m/%d/%Y, %I:%M %p',
            '%m/%d/%Y %I:%M %p',
            '%d/%m/%Y, %I:%M %p',
            '%d/%m/%Y %I:%M %p',
            '%m/%d/%Y, %I:%M:%S %p',
            '%d/%m/%Y, %I:%M:%S %p',
            # Minutes but no seconds, four-digit year: how the All Invoice
            # Detailed Report writes every one of its dates ("19-12-2024 10:47").
            # Only '%d-%m-%y %H:%M' (TWO-digit year) was listed, which does not
            # match a 4-digit year, so those cells parsed to NULL. Appended at
            # the END so nothing that already parsed changes.
            '%d-%m-%Y %H:%M',
            '%Y-%m-%d %H:%M',
            '%m/%d/%Y %H:%M',
            '%d/%m/%Y %H:%M'
        ]
        
        for fmt in date_formats:
            try:
                return datetime.strptime(date_str, fmt)
            except:
                continue
        
        return None
    
    def convert_to_string(self, value):
        """Convert any value to string without .0 decimal suffix"""
        if pd.isna(value) or value is None or value == '':
            return None
        
        # Convert to string
        str_value = str(value).strip()
        
        # Remove .0 at the end if it exists (for numbers like 123.0)
        if str_value.endswith('.0'):
            str_value = str_value[:-2]
        
        return str_value
    
    def clean_instance_id(self, value):
        """Clean and validate instance ID"""
        if pd.isna(value) or value is None or value == '':
            return None
        
        # Convert to string using convert_to_string to remove .0
        instance_id = self.convert_to_string(value)
        
        if not instance_id:
            return None
        
        # Check if it's a valid ID (not just a number or special chars)
        # Allow alphanumeric, hyphens, underscores, dots, slashes
        if re.match(r'^[A-Za-z0-9_\-\.\/]+$', instance_id):
            return instance_id
        else:
            # If it contains invalid characters, still return but log warning
            # This ensures data isn't lost
            return instance_id
    
    def truncate_string(self, value, max_length=500):
        """Truncate string to max_length if needed"""
        if value is None or pd.isna(value):
            return None
        
        # Convert to string using convert_to_string
        value_str = self.convert_to_string(value)
        
        if not value_str:
            return None
        
        if len(value_str) > max_length:
            return value_str[:max_length-3] + "..."
        return value_str

    # ============ DYNAMIC / FLEXIBLE COLUMN SUPPORT ============
    @staticmethod
    def _norm_header(name):
        """Case-insensitive, extra-whitespace-insensitive header key."""
        return re.sub(r'\s+', ' ', str(name).strip()).lower()

    @staticmethod
    def _tight_header(name):
        """Alphanumeric-only header key ('QuotationRefNo' == 'Quotation Ref No.')."""
        return re.sub(r'[^a-z0-9]', '', str(name).lower())

    def canonicalize_dataframe(self, df, file_type):
        """Rename file headers to the canonical names the import code expects,
        using flexible matching (exact -> normalized -> alphanumeric-only, plus
        per-file aliases). Any header that matches nothing known is DYNAMIC:
        it is left untouched and returned in `extra_cols` so each row can keep
        it as JSON in `extra_data`. Existing import logic is unchanged — it
        just sees clean canonical headers."""
        known = FILE_KNOWN_COLUMNS.get(file_type, [])
        aliases = FILE_COLUMN_ALIASES.get(file_type, {})

        # User-defined renames first (Import page mapping, e.g. "Dt" -> "SR Due Date"):
        # match the mapping key against actual headers flexibly, then rename.
        user_mapping = getattr(self, 'user_column_mapping', None)
        if user_mapping:
            user_renames = {}
            targets = set()
            for col in df.columns:
                if pd.isna(col):
                    continue
                for src, target in user_mapping.items():
                    if target in targets:
                        continue
                    if self._tight_header(col) == self._tight_header(src) and str(col) != str(target):
                        user_renames[col] = target
                        targets.add(target)
                        break
            if user_renames:
                df = df.rename(columns=user_renames)

        actual_cols = [c for c in df.columns if pd.notna(c)]
        by_exact, by_norm, by_tight = {}, {}, {}
        for c in actual_cols:
            by_exact.setdefault(str(c).strip(), c)
            by_norm.setdefault(self._norm_header(c), c)
            by_tight.setdefault(self._tight_header(c), c)

        used = set()
        rename_map = {}
        for canonical in known:
            candidates = [canonical] + list(aliases.get(canonical, []))
            found = None
            for lookup, key_fn in (
                (by_exact, lambda s: str(s).strip()),
                (by_norm, self._norm_header),
                (by_tight, self._tight_header),
            ):
                for cand in candidates:
                    col = lookup.get(key_fn(cand))
                    if col is not None and col not in used:
                        found = col
                        break
                if found is not None:
                    break
            if found is None:
                continue
            used.add(found)
            if found != canonical:
                rename_map[found] = canonical

        if rename_map:
            df = df.rename(columns=rename_map)

        known_set = set(known)
        extra_cols = [
            c for c in df.columns
            if pd.notna(c)
            and c not in known_set
            and str(c).strip() != ''
            and not str(c).startswith('Unnamed:')
        ]
        return df, extra_cols

    def collect_extra_data(self, row, extra_cols):
        """Pack the dynamic (unmapped) columns of a row into a JSON string
        {original header: value}, or None when there is nothing to keep."""
        if not extra_cols:
            return None
        out = {}
        for col in extra_cols:
            value = row.get(col)
            try:
                if value is None or pd.isna(value) or value == '':
                    continue
            except (TypeError, ValueError):
                pass
            if isinstance(value, (datetime, pd.Timestamp)):
                out[str(col)] = str(value)
            elif _looks_like_date_header(col) and excel_serial_to_datetime(value) is not None:
                # Same General-formatted-date-cell problem as parse_date, for a
                # column nothing maps to: keep the date, not the serial, so the
                # reports built off extra_data do not print "46368".
                out[str(col)] = str(excel_serial_to_datetime(value))
            else:
                str_value = self.convert_to_string(value)
                if str_value:
                    out[str(col)] = str_value
        return json.dumps(out, ensure_ascii=False, default=str) if out else None
    # ============ END DYNAMIC / FLEXIBLE COLUMN SUPPORT ============

    def extract_instance_id(self, row, file_type):
        """Extract instance_id from row based on file type"""
        instance_id = None
        
        # Exact column names for each file type
        column_mapping = {
            'AMC Population Report': 'INSTANCE ID',
            'Asset Detailed Report': 'ASSET NUMBER',
            'Asset Details with Last Oil Service': 'ASSET NUMBER',
            'Anubandhan Plus Quotes Report': 'Pulse Instance ID',
            'Anubandhan Quotes Report': 'Pulse Instance ID',
            'BandhanPlus Quotes Report': 'Pulse Instance ID',
            'Pulse Quotation - Service Only': 'Instance Id',
            'Regular Bandhan Customers Report': 'Pulse Instance ID',  # NEW format: matched by this column only
            'LMS Data for ERP': 'Instance ID',
            'Open SR Load Report': 'Instance Id [Asset #]',  # Fixed: Added the correct column name
            'AMC Agreement Expiry Planner': 'INSTANCE ID',
            # Only the Service invoice lines carry one; the OTC and Agreement
            # lines have no genset and import unlinked.
            'All Invoice Detailed Report': 'INSTANCE ID',
            # CDI names the genset key ASSET NUMBER, exactly like the Asset files
            'CDI Detail Report': 'ASSET NUMBER',
            'EFSR Report': 'Instance ID',
            # 'LMS Data from Insia' is deliberately absent: that file has NO genset
            # column. Its instance_id is resolved from LEAD SR NUMBER against
            # the SR tables instead (see _resolve_instance_ids_by_sr).
        }
        
        col_name = column_mapping.get(file_type)
        if col_name and col_name in row and pd.notna(row[col_name]) and row[col_name] != '':
            instance_id = self.clean_instance_id(row[col_name])
        
        return instance_id
    
    def extract_instance_id_from_asset(self, instance_id_asset):
        """Extract instance_id from instance_id_asset field (format: 'Asset #: INSTANCE_ID')"""
        if pd.isna(instance_id_asset) or instance_id_asset is None or instance_id_asset == '':
            return None
        
        instance_str = self.convert_to_string(instance_id_asset)
        
        if not instance_str:
            return None
        
        # Check if it contains "Asset #: " pattern
        if "Asset #:" in instance_str:
            # Extract the part after "Asset #: "
            parts = instance_str.split("Asset #:")
            if len(parts) > 1:
                instance_id = parts[1].strip()
                return self.clean_instance_id(instance_id)
        
        # If no pattern, just clean and return
        return self.clean_instance_id(instance_str)
    
    def extract_engine_serial_no(self, row, file_type):
        """Extract engine serial number from row based on file type"""
        engine_serial_no = None
        
        # Exact column names for each file type
        column_mapping = {
            'AMC Population Report': None,
            'Asset Detailed Report': 'ENGINE SERIAL NO',
            'Asset Details with Last Oil Service': 'ENGINE SERIAL NO',
            'Anubandhan Plus Quotes Report': 'EngineNo',
            'Anubandhan Quotes Report': 'EngineNo',
            'BandhanPlus Quotes Report': 'EngineNo',
            'Pulse Quotation - Service Only': None,
            'Regular Bandhan Customers Report': None,  # NEW format: instance-id matching only
            'LMS Data for ERP': None,
            'Open SR Load Report': 'Engine Serial#'
        }
        
        col_name = column_mapping.get(file_type)
        if col_name and col_name in row and pd.notna(row[col_name]) and row[col_name] != '':
            engine_serial_no = self.convert_to_string(row[col_name])
        
        return engine_serial_no
    
    def extract_branch_id(self, row, file_type):
        """Extract branch ID from row based on file type"""
        branch_id = None
        
        # Exact column names for each file type that contain branch ID
        column_mapping = {
            'AMC Population Report': 'BRANCH ID',
            'Asset Detailed Report': 'BRANCH ID',
            'Asset Details with Last Oil Service': 'BRANCH ID',
            'Anubandhan Plus Quotes Report': None,  # No branch ID in this file
            'Anubandhan Quotes Report': None,  # No branch ID in this file
            'BandhanPlus Quotes Report': None,  # No branch ID in this file
            'Pulse Quotation - Service Only': None,  # No branch ID in this file
            'Regular Bandhan Customers Report': None,  # No branch ID in this file
            'LMS Data for ERP': 'BRANCH ID',
            'Open SR Load Report': None,  # No branch ID in this file
            'Response Time & MaxTTR Details': 'BRANCH ID',
            'AMC Agreement Expiry Planner': 'BRANCH ID',
            'All Invoice Detailed Report': 'BRANCH ID',
            # CDI carries only a BRANCH NAME, never an id — see its docstring
            'CDI Detail Report': None,
            'EFSR Report': 'SD Branch Code',
            'LMS Data from Insia': 'BRANCH ID'
        }
        
        col_name = column_mapping.get(file_type)
        if col_name and col_name in row and pd.notna(row[col_name]) and row[col_name] != '':
            branch_id = self.truncate_string(row[col_name], 100)
        
        return branch_id
    
    def find_instance_id_by_engine_no(self, engine_serial_no):
        """Find instance_id from any table using engine serial number"""
        if not engine_serial_no:
            return None
        
        # Search in Asset Detailed table
        asset = self.db.query(AssetDetailed).filter(
            AssetDetailed.engine_serial_no == engine_serial_no,
            AssetDetailed.instance_id.isnot(None)
        ).first()
        if asset and asset.instance_id:
            return asset.instance_id
        
        # Search in Asset Service table
        asset_service = self.db.query(AssetService).filter(
            AssetService.engine_serial_no == engine_serial_no,
            AssetService.instance_id.isnot(None)
        ).first()
        if asset_service and asset_service.instance_id:
            return asset_service.instance_id
        
        # Search in Anubandhan Plus table
        anubandhan_plus = self.db.query(AnubandhanPlusQuote).filter(
            AnubandhanPlusQuote.engine_no == engine_serial_no,
            AnubandhanPlusQuote.instance_id.isnot(None)
        ).first()
        if anubandhan_plus and anubandhan_plus.instance_id:
            return anubandhan_plus.instance_id
        
        # Search in Anubandhan table
        anubandhan = self.db.query(AnubandhanQuote).filter(
            AnubandhanQuote.engine_no == engine_serial_no,
            AnubandhanQuote.instance_id.isnot(None)
        ).first()
        if anubandhan and anubandhan.instance_id:
            return anubandhan.instance_id
        
        # Search in BandhanPlus table
        bandhan_plus = self.db.query(BandhanPlusQuote).filter(
            BandhanPlusQuote.engine_no == engine_serial_no,
            BandhanPlusQuote.instance_id.isnot(None)
        ).first()
        if bandhan_plus and bandhan_plus.instance_id:
            return bandhan_plus.instance_id
        
        # Search in Open SR Load Report table
        open_sr = self.db.query(OpenSRLoadReport).filter(
            OpenSRLoadReport.engine_serial_no == engine_serial_no,
            OpenSRLoadReport.instance_id.isnot(None)
        ).first()
        if open_sr and open_sr.instance_id:
            return open_sr.instance_id
        
        return None
    
    def find_branch_id_by_instance_id(self, instance_id):
        """Find branch_id from any table using instance_id"""
        if not instance_id:
            return None
        
        # Search in AMC Agreement table
        amc = self.db.query(AMCAgreement).filter(
            AMCAgreement.instance_id == instance_id,
            AMCAgreement.branch_id.isnot(None)
        ).first()
        if amc and amc.branch_id:
            return amc.branch_id
        
        # Search in Asset Detailed table
        asset = self.db.query(AssetDetailed).filter(
            AssetDetailed.instance_id == instance_id,
            AssetDetailed.branch_id.isnot(None)
        ).first()
        if asset and asset.branch_id:
            return asset.branch_id
        
        # Search in Asset Service table
        asset_service = self.db.query(AssetService).filter(
            AssetService.instance_id == instance_id,
            AssetService.branch_id.isnot(None)
        ).first()
        if asset_service and asset_service.branch_id:
            return asset_service.branch_id
        
        # Search in LMS Data table
        lms = self.db.query(LMSData).filter(
            LMSData.instance_id == instance_id,
            LMSData.branch_id.isnot(None)
        ).first()
        if lms and lms.branch_id:
            return lms.branch_id
        
        return None
    
    def update_customer_branch_id(self, customer, branch_id):
        """Update customer's branch_id if it's not already set"""
        if not branch_id:
            return False
        
        # Only update if current branch_id is None or different
        if customer.branch_id is None or customer.branch_id != branch_id:
            customer.branch_id = branch_id
            return True
        
        return False
    
    def update_or_create_customer(self, instance_id, row=None, file_type=None, cache=None):
        """Update or create customer record. `cache` is a dict {instance_id: Customer} for O(1) lookup."""
        if not instance_id:
            return None
        
        # Clean instance_id again just to be safe
        instance_id = self.clean_instance_id(instance_id)
        if not instance_id:
            return None
        
        # O(1) cache hit instead of SELECT-per-row
        customer = cache.get(instance_id) if cache is not None else None
        if customer is None and cache is None:
            customer = self.db.query(Customer).filter(
                Customer.instance_id == instance_id
            ).first()
        
        if not customer:
            # Create new customer
            customer_data = {'instance_id': instance_id}
            
            # Extract customer details from row if available
            if row is not None:
                self.extract_customer_details_from_row(customer_data, row, file_type)
                
                # Extract branch_id from current row if file_type is provided
                if file_type:
                    branch_id = self.extract_branch_id(row, file_type)
                    if branch_id:
                        customer_data['branch_id'] = branch_id
            
            try:
                customer = Customer(**customer_data)
                self.db.add(customer)
                # No flush — autoflush will fire when needed; cache prevents duplicate adds
                if cache is not None:
                    cache[instance_id] = customer
            except IntegrityError:
                self.db.rollback()
                customer = self.db.query(Customer).filter(
                    Customer.instance_id == instance_id
                ).first()
                if cache is not None and customer:
                    cache[instance_id] = customer
        else:
            # Update existing customer with new details if available
            if row is not None:
                self.update_customer_details(customer, row, file_type)
                
                # Update branch_id from current row if file_type is provided
                if file_type:
                    branch_id = self.extract_branch_id(row, file_type)
                    if branch_id:
                        self.update_customer_branch_id(customer, branch_id)
                # No per-row flush
        
        return customer

    def update_customer_details(self, customer, row, file_type=None):
        """Update customer details from row data - only updates if field is None or new data is different"""
        updated = False
        
        if file_type == 'Open SR Load Report':
            field_mappings = {
                'customer_name': ['Account'],  # Only 'Account' column for Open SR
                'phone_number': ['Customer Mobile #', 'Primary Phone#', 'Contact Phone Number'],
                'email': ['Account/Contact Primary Email', 'Contact Email'],
                'location': ['Installation Site Address', 'Location']
            }
        elif file_type == 'Pulse Quotation - Service Only':
            field_mappings = {
                'customer_name': ['Account'],  # Only 'Account' column
                'phone_number': ['Account/Contact Phone Number', 'CONTACT PHONE NUMBER', 'MobileNo', 'Mobile', 'Customer Mobile #', 'Primary Phone#'],
                'email': ['Account/Contact Primary Email', 'CONTACT EMAIL ID', 'EmailId', 'Email'],
                'location': ['Installation Site Address', 'INSTALLATION SITE ADDRESS', 'Location', 'DG Location', 'Billing Location']
            }
        elif file_type == 'BandhanPlus Quotes Report':
            field_mappings = {
                'customer_name': ['CompanyName', 'Account'],
                'phone_number': ['MobileNo', 'ContactPersonName', 'Account/Contact Phone Number'],
                'email': ['EmailId', 'Account/Contact Primary Email'],
                'location': ['City']
            }
        elif file_type == 'Asset Detailed Report':
            field_mappings = {
                'customer_name': ['ACCOUNT NAME'],
                'phone_number': ['CONTACT PHONE NUMBER'],
                'email': ['CONTACT EMAIL ID'],
                'location': ['INSTALLATION SITE ADDRESS']
            }
        elif file_type == 'Regular Bandhan Customers Report':
            # NEW format: Company Name / Mobile No / Email Id; location from City
            field_mappings = {
                'customer_name': ['Company Name'],
                'phone_number': ['Mobile No'],
                'email': ['Email Id'],
                # Billing/DG Location is the location source; Billing/DG City is
                # the fallback (aliases map those headers to Location / City).
                'location': ['Location', 'City']
            }
        elif file_type == 'LMS Data for ERP':
            field_mappings = {
                'customer_name': ['Account Name'],
                'phone_number': ['Account Contact Number'],
                'email': ['Account Contact Email ID'],
                'location': ['Installation Site Address']
            }
        elif file_type == 'Response Time & MaxTTR Details':
            # File carries only the account name for the customer master
            field_mappings = {
                'customer_name': ['ACCOUNT NAME']
            }
        elif file_type == 'CDI Detail Report':
            # Feedback file: the account name is the only customer-master field
            # it can be trusted for. FEEDBACK TKN CUST NUM / NAME are the person
            # who answered the survey, not the account's own contact, so they
            # are deliberately left out.
            field_mappings = {
                'customer_name': ['X ACCOUNT NAME']
            }
        elif file_type == 'EFSR Report':
            # 'Account' is the account name and is on every row. 'Customer Name'
            # / 'Customer contact number' are the on-site contact for that visit
            # (and only on ~80% of rows), so they are not taken.
            field_mappings = {
                'customer_name': ['Account'],
                'location': ['Installation Site Address']
            }
        elif file_type == 'LMS Data from Insia':
            # The lead file's ACCOUNT NAME is the only customer-master field it
            # can be trusted for: it has no contact number, e-mail or site
            # address column at all.
            field_mappings = {
                'customer_name': ['ACCOUNT NAME']
            }
        elif file_type == 'AMC Agreement Expiry Planner':
            # The planner links to the customer master on INSTANCE ID and
            # contributes the account name and the site address. Phone/email are
            # deliberately not taken: the file's CUSTOMER PHONE NUMBER is the
            # on-site contact for the agreement, not the account's own number,
            # and there is no email column at all.
            field_mappings = {
                'customer_name': ['ACCOUNT NAME'],
                'location': ['INSTALLATION SITE ADDRESS']
            }
        elif file_type == 'All Invoice Detailed Report':
            # The invoice file's ACCOUNT NAME is the only customer-master field
            # it carries: no contact number, e-mail or site address column at
            # all. Only its Service lines have an Instance Id, so the OTC and
            # Agreement lines never reach a customer.
            field_mappings = {
                'customer_name': ['ACCOUNT NAME']
            }
        else:
            field_mappings = {
                'customer_name': ['CUSTOMER NAME', 'Name', 'CompanyName', 'ACCOUNT NAME', 'Account', 'Customer Name', 'customer_name', 'name'],
                'phone_number': ['CONTACT PHONE NUMBER', 'MobileNo', 'Mobile', 'CONTACT PHONE NUMBER', 'Account/Contact Phone Number', 'Customer Mobile #', 'Primary Phone#', 'phone_number', 'mobile_no', 'mobile'],
                'email': ['CONTACT EMAIL ID', 'EmailId', 'Email', 'CONTACT EMAIL ID', 'Account/Contact Primary Email', 'email_id', 'email'],
                'location': ['INSTALLATION SITE ADDRESS', 'Location', 'DG Location', 'Installation Site Address', 'Billing Location', 'location', 'address']
            }
        #commented by nik
        # for field, possible_cols in field_mappings.items():
        #     current_value = getattr(customer, field)
            
        #     for col in possible_cols:
        #         if col in row and pd.notna(row[col]) and row[col] != '':
        #             value = row[col]
                    
        #             if field == 'phone_number':
        #                 processed_value = re.sub(r'\D', '', self.convert_to_string(value))
        #             elif field in ['customer_name', 'email', 'location']:
        #                 processed_value = self.truncate_string(value, 500)
        #             else:
        #                 processed_value = self.convert_to_string(value)
                    
        #             if current_value is None or current_value != processed_value:
        #                 setattr(customer, field, processed_value)
        #                 updated = True
        #                 break
        
        # return updated
        #added by nik
        for field, possible_cols in field_mappings.items():
            current_value = getattr(customer, field)
            
            for col in possible_cols:
                if col in row and pd.notna(row[col]) and row[col] != '':
                    value = row[col]
                    
                    if field == 'phone_number':
                        processed_value = re.sub(r'\D', '', self.convert_to_string(value))
                    elif field in ['customer_name', 'email', 'location']:
                        processed_value = self.truncate_string(value, 500)
                    else:
                        processed_value = self.convert_to_string(value)
                    
                    # Skip if the source value processed down to nothing
                    # (e.g. "NA", "-", whitespace) so it can't wipe a good value.
                    # `continue` lets the next candidate column be tried.
                    if processed_value is None or processed_value == '':
                        continue
                    
                    if current_value is None or current_value != processed_value:
                        setattr(customer, field, processed_value)
                        updated = True
                        break
        
        return updated
    
    def extract_customer_details_from_row(self, customer_data, row, file_type=None):
        """Extract customer details from row for new customer creation"""
        
        if file_type == 'Open SR Load Report':
            field_mappings = {
                'customer_name': ['Account'],
                'phone_number': ['Customer Mobile #', 'Primary Phone#', 'Contact Phone Number'],
                'email': ['Account/Contact Primary Email', 'Contact Email'],
                'location': ['Installation Site Address', 'Location']
            }
        elif file_type == 'Pulse Quotation - Service Only':
            field_mappings = {
                'customer_name': ['Account'],
                'phone_number': ['Account/Contact Phone Number', 'CONTACT PHONE NUMBER', 'MobileNo', 'Mobile', 'Customer Mobile #', 'Primary Phone#'],
                'email': ['Account/Contact Primary Email', 'CONTACT EMAIL ID', 'EmailId', 'Email'],
                'location': ['Installation Site Address', 'INSTALLATION SITE ADDRESS', 'Location', 'DG Location', 'Billing Location']
            }
        elif file_type == 'BandhanPlus Quotes Report':
            field_mappings = {
                'customer_name': ['CompanyName', 'Account'],
                'phone_number': ['MobileNo', 'ContactPersonName', 'Account/Contact Phone Number'],
                'email': ['EmailId', 'Account/Contact Primary Email'],
                'location': ['City']
            }
        elif file_type == 'Asset Detailed Report':  # ADD THIS BLOCK
            field_mappings = {
                'customer_name': ['ACCOUNT NAME'],  # Take from ACCOUNT NAME only
                'phone_number': ['CONTACT PHONE NUMBER'],
                'email': ['CONTACT EMAIL ID'],
                'location': ['INSTALLATION SITE ADDRESS']
            }
        elif file_type == 'Regular Bandhan Customers Report':
            # NEW format: Company Name / Mobile No / Email Id; location from City
            field_mappings = {
                'customer_name': ['Company Name'],
                'phone_number': ['Mobile No'],
                'email': ['Email Id'],
                # Billing/DG Location is the location source; Billing/DG City is
                # the fallback (aliases map those headers to Location / City).
                'location': ['Location', 'City']
            }
        elif file_type == 'LMS Data for ERP':
            field_mappings = {
                'customer_name': ['Account Name'],
                'phone_number': ['Account Contact Number'],
                'email': ['Account Contact Email ID'],
                'location': ['Installation Site Address']
            }
        elif file_type == 'Response Time & MaxTTR Details':
            # File carries only the account name for the customer master
            field_mappings = {
                'customer_name': ['ACCOUNT NAME']
            }
        elif file_type == 'CDI Detail Report':
            # Feedback file: the account name is the only customer-master field
            # it can be trusted for. FEEDBACK TKN CUST NUM / NAME are the person
            # who answered the survey, not the account's own contact, so they
            # are deliberately left out.
            field_mappings = {
                'customer_name': ['X ACCOUNT NAME']
            }
        elif file_type == 'EFSR Report':
            # 'Account' is the account name and is on every row. 'Customer Name'
            # / 'Customer contact number' are the on-site contact for that visit
            # (and only on ~80% of rows), so they are not taken.
            field_mappings = {
                'customer_name': ['Account'],
                'location': ['Installation Site Address']
            }
        elif file_type == 'LMS Data from Insia':
            # The lead file's ACCOUNT NAME is the only customer-master field it
            # can be trusted for: it has no contact number, e-mail or site
            # address column at all.
            field_mappings = {
                'customer_name': ['ACCOUNT NAME']
            }
        elif file_type == 'AMC Agreement Expiry Planner':
            # The planner links to the customer master on INSTANCE ID and
            # contributes the account name and the site address. Phone/email are
            # deliberately not taken: the file's CUSTOMER PHONE NUMBER is the
            # on-site contact for the agreement, not the account's own number,
            # and there is no email column at all.
            field_mappings = {
                'customer_name': ['ACCOUNT NAME'],
                'location': ['INSTALLATION SITE ADDRESS']
            }
        elif file_type == 'All Invoice Detailed Report':
            # The invoice file's ACCOUNT NAME is the only customer-master field
            # it carries: no contact number, e-mail or site address column at
            # all. Only its Service lines have an Instance Id, so the OTC and
            # Agreement lines never reach a customer.
            field_mappings = {
                'customer_name': ['ACCOUNT NAME']
            }
        else:
            field_mappings = {
                'customer_name': ['CUSTOMER NAME', 'Name', 'CompanyName', 'ACCOUNT NAME', 'Account', 'Customer Name', 'customer_name', 'name'],
                'phone_number': ['CONTACT PHONE NUMBER', 'MobileNo', 'Mobile', 'CONTACT PHONE NUMBER', 'Account/Contact Phone Number', 'Customer Mobile #', 'Primary Phone#', 'phone_number', 'mobile_no', 'mobile'],
                'email': ['CONTACT EMAIL ID', 'EmailId', 'Email', 'CONTACT EMAIL ID', 'Account/Contact Primary Email', 'email_id', 'email'],
                'location': ['INSTALLATION SITE ADDRESS', 'Location', 'DG Location', 'Installation Site Address', 'Billing Location', 'location', 'address']
            }
        #commented by nik
        # for field, possible_cols in field_mappings.items():
        #     for col in possible_cols:
        #         if col in row and pd.notna(row[col]) and row[col] != '':
        #             value = row[col]
        #             if field == 'phone_number':
        #                 value = re.sub(r'\D', '', self.convert_to_string(value))
        #             elif field in ['customer_name', 'email', 'location']:
        #                 value = self.truncate_string(value, 500)
        #             else:
        #                 value = self.convert_to_string(value)
        #             customer_data[field] = value
        #             break
        #added by nik
        for field, possible_cols in field_mappings.items():
            for col in possible_cols:
                if col in row and pd.notna(row[col]) and row[col] != '':
                    value = row[col]
                    if field == 'phone_number':
                        value = re.sub(r'\D', '', self.convert_to_string(value))
                    elif field in ['customer_name', 'email', 'location']:
                        value = self.truncate_string(value, 500)
                    else:
                        value = self.convert_to_string(value)
                    
                    # Skip empties so we don't store "" / None, and so the
                    # next candidate column gets a chance.
                    if value is None or value == '':
                        continue
                    
                    customer_data[field] = value
                    break
    
    def validate_file_format(self, df, file_type):
        """Validate if file has all required columns based on file type"""
        
        expected_columns = {
            # 'AMC Population Report': [
            #     'ZONE NAME', 'SD ID', 'SD NAME', 'BRANCH ID', 'BRANCH NAME', 
            #     'INSTANCE ID', 'SEGMENT', 'KVA RATING', 'ENGINE MODEL', 
            #     'AGREEMENT NUMBER', 'NUMBER OF AGREEMENT YEARS', 'AGREEMENT NAME',
            #     'AGREEMENT STATUS', 'AGREEMENT TYPE', 'AGREEMENT CREATED DATE',
            #     'AGREEMENT START DATE', 'AGREEMENT END DATE', 'AGREEMENT PRODUCT NAME',
            #     'LAST AGREEMENT NUMBER', 'LAST AGREEMENT NO OF YEARS', 'LAST AGREEMENT TYPE',
            #     'LAST AGREEMENT STATUS', 'LAST AGREEMENT PRODUCT NAME',
            #     'LAST AGREEMENT START DATE', 'LAST AGREEMENT END DATE'
            # ],
            'AMC Population Report': [
                'ZONE NAME', 'SD ID', 'SD NAME', 'BRANCH ID', 'BRANCH NAME',
                'INSTANCE ID', 'SEGMENT', 'KVA RATING', 'ENGINE MODEL',
                'AGREEMENT NUMBER', 'NUMBER OF AGREEMENT YEARS', 'AGREEMENT NAME',
                'AGREEMENT STATUS', 'AGREEMENT TYPE', 'AGREEMENT CREATED DATE',
                'AGREEMENT START DATE', 'AGREEMENT END DATE', 'AGREEMENT PRODUCT NAME',
                'AGREEMENT INVOICE TYPE', 'COMMISSIONING DATE',
                'LAST AGREEMENT NO OF YEARS', 'LAST AGREEMENT TYPE',
                'LAST AGREEMENT STATUS', 'LAST AGREEMENT PRODUCT NAME',
                'LAST AGREEMENT START DATE', 'LAST AGREEMENT END DATE'
            ],
            'Asset Detailed Report': [
                'ZONE NAME', 'SD ID', 'SD NAME', 'BRANCH ID', 'BRANCH NAME',
                'DISTRICT', 'ASSET NUMBER', 'COMMISSIONING DATE', 'INSTALLATION DATE',
                'GOEM OEM', 'APPLICATION CODE', 'ENGINE SERIAL NO', 'ENGINE MODEL',
                'ACCOUNT NAME', 'CUSTOMER NAME', 'CONTACT PHONE NUMBER', 'CONTACT EMAIL ID',
                'WARRANTY EXPIRY DATE', 'INSTALLATION SITE ADDRESS', 'PRODUCT SEGMENT',
                'SEGMENT', 'CUSTOMER SEGMENT', 'ASSET OPERATIONAL STATUS',
                'KRM NUMBER', 'KRM STATUS', 'KRM ACTIVE DATE', 'KRM INACTIVE DATE',
                'KRM SUBSCRIPTION START DATE', 'KRM SUBSCRIPTION END DATE', 'KVA RATING'
            ],
            'Asset Details with Last Oil Service': [
                'ZONE NAME', 'SD ID', 'SD NAME', 'BRANCH ID', 'BRANCH NAME',
                'ASSET NUMBER', 'COMMISSIONING DATE', 'PRODUCT SEGMENT', 'APPLICATION CODE',
                'ENGINE SERIAL NO', 'ACCOUNT NAME', 'CONTACT PHONE NUMBER',
                'LAST CLOSED SR NUMBER', 'LAST SR TYPE', 'LAST SR SUBTYPE',
                'LAST SR CLOSE DATE', 'LAST OIL CHANGE SR NUMBER', 'LAST OIL CHANGE SR TYPE',
                'LAST OIL CHANGE SR SUB TYPE', 'LAST OIL CHANGE DATE',
                'INSTALLATION SITE ADDRESS', 'LAST SERVICE HRS'
            ],
            'Anubandhan Plus Quotes Report': [
                'Id', 'QuotationRefNo', 'CompanyName', 'EngineNo', 'ContactPersonName',
                'MobileNo', 'EmailId', 'GensetKVA', 'Zone', 'State', 'City', 'Location',
                'NoOfYears', 'GensetRunningPerYear', 'CreatedDateTime', 'Status',
                'PaymentType', 'TransactionId', 'BankName', 'AccountNo', 'DateOfPayment',
                'PaymentUpdateDateTime', 'IsNEFTConfirm', 'IsChequeConfirm',
                'Cheque deposited-Address of YES Bank Branch', 'cheque given-Name of KOEL Dealership',
                'Cheque Deposited', 'Cheque To Dealer', 'Employee Name', 'Pulse Id',
                'IsInvoiceSent', 'IsRefund', 'AgentId', 'QuotePrice',
                'Quotation Value Including tax', 'Name of Agent', 'Actual Amount',
                'Reason of Short Payment', 'Status updated by Admin', 'Quotation Expiry Date',
                'IsExpired', 'Payment Updated Month', 'Pulse Instance ID', 'New Price Applicable',
                'QuotationType'
            ],
            'Anubandhan Quotes Report': [
                'Id', 'QuotationRefNo', 'CompanyName', 'EngineNo', 'ContactPersonName',
                'MobileNo', 'EmailId', 'GensetKVA', 'Zone', 'State', 'City', 'Location',
                'NoOfYears', 'GensetRunningPerYear', 'CreatedDateTime', 'Status',
                'PaymentType', 'TransactionId', 'BankName', 'AccountNo', 'DateOfPayment',
                'PaymentUpdateDateTime', 'IsNEFTConfirm', 'IsChequeConfirm',
                'Cheque deposited-Address of YES Bank Branch', 'cheque given-Name of KOEL Dealership',
                'Cheque Deposited', 'Cheque To Dealer', 'Employee Name', 'Pulse Id',
                'IsInvoiceSent', 'IsRefund', 'AgentId', 'QuotePrice',
                'Quotation Value Including tax', 'Name of Agent', 'Actual Amount',
                'Reason of Short Payment', 'Status updated by Admin', 'Quotation Expiry Date',
                'IsExpired', 'Payment Updated Month', 'Pulse Instance ID', 'New Price Applicable',
                'QuotationType'
            ],
            'BandhanPlus Quotes Report': [
                'Id', 'QuotationRefNo', 'CompanyName', 'EngineNo', 'ContactPersonName',
                'MobileNo', 'EmailId', 'GensetKVA', 'Zone', 'State', 'City', 'Location',
                'NoOfYears', 'GensetRunningPerYear', 'CreatedDateTime', 'Status',
                'PaymentType', 'TransactionId', 'BankName', 'AccountNo', 'DateOfPayment',
                'PaymentUpdateDateTime', 'IsNEFTConfirm', 'IsChequeConfirm',
                'Cheque deposited-Address of YES Bank Branch', 'cheque given-Name of KOEL Dealership',
                'Cheque Deposited', 'Cheque To Dealer', 'Employee Name', 'Pulse Id',
                'IsInvoiceSent', 'IsRefund', 'AgentId', 'QuotePrice',
                'Quotation Value Including tax', 'Name of Agent', 'Actual Amount',
                'Reason of Short Payment', 'Status updated by Admin', 'Quotation Expiry Date',
                'IsExpired', 'Payment Updated Month', 'Pulse Instance ID', 'New Price Applicable',
                'QuotationType'
            ],
            'Pulse Quotation - Service Only': [
                'Creation Date', 'Quote ID', 'First level observations', 'Quote Status',
                'SR Type', 'SR Sub Type', 'Instance Id', 'Account', 'Bill To Address',
                'Ship To Address', 'First Name', 'Last Name', 'Account/Contact Phone Number',
                'Installation Site Address', 'Account/Contact Primary Email', 'Service Dealer',
                'Labor Amount', 'Parts Amount', 'Total Amount', 'Prepared By', 'Recommended By',
                'Finance Company Address', 'Account Number', 'Purpose Of Quotation', 'SR#:',
                'Quote Revised Flag', 'Quote Submitted Date', 'Exception Enquiry #', 'Lead #',
                'Quotation Lead Assigned Name', 'Quotation Lead Assigned Job Title',
                'Quotation Lead Assigned Phone Number', 'Quotation Lead Assigned UID'
            ],
            'Regular Bandhan Customers Report': [
                'Id', 'Quotation Ref No', 'Company Name', 'Engine No', 'Contact Person Name',
                'Mobile No', 'Email Id', 'Genset KVA', 'Zone', 'State', 'City', 'Location',
                'No Of Years', 'Genset Running Per Year', 'Created Date Time', 'Status',
                'PaymentType', 'Transaction Id', 'Bank Name', 'Account No', 'Date Of Payment',
                'Payment Update Date Time', 'Is NEFT Confirm', 'Is Cheque Confirm',
                'Cheque deposited-Address of YES Bank Branch', 'cheque given-Name of KOEL Dealership',
                'Cheque Deposited', 'Cheque To Dealer', 'Employee Name', 'Pulse Id',
                'Is Invoice Sent', 'Is Refund', 'Agent Id', 'QuotePrice',
                'Quotation Value Including tax', 'Name of Agent', 'Actual Amount',
                'Reason of Short Payment', 'Status updated by Admin', 'Quotation Expiry Date',
                'IsExpired', 'Payment Updated Month', 'Pulse Instance ID', 'New Price Applicable',
                'Quotation Type', 'First PM Date', 'Agreement start date'
            ],
            'LMS Data for ERP': [
                'LEAD NUMBER', 'LEAD CREATED DATE', 'MODE OF LEAD CREATION', 'LEAD RAISED BY',
                'LEAD RAISED FOR', 'SD NAME', 'SD ID', 'BRANCH NAME', 'BRANCH ID',
                'PRODUCT LIST', 'PRODUCT TYPE', 'LEAD ASSIGNED TO', 'LEAD STATUS',
                'ACCOUNT ID', 'ACCOUNT NAME', 'ZONE', 'LEAD SR NUMBER', 'INSTANCE ID',
                'ENGINE MODEL', 'KVA RATING', 'SERVICE ENGINEER NAME', 'TELE CALLER NAME',
                'QUOTATION NUMBER', 'QUOTATION SUBMIT DATE', 'QUOTATION APPROVAL DATE',
                'ORDER NUMBER', 'ORDER CREATION DATE'
            ],
            'Open SR Load Report': [
                'Instance Id [Asset #]', 'Service Request #', 'SR Due Date', 'SR Type',
                'Appointment Date', 'Service Dealer', 'Status', 'Problem Code',
                'Close Date/Time', 'VOC', 'Contact Last Name', 'Installation Site Address',
                'Account', 'Engine App Code', 'Engine Serial#', 'Segment', 'Engine Series',
                'Engine Model', 'Ticket#', 'Task Start Date', 'Task End Date',
                'Under Monitoring Date', 'Under Monitoring Remark', 'Convert PM to Wet PM Flag',
                'Convert PM to Wet PM Flag updated Date', 'Convert PM to Wet PM Flag updated by',
                'eFSR Engineer Remarks', 'Quick Ticket SR Comments', 'Actual SR Due Date',
                'SR Sub-Type', 'Customer Name', 'Customer Mobile #', 'Genset Appcode',
                'Primary Phone#', 'Contact Name', 'Mode', 'Special Tool', 'Special Tool Name',
                'Repeat', 'Assigned To', 'Oil Change Flg', 'Claim Created', 'Agreement #',
                'Cancellation Reason', 'CSP Cancellation Reasons', 'CSP Cancellation Remarks',
                'ASM/ASE Remarks', 'ASM/ASE Remarks Date', 'Battery Charger Availability',
                'Wet PM Due Flag', 'Cap Limit Approval Remarks', 'Cap Limit Deviation Remarks',
                'Cap Limit Deviation Status', 'Cap limit User details', 'CSP Prepone Flag',
                'CSP Prepone Flag updated By', 'Bandhan PM SR closure within 15 days flag',
                'Bandhan PM Lock Removal flag updated by', 'Bandhan PM Lock Removal flag updated Date',
                'Bandhan PM SR Closure @90 days max after PM Due Date flag',
                'Bandhan PM Due Date Lock Removal flag updated by',
                'Bandhan PM Due Date Lock Removal flag updated Date',
                'Bandhan Job card creation prior to 60 days flag',
                'Bandhan PM JC creation Lock Removal flag updated by',
                'Bandhan PM JC creation Lock Removal flag updated Date',
                'Account Id', 'SR Created BY', 'SR Created Date', 'eFSR KRM Number',
                'Dry CSP Approved by', 'Dry CSP Approved Date'
            ]
        }
        
        # The gate is the CRITICAL list, not the legacy expected_columns map
        # above: that map has no entry for several imports (MaxTTR among them),
        # so keying off it returned "nothing to check" and skipped the critical
        # columns entirely.
        if not self.get_critical_columns(file_type):
            return True, "No validation required"

        # Match the way canonicalize_dataframe does — alphanumeric-only, plus
        # the per-file aliases — so a header that differs only in case, spacing
        # or punctuation still counts as present. (LMS used to be special-cased
        # to two columns here; it now goes through the same critical list.)
        actual_keys = {self._tight_header(col) for col in df.columns if pd.notna(col)}
        aliases = FILE_COLUMN_ALIASES.get(file_type, {})
        critical_columns = self.get_critical_columns(file_type)

        def _present(col):
            for cand in [col, *aliases.get(col, [])]:
                if self._tight_header(cand) in actual_keys:
                    return True
            return False

        missing_critical = [col for col in critical_columns if not _present(col)]

        if missing_critical:
            return False, f"Missing critical columns: {', '.join(missing_critical)}"
        
        return True, "Format valid"
    
    def get_critical_columns(self, file_type):
        """Get critical columns that must be present for each file type"""
        critical = {
            # AGREEMENT TYPE decides what the AMC & Bandhan Projection report
            # counts (a D/BAMC type or not) and AGREEMENT START DATE puts it in a
            # month; import_amc_agreement itself FILTERS on AGREEMENT STATUS to
            # keep one Active row per genset, so a file without that column fails
            # on a KeyError rather than a message. All three are required.
            'AMC Population Report': ['INSTANCE ID', 'AGREEMENT NUMBER',
                                      'AGREEMENT TYPE', 'AGREEMENT STATUS',
                                      'AGREEMENT START DATE'],
            # ASSET OPERATIONAL STATUS decides the Service Penetration report's
            # population: an 'Inactive' asset is a retired machine and is left
            # out of the installed base. Without the column every asset would
            # silently count, inflating the population and deflating Pen %.
            'Asset Detailed Report': ['ASSET NUMBER', 'ENGINE SERIAL NO',
                                      'ASSET OPERATIONAL STATUS'],
            'Asset Details with Last Oil Service': ['ASSET NUMBER', 'ENGINE SERIAL NO'],
            'Anubandhan Plus Quotes Report': ['Pulse Instance ID', 'QuotationRefNo', 'EngineNo'],
            'Anubandhan Quotes Report': ['Pulse Instance ID', 'QuotationRefNo', 'EngineNo'],
            'BandhanPlus Quotes Report': ['Pulse Instance ID', 'QuotationRefNo', 'EngineNo'],
            'Pulse Quotation - Service Only': ['Instance Id', 'Quote ID'],
            'Regular Bandhan Customers Report': ['Pulse Instance ID', 'Quotation Ref No'],
            # Every column the Employee Productivity report reads from LMS.
            # Without them the report loses whole columns silently, so the
            # upload is blocked instead. Names are the CANONICAL ones — the
            # file is canonicalised first and matching below is flexible.
            'LMS Data for ERP': [
                'Instance ID', 'Lead Number', 'Lead Created Date',
                'Lead Raised For', 'SD Branch Code', 'SD Branch Name',
                'Service Engineer Name', 'Service Engineer UID',
                'Part Invoice Amount', 'Labour Invoice Amount',
            ],
            'Open SR Load Report': ['Service Request #', 'Instance Id [Asset #]', 'Engine Serial#'],
            'MaxTTR - Oil Change SR Zero Labour Flag': ['INSTANCE ID', 'SR NUMBER', 'SR TYPE', 'SR SUBTYPE'],
            # SR TYPE drives the report's SR Type split and BRANCH NAME is
            # the branch label — both were previously unenforced. SEGMENT splits
            # Service Penetration's serviced assets into IND / PG: without it
            # every closed SR falls outside both columns and the report reads
            # zero without saying why.
            # SR TASK END DATE added 2026-08-19: Employee Productivity's
            # 'Days present on Task end' counts distinct task-end dates, so a
            # file without the column silently zeroes that column (and with it
            # every Productivity figure) — block the upload instead.
            # RESPONSE TIME RANGE IN HRS and MaxTTR on SR Closed in hrs added
            # 2026-08-21: the Annual Reports' 'Service Load and Response' sheet
            # reads BOTH columns straight out of the file and never recomputes
            # them (SR OPEN DATE carries the SCHEDULED date on planned work, so
            # open -> close arithmetic is wrong on ~19% of rows). Without the
            # range column its 4 Hrs Response tab reads 0% for every branch;
            # without the hours column the 24 Hrs and 48 Hrs tabs do the same —
            # silently, since a missing column looks exactly like nobody
            # meeting the SLA. Block the upload instead.
            'Response Time & MaxTTR Details': [
                'BRANCH ID', 'BRANCH NAME', 'INSTANCE ID', 'SR NUMBER',
                'SR TYPE', 'SEGMENT', 'SR OPEN DATE', 'SR TASK END DATE',
                'SR CLOSE DATE', 'SE NAME', 'SE TICKET NUM',
                'RESPONSE TIME RANGE IN HRS', 'Response Time',
                'MaxTTR on SR Closed in hrs'
            ],
            # Both halves of the record key. INSTANCE ID alone collapses 19.8%
            # of the real export (a genset renews) and AGREEMENT NUMBER alone
            # collapses 1.4% (one agreement covers a fleet), so a file missing
            # either one cannot be stored without losing rows — block it.
            # AGREEMENT END DATE is what the planner is FOR: without it every
            # row imports with an empty expiry and the file says nothing.
            'AMC Agreement Expiry Planner': ['INSTANCE ID', 'AGREEMENT NUMBER',
                                             'AGREEMENT END DATE'],
            # Only the record key is mandatory. The other six fixed columns are
            # IMPORTANT (the Import page warns when one is missing) but never
            # blocking: a lead file exported without, say, ORDER CREATION DATE
            # is still worth importing.
            'LMS Data from Insia': ['LEAD NUMBER'],
            # INVOICE NUMBER is the record key. The other six are every column
            # the Open Quotation Tracker reads: without INVOICE DATE no row
            # lands in a period, without STATUS the 185 cancelled lines are
            # counted as real business, without SEGMENT the 15,747 OTC lines
            # flood the service figures, without TYPE nothing splits into labour
            # and parts, without AMOUNT every value reads zero, and without
            # BRANCH ID / BRANCH NAME no row can be placed on a branch. Each of
            # those failures looks like a real number, so block the upload.
            # INSTANCE ID and ACCOUNT NAME are deliberately NOT here: the OTC and
            # Agreement lines legitimately have no genset.
            'All Invoice Detailed Report': [
                'INVOICE NUMBER', 'INVOICE DATE', 'INVOICE STATUS',
                'INVOICE SEGMENT', 'INVOICE TYPE', 'INVOICE AMOUNT',
                'BRANCH ID', 'BRANCH NAME'
            ]
        }
        return critical.get(file_type, [])
    
    def get_existing_record(self, model, instance_id, unique_field=None, unique_value=None):
        """Get existing record from table"""
        try:
            if instance_id:
                return self.db.query(model).filter(
                    model.instance_id == instance_id
                ).first()
            elif unique_field and unique_value:
                return self.db.query(model).filter(
                    getattr(model, unique_field) == unique_value
                ).first()
            return None
        except Exception as e:
            return None
    
    def update_record(self, existing_record, new_data):
        """Update existing record with new data.
        A blank cell in the new file NEVER wipes existing data:
        - None / empty-string values are skipped (the old value is kept)
        - extra_data (dynamic columns) is MERGED — keys missing from the new
          file keep their old values, keys present in it are refreshed
        Non-empty values always overwrite (latest file wins)."""
        for key, value in new_data.items():
            if not hasattr(existing_record, key):
                continue
            if key == 'extra_data':
                merged = self._merge_extra_data(getattr(existing_record, key, None), value)
                if merged is not None:
                    setattr(existing_record, key, merged)
                continue
            if value is None or (isinstance(value, str) and value.strip() == ''):
                continue  # empty in new file — keep the existing value
            setattr(existing_record, key, value)
        return existing_record

    def _merge_extra_data(self, old_json, new_json):
        """Merge dynamic-column JSON strings: keys in the new file win, keys
        only in the old data are preserved. Returns None when there is nothing
        new to apply (so the old value stays untouched)."""
        if not new_json:
            return None
        if not old_json:
            return new_json
        try:
            old = json.loads(old_json)
            if not isinstance(old, dict):
                old = {}
        except (ValueError, TypeError):
            old = {}
        try:
            new = json.loads(new_json)
            if not isinstance(new, dict):
                return new_json
        except (ValueError, TypeError):
            return new_json
        old.update(new)
        return json.dumps(old, ensure_ascii=False, default=str)
    
    def import_amc_agreement(self, file: UploadFile):
        """Import AMC Population Report Report - Only take first ACTIVE record per instance_id"""
        contents = file.file.read()
        df = read_upload_table(contents)
        
        # Flexible headers: map known columns to canonical names; the rest are dynamic
        df, extra_cols = self.canonicalize_dataframe(df, 'AMC Population Report')

        is_valid, message = self.validate_file_format(df, 'AMC Population Report')
        if not is_valid:
            raise HTTPException(status_code=400, detail=f"Invalid file format for AMC Population Report: {message}")
        
        # Group by instance_id and take only the first ACTIVE record for each
        # First, filter for Active agreements
        active_df = df[df['AGREEMENT STATUS'].astype(str).str.upper() == 'ACTIVE']
        
        # Group by instance_id and take first row (keeping original order)
        first_active_df = active_df.groupby('INSTANCE ID').first().reset_index()
        
        # ── FAST: dict iteration + bulk preload ──
        records = first_active_df.to_dict('records')
        instance_ids = [self.extract_instance_id(r, 'AMC Population Report') for r in records]
        existing_map = self._bulk_load_by_instance_id(AMCAgreement, instance_ids)
        customer_cache = self._bulk_load_by_instance_id(Customer, instance_ids)
        
        imported_count = 0
        updated_count = 0
        
        # Disable autoflush during the loop — we know our cache is consistent
        with self.db.no_autoflush:
            for row in records:
                try:
                    instance_id = self.extract_instance_id(row, 'AMC Population Report')
                    
                    if not instance_id:
                        continue
                    
                    # Update or create customer
                    self.update_or_create_customer(instance_id, row, 'AMC Population Report', cache=customer_cache)
                    
                    # Prepare agreement data
                    agreement_data = {
                        'instance_id': instance_id,
                        'zone_name': self.truncate_string(row.get('ZONE NAME')),
                        'sd_id': self.truncate_string(row.get('SD ID'), 100),
                        'sd_name': self.truncate_string(row.get('SD NAME')),
                        'branch_id': self.truncate_string(row.get('BRANCH ID'), 100),
                        'branch_name': self.truncate_string(row.get('BRANCH NAME')),
                        'segment': self.truncate_string(row.get('SEGMENT'), 200),
                        'kva_rating': self.truncate_string(row.get('KVA RATING'), 100),
                        'engine_model': self.truncate_string(row.get('ENGINE MODEL'), 200),
                        'agreement_number': self.truncate_string(row.get('AGREEMENT NUMBER'), 200),
                        'number_of_agreement_years': self.convert_to_numeric(row.get('NUMBER OF AGREEMENT YEARS')),
                        'agreement_name': self.truncate_string(row.get('AGREEMENT NAME')),
                        'agreement_status': self.truncate_string(row.get('AGREEMENT STATUS'), 100),
                        'agreement_type': self.truncate_string(row.get('AGREEMENT TYPE'), 100),
                        'agreement_created_date': self.parse_date(row.get('AGREEMENT CREATED DATE')),
                        'agreement_start_date': self.parse_date(row.get('AGREEMENT START DATE')),
                        'agreement_end_date': self.parse_date(row.get('AGREEMENT END DATE')),
                        'agreement_product_name': self.truncate_string(row.get('AGREEMENT PRODUCT NAME')),
                        'agreement_invoice_type': self.truncate_string(row.get('AGREEMENT INVOICE TYPE'), 200),
                        'commissioning_date': self.parse_date(row.get('COMMISSIONING DATE')),
                        'last_agreement_number': self.truncate_string(row.get('LAST AGREEMENT NUMBER'), 200),
                        'last_agreement_no_of_years': self.convert_to_numeric(row.get('LAST AGREEMENT NO OF YEARS')),
                        'last_agreement_type': self.truncate_string(row.get('LAST AGREEMENT TYPE'), 100),
                        'last_agreement_status': self.truncate_string(row.get('LAST AGREEMENT STATUS'), 100),
                        'last_agreement_product_name': self.truncate_string(row.get('LAST AGREEMENT PRODUCT NAME')),
                        'last_agreement_start_date': self.parse_date(row.get('LAST AGREEMENT START DATE')),
                        'last_agreement_end_date': self.parse_date(row.get('LAST AGREEMENT END DATE')),
                        'extra_data': self.collect_extra_data(row, extra_cols),
                    }
                    
                    # O(1) lookup from preloaded map
                    existing = existing_map.get(instance_id)
                    
                    if existing:
                        # Update existing record with new data
                        self.update_record(existing, agreement_data)
                        updated_count += 1
                    else:
                        # Create new record
                        agreement = AMCAgreement(**agreement_data)
                        self.db.add(agreement)
                        existing_map[instance_id] = agreement  # prevent duplicate adds in same file
                        imported_count += 1
                        
                except IntegrityError:
                    self.db.rollback()
                    continue
                except Exception:
                    continue
        
        self.db.commit()
        return imported_count, updated_count
    
    def convert_to_numeric(self, value):
        """Convert a value to int if possible, otherwise None.

        Routed through convert_to_float so a grouped number ('1,234') and a
        whole number written with a decimal ('5.0', which is what Excel hands
        over for an integer column) both land, instead of failing isdigit()
        and being dropped. A fractional value is not an integer -> None.
        """
        if pd.isna(value) or value is None or value == '':
            return None

        number = self.convert_to_float(value)
        if number is None:
            return None
        return int(number) if float(number).is_integer() else None

    def import_asset_detailed(self, file: UploadFile):
        """Import Asset Detailed Report - Override existing records"""
        contents = file.file.read()
        df = read_upload_table(contents)
        
        # Flexible headers: map known columns to canonical names; the rest are dynamic
        df, extra_cols = self.canonicalize_dataframe(df, 'Asset Detailed Report')

        is_valid, message = self.validate_file_format(df, 'Asset Detailed Report')
        if not is_valid:
            raise HTTPException(status_code=400, detail=f"Invalid file format for Asset Detailed Report: {message}")
        
        # ── FAST: dict iteration + bulk preload ──
        records = df.to_dict('records')
        instance_ids = [self.extract_instance_id(r, 'Asset Detailed Report') for r in records]
        existing_map = self._bulk_load_by_instance_id(AssetDetailed, instance_ids)
        customer_cache = self._bulk_load_by_instance_id(Customer, instance_ids)
        
        imported_count = 0
        updated_count = 0
        
        with self.db.no_autoflush:
            for row in records:
                try:
                    instance_id = self.extract_instance_id(row, 'Asset Detailed Report')
                    engine_serial_no = self.extract_engine_serial_no(row, 'Asset Detailed Report')
                    
                    # Update or create customer
                    if instance_id:
                        self.update_or_create_customer(instance_id, row, 'Asset Detailed Report', cache=customer_cache)
                    
                    # Prepare asset data
                    asset_data = {
                        'instance_id': instance_id,
                        'zone_name': self.truncate_string(row.get('ZONE NAME')),
                        'sd_id': self.truncate_string(row.get('SD ID'), 100),
                        'sd_name': self.truncate_string(row.get('SD NAME')),
                        'branch_id': self.truncate_string(row.get('BRANCH ID'), 100),
                        'branch_name': self.truncate_string(row.get('BRANCH NAME')),
                        'district': self.truncate_string(row.get('DISTRICT'), 200),
                        'asset_number': self.truncate_string(row.get('ASSET NUMBER'), 200),
                        'commissioning_date': self.parse_date(row.get('COMMISSIONING DATE')),
                        'installation_date': self.parse_date(row.get('INSTALLATION DATE')),
                        'goem_oem': self.truncate_string(row.get('GOEM OEM'), 200),
                        'application_code': self.truncate_string(row.get('APPLICATION CODE'), 200),
                        'emission_norm': self.truncate_string(row.get('EMISSION NORM'), 100),
                        'engine_serial_no': engine_serial_no,
                        'engine_model': self.truncate_string(row.get('ENGINE MODEL'), 200),
                        'account_name': self.truncate_string(row.get('ACCOUNT NAME')),
                        'customer_name': self.truncate_string(row.get('CUSTOMER NAME')),
                        'contact_phone_number': self.truncate_string(row.get('CONTACT PHONE NUMBER'), 50),
                        'contact_email_id': self.truncate_string(row.get('CONTACT EMAIL ID')),
                        'warranty_expiry_date': self.parse_date(row.get('WARRANTY EXPIRY DATE')),
                        'installation_site_address': self.convert_to_string(row.get('INSTALLATION SITE ADDRESS')),
                        'product_segment': self.truncate_string(row.get('PRODUCT SEGMENT'), 200),
                        'segment': self.truncate_string(row.get('SEGMENT'), 200),
                        'customer_segment': self.truncate_string(row.get('CUSTOMER SEGMENT'), 200),
                        'asset_operational_status': self.truncate_string(row.get('ASSET OPERATIONAL STATUS'), 200),
                        'krm_number': self.truncate_string(row.get('KRM NUMBER'), 200),
                        'krm_status': self.truncate_string(row.get('KRM STATUS'), 100),
                        'krm_active_date': self.parse_date(row.get('KRM ACTIVE DATE')),
                        'krm_inactive_date': self.parse_date(row.get('KRM INACTIVE DATE')),
                        'krm_subscription_start_date': self.parse_date(row.get('KRM SUBSCRIPTION START DATE')),
                        'krm_subscription_end_date': self.parse_date(row.get('KRM SUBSCRIPTION END DATE')),
                        'kva_rating': self.truncate_string(row.get('KVA RATING'), 100),
                        'extra_data': self.collect_extra_data(row, extra_cols),
                    }

                    # O(1) lookup from preloaded map
                    existing = existing_map.get(instance_id) if instance_id else None

                    if existing:
                        # Update existing record
                        self.update_record(existing, asset_data)
                        updated_count += 1
                    else:
                        # Create new record
                        asset = AssetDetailed(**asset_data)
                        self.db.add(asset)
                        if instance_id:
                            existing_map[instance_id] = asset
                        imported_count += 1
                        
                except IntegrityError:
                    self.db.rollback()
                    continue
                except Exception:
                    continue
        
        self.db.commit()
        return imported_count, updated_count
    
    def import_asset_service(self, file: UploadFile):
        """Import Asset Details with Last Oil Service - Override existing records"""
        contents = file.file.read()
        df = read_upload_table(contents)
        
        # Flexible headers: map known columns to canonical names; the rest are dynamic
        df, extra_cols = self.canonicalize_dataframe(df, 'Asset Details with Last Oil Service')

        is_valid, message = self.validate_file_format(df, 'Asset Details with Last Oil Service')
        if not is_valid:
            raise HTTPException(status_code=400, detail=f"Invalid file format for Asset Details with Last Oil Service: {message}")
        
        # ── FAST: dict iteration + bulk preload ──
        records = df.to_dict('records')
        instance_ids = [self.extract_instance_id(r, 'Asset Details with Last Oil Service') for r in records]
        existing_map = self._bulk_load_by_instance_id(AssetService, instance_ids)
        customer_cache = self._bulk_load_by_instance_id(Customer, instance_ids)
        
        imported_count = 0
        updated_count = 0
        
        with self.db.no_autoflush:
            for row in records:
                try:
                    instance_id = self.extract_instance_id(row, 'Asset Details with Last Oil Service')
                    engine_serial_no = self.extract_engine_serial_no(row, 'Asset Details with Last Oil Service')
                    
                    # Update or create customer
                    if instance_id:
                        self.update_or_create_customer(instance_id, row, 'Asset Details with Last Oil Service', cache=customer_cache)
                    
                    # Prepare service data
                    service_data = {
                        'instance_id': instance_id,
                        'zone_name': self.truncate_string(row.get('ZONE NAME')),
                        'sd_id': self.truncate_string(row.get('SD ID'), 100),
                        'sd_name': self.truncate_string(row.get('SD NAME')),
                        'branch_id': self.truncate_string(row.get('BRANCH ID'), 100),
                        'branch_name': self.truncate_string(row.get('BRANCH NAME')),
                        'asset_number': self.truncate_string(row.get('ASSET NUMBER'), 200),
                        'commissioning_date': self.parse_date(row.get('COMMISSIONING DATE')),
                        'product_segment': self.truncate_string(row.get('PRODUCT SEGMENT'), 200),
                        'application_code': self.truncate_string(row.get('APPLICATION CODE'), 200),
                        'engine_serial_no': engine_serial_no,
                        'account_name': self.truncate_string(row.get('ACCOUNT NAME')),
                        'contact_phone_number': self.truncate_string(row.get('CONTACT PHONE NUMBER'), 50),
                        'last_closed_sr_number': self.truncate_string(row.get('LAST CLOSED SR NUMBER'), 200),
                        'last_sr_type': self.truncate_string(row.get('LAST SR TYPE'), 200),
                        'last_sr_subtype': self.truncate_string(row.get('LAST SR SUBTYPE'), 200),
                        'last_sr_close_date': self.parse_date(row.get('LAST SR CLOSE DATE')),
                        'last_oil_change_sr_number': self.truncate_string(row.get('LAST OIL CHANGE SR NUMBER'), 200),
                        'last_oil_change_sr_type': self.truncate_string(row.get('LAST OIL CHANGE SR TYPE'), 200),
                        'last_oil_change_sr_sub_type': self.truncate_string(row.get('LAST OIL CHANGE SR SUB TYPE'), 200),
                        'last_oil_change_date': self.parse_date(row.get('LAST OIL CHANGE DATE')),
                        'installation_site_address': self.convert_to_string(row.get('INSTALLATION SITE ADDRESS')),
                        'last_service_hrs': self.truncate_string(row.get('LAST SERVICE HRS'), 100),
                        'extra_data': self.collect_extra_data(row, extra_cols),
                    }
                    
                    # O(1) lookup from preloaded map
                    existing = existing_map.get(instance_id) if instance_id else None
                    
                    if existing:
                        # Update existing record
                        self.update_record(existing, service_data)
                        updated_count += 1
                    else:
                        # Create new record
                        asset_service = AssetService(**service_data)
                        self.db.add(asset_service)
                        if instance_id:
                            existing_map[instance_id] = asset_service
                        imported_count += 1
                        
                except IntegrityError:
                    self.db.rollback()
                    continue
                except Exception:
                    continue
        
        self.db.commit()
        return imported_count, updated_count
    
    def import_anubandhan_plus_quotes(self, file: UploadFile):
        """Import Anubandhan Plus Quotes Report - Only take first record per instance_id"""
        contents = file.file.read()
        df = read_upload_table(contents)
        
        # Flexible headers: map known columns to canonical names; the rest are dynamic
        df, extra_cols = self.canonicalize_dataframe(df, 'Anubandhan Plus Quotes Report')

        is_valid, message = self.validate_file_format(df, 'Anubandhan Plus Quotes Report')
        if not is_valid:
            raise HTTPException(status_code=400, detail=f"Invalid file format for Anubandhan Plus Quotes Report: {message}")
        
        # Group by Pulse Instance ID and take first record for each
        first_records_df = df.groupby('Pulse Instance ID').first().reset_index()
        
        # ── FAST: dict iteration + bulk preload ──
        records = first_records_df.to_dict('records')
        instance_ids = [self.extract_instance_id(r, 'Anubandhan Plus Quotes Report') for r in records]
        existing_map = self._bulk_load_by_instance_id(AnubandhanPlusQuote, instance_ids)
        customer_cache = self._bulk_load_by_instance_id(Customer, instance_ids)
        
        imported_count = 0
        updated_count = 0
        
        with self.db.no_autoflush:
            for row in records:
                try:
                    instance_id = self.extract_instance_id(row, 'Anubandhan Plus Quotes Report')
                    engine_no = self.extract_engine_serial_no(row, 'Anubandhan Plus Quotes Report')
                    
                    if not instance_id:
                        continue
                    
                    # Get branch_id from preloaded customer cache (O(1))
                    cust = customer_cache.get(instance_id)
                    branch_id = cust.branch_id if (cust and cust.branch_id) else None
                    
                    # Update or create customer
                    self.update_or_create_customer(instance_id, row, 'Anubandhan Plus Quotes Report', cache=customer_cache)
                    
                    # Prepare quote data
                    quote_data = {
                        'instance_id': instance_id,
                        'branch_id': branch_id,
                        'id_col': self.truncate_string(row.get('Id'), 100),
                        'quotation_ref_no': self.convert_to_string(row.get('QuotationRefNo')),
                        'company_name': self.truncate_string(row.get('CompanyName')),
                        'engine_no': engine_no,
                        'contact_person_name': self.truncate_string(row.get('ContactPersonName')),
                        'mobile_no': self.truncate_string(row.get('MobileNo'), 50),
                        'email_id': self.truncate_string(row.get('EmailId')),
                        'genset_kva': self.truncate_string(row.get('GensetKVA'), 100),
                        'zone': self.truncate_string(row.get('Zone'), 200),
                        'state': self.truncate_string(row.get('State'), 200),
                        'city': self.truncate_string(row.get('City'), 200),
                        'location': self.truncate_string(row.get('Location')),
                        'no_of_years': self.convert_to_numeric(row.get('NoOfYears')),
                        'genset_running_per_year': self.truncate_string(row.get('GensetRunningPerYear'), 100),
                        'created_date_time': self.parse_date(row.get('CreatedDateTime')),
                        'status': self.truncate_string(row.get('Status'), 100),
                        'payment_type': self.truncate_string(row.get('PaymentType'), 100),
                        'transaction_id': self.truncate_string(row.get('TransactionId'), 200),
                        'bank_name': self.truncate_string(row.get('BankName')),
                        'account_no': self.truncate_string(row.get('AccountNo'), 200),
                        'date_of_payment': self.parse_date(row.get('DateOfPayment')),
                        'payment_update_date_time': self.parse_date(row.get('PaymentUpdateDateTime')),
                        'is_neft_confirm': self.convert_to_boolean(row.get('IsNEFTConfirm')),
                        'is_cheque_confirm': self.convert_to_boolean(row.get('IsChequeConfirm')),
                        'cheque_deposited_address': self.convert_to_string(row.get('Cheque deposited-Address of YES Bank Branch')),
                        'cheque_given_dealership': self.truncate_string(row.get('cheque given-Name of KOEL Dealership')),
                        'cheque_deposited': self.truncate_string(row.get('Cheque Deposited'), 200),
                        'cheque_to_dealer': self.truncate_string(row.get('Cheque To Dealer'), 200),
                        'employee_name': self.truncate_string(row.get('Employee Name')),
                        'pulse_id': self.truncate_string(row.get('Pulse Id'), 200),
                        'is_invoice_sent': self.convert_to_boolean(row.get('IsInvoiceSent')),
                        'is_refund': self.convert_to_boolean(row.get('IsRefund')),
                        'agent_id': self.truncate_string(row.get('AgentId'), 200),
                        'quote_price': self.convert_to_float(row.get('QuotePrice')),
                        'quotation_value_including_tax': self.convert_to_float(row.get('Quotation Value Including tax')),
                        'name_of_agent': self.truncate_string(row.get('Name of Agent')),
                        'actual_amount': self.convert_to_float(row.get('Actual Amount')),
                        'reason_of_short_payment': self.convert_to_string(row.get('Reason of Short Payment')),
                        'status_updated_by_admin': self.convert_to_string(row.get('Status updated by Admin')),
                        'quotation_expiry_date': self.parse_date(row.get('Quotation Expiry Date')),
                        'is_expired': self.convert_to_boolean(row.get('IsExpired')),
                        'payment_updated_month': self.truncate_string(row.get('Payment Updated Month'), 50),
                        'pulse_instance_id': self.truncate_string(row.get('Pulse Instance ID'), 200),
                        'new_price_applicable': self.convert_to_boolean(row.get('New Price Applicable')),
                        'quotation_type': 'Anubandhan Plus',
                        'extra_data': self.collect_extra_data(row, extra_cols),
                    }
                    
                    # O(1) lookup from preloaded map
                    existing = existing_map.get(instance_id)
                    
                    if existing:
                        # Update existing record with new data
                        self.update_record(existing, quote_data)
                        updated_count += 1
                    else:
                        # Create new record
                        quote = AnubandhanPlusQuote(**quote_data)
                        self.db.add(quote)
                        existing_map[instance_id] = quote
                        imported_count += 1
                        
                except IntegrityError:
                    self.db.rollback()
                    continue
                except Exception:
                    continue
        
        self.db.commit()
        return imported_count, updated_count
    
    def convert_to_boolean(self, value):
        """Convert value to boolean"""
        if pd.isna(value) or value is None:
            return False
        
        str_val = self.convert_to_string(value)
        if str_val:
            return str_val.lower() in ['true', 'yes', '1', 'y']
        return False
    
    def convert_to_float(self, value):
        """Convert a value to float, THOUSANDS SEPARATORS INCLUDED.

        The KOEL / Pulse exports write money the Indian way - '10,854.01',
        '1,20,450.00', sometimes with a currency mark or wrapped in brackets
        for a negative. A bare float() raises ValueError on every one of those,
        and this used to swallow it and return None: **any amount of 1,000 or
        more was silently dropped on import** while the sub-1,000 ones (no
        comma, e.g. '1.18') stored fine. That is why the LMS Conv. Amount
        columns read 2.52 L against the file's own 7.37 L - in the LMS Pulse
        OLD export 783 of the part amounts carry a comma.

        Anything that still does not parse returns None, exactly as before, so
        a genuinely non-numeric cell behaves as it always did.
        """
        if pd.isna(value) or value is None:
            return None

        # A real number out of Excel needs no cleaning
        if isinstance(value, (int, float)) and not isinstance(value, bool):
            return float(value)

        text = str(value).strip()
        if not text:
            return None

        # '(1,234.00)' is accountancy for -1234
        negative = text.startswith('(') and text.endswith(')')

        # Strip the grouping commas, spaces and the rupee / Rs. marks the
        # portals sometimes prefix. Digits, sign, point and exponent survive.
        cleaned = re.sub(r'(?i)^\s*(rs\.?|inr)\s*', '', text.strip('()'))
        cleaned = re.sub(r'[,\s\u20b9$]', '', cleaned)
        if not cleaned or cleaned in ('-', '+', '.'):
            return None

        try:
            number = float(cleaned)
        except (TypeError, ValueError):
            return None
        return -number if negative else number

    def import_anubandhan_quotes(self, file: UploadFile):
        """Import Anubandhan Quotes Report - Only take first record per instance_id"""
        contents = file.file.read()
        df = read_upload_table(contents)
        
        # Flexible headers: map known columns to canonical names; the rest are dynamic
        df, extra_cols = self.canonicalize_dataframe(df, 'Anubandhan Quotes Report')

        is_valid, message = self.validate_file_format(df, 'Anubandhan Quotes Report')
        if not is_valid:
            raise HTTPException(status_code=400, detail=f"Invalid file format for Anubandhan Quotes Report: {message}")
        
        # Group by Pulse Instance ID and take first record for each
        first_records_df = df.groupby('Pulse Instance ID').first().reset_index()
        
        # ── FAST: dict iteration + bulk preload ──
        records = first_records_df.to_dict('records')
        instance_ids = [self.extract_instance_id(r, 'Anubandhan Quotes Report') for r in records]
        existing_map = self._bulk_load_by_instance_id(AnubandhanQuote, instance_ids)
        customer_cache = self._bulk_load_by_instance_id(Customer, instance_ids)
        
        imported_count = 0
        updated_count = 0
        
        with self.db.no_autoflush:
            for row in records:
                try:
                    instance_id = self.extract_instance_id(row, 'Anubandhan Quotes Report')
                    engine_no = self.extract_engine_serial_no(row, 'Anubandhan Quotes Report')
                    
                    if not instance_id:
                        continue
                    
                    # Get branch_id from preloaded customer cache (O(1))
                    cust = customer_cache.get(instance_id)
                    branch_id = cust.branch_id if (cust and cust.branch_id) else None
                    
                    # Update or create customer
                    self.update_or_create_customer(instance_id, row, 'Anubandhan Quotes Report', cache=customer_cache)
                    
                    # Prepare quote data
                    quote_data = {
                        'instance_id': instance_id,
                        'branch_id': branch_id,
                        'id_col': self.truncate_string(row.get('Id'), 100),
                        'quotation_ref_no': self.convert_to_string(row.get('QuotationRefNo')),
                        'company_name': self.truncate_string(row.get('CompanyName')),
                        'engine_no': engine_no,
                        'contact_person_name': self.truncate_string(row.get('ContactPersonName')),
                        'mobile_no': self.truncate_string(row.get('MobileNo'), 50),
                        'email_id': self.truncate_string(row.get('EmailId')),
                        'genset_kva': self.truncate_string(row.get('GensetKVA'), 100),
                        'zone': self.truncate_string(row.get('Zone'), 200),
                        'state': self.truncate_string(row.get('State'), 200),
                        'city': self.truncate_string(row.get('City'), 200),
                        'location': self.truncate_string(row.get('Location')),
                        'no_of_years': self.convert_to_numeric(row.get('NoOfYears')),
                        'genset_running_per_year': self.truncate_string(row.get('GensetRunningPerYear'), 100),
                        'created_date_time': self.parse_date(row.get('CreatedDateTime')),
                        'status': self.truncate_string(row.get('Status'), 100),
                        'payment_type': self.truncate_string(row.get('PaymentType'), 100),
                        'transaction_id': self.truncate_string(row.get('TransactionId'), 200),
                        'bank_name': self.truncate_string(row.get('BankName')),
                        'account_no': self.truncate_string(row.get('AccountNo'), 200),
                        'date_of_payment': self.parse_date(row.get('DateOfPayment')),
                        'payment_update_date_time': self.parse_date(row.get('PaymentUpdateDateTime')),
                        'is_neft_confirm': self.convert_to_boolean(row.get('IsNEFTConfirm')),
                        'is_cheque_confirm': self.convert_to_boolean(row.get('IsChequeConfirm')),
                        'cheque_deposited_address': self.convert_to_string(row.get('Cheque deposited-Address of YES Bank Branch')),
                        'cheque_given_dealership': self.truncate_string(row.get('cheque given-Name of KOEL Dealership')),
                        'cheque_deposited': self.truncate_string(row.get('Cheque Deposited'), 200),
                        'cheque_to_dealer': self.truncate_string(row.get('Cheque To Dealer'), 200),
                        'employee_name': self.truncate_string(row.get('Employee Name')),
                        'pulse_id': self.truncate_string(row.get('Pulse Id'), 200),
                        'is_invoice_sent': self.convert_to_boolean(row.get('IsInvoiceSent')),
                        'is_refund': self.convert_to_boolean(row.get('IsRefund')),
                        'agent_id': self.truncate_string(row.get('AgentId'), 200),
                        'quote_price': self.convert_to_float(row.get('QuotePrice')),
                        'quotation_value_including_tax': self.convert_to_float(row.get('Quotation Value Including tax')),
                        'name_of_agent': self.truncate_string(row.get('Name of Agent')),
                        'actual_amount': self.convert_to_float(row.get('Actual Amount')),
                        'reason_of_short_payment': self.convert_to_string(row.get('Reason of Short Payment')),
                        'status_updated_by_admin': self.convert_to_string(row.get('Status updated by Admin')),
                        'quotation_expiry_date': self.parse_date(row.get('Quotation Expiry Date')),
                        'is_expired': self.convert_to_boolean(row.get('IsExpired')),
                        'payment_updated_month': self.truncate_string(row.get('Payment Updated Month'), 50),
                        'pulse_instance_id': self.truncate_string(row.get('Pulse Instance ID'), 200),
                        'new_price_applicable': self.convert_to_boolean(row.get('New Price Applicable')),
                        'quotation_type': 'Anubandhan',
                        'extra_data': self.collect_extra_data(row, extra_cols),
                    }
                    
                    # O(1) lookup from preloaded map
                    existing = existing_map.get(instance_id)
                    
                    if existing:
                        # Update existing record with new data
                        self.update_record(existing, quote_data)
                        updated_count += 1
                    else:
                        # Create new record
                        quote = AnubandhanQuote(**quote_data)
                        self.db.add(quote)
                        existing_map[instance_id] = quote
                        imported_count += 1
                        
                except IntegrityError:
                    self.db.rollback()
                    continue
                except Exception:
                    continue
        
        self.db.commit()
        return imported_count, updated_count
    
    def import_bandhan_plus_quotes(self, file: UploadFile):
        """Import BandhanPlus Quotes Report - Only take first record per instance_id"""
        contents = file.file.read()
        df = read_upload_table(contents)
        
        # Flexible headers: map known columns to canonical names; the rest are dynamic
        df, extra_cols = self.canonicalize_dataframe(df, 'BandhanPlus Quotes Report')

        is_valid, message = self.validate_file_format(df, 'BandhanPlus Quotes Report')
        if not is_valid:
            raise HTTPException(status_code=400, detail=f"Invalid file format for BandhanPlus Quotes Report: {message}")
        
        # Group by Pulse Instance ID and take first record for each
        first_records_df = df.groupby('Pulse Instance ID').first().reset_index()
        
        # ── FAST: dict iteration + bulk preload ──
        records = first_records_df.to_dict('records')
        instance_ids = [self.extract_instance_id(r, 'BandhanPlus Quotes Report') for r in records]
        existing_map = self._bulk_load_by_instance_id(BandhanPlusQuote, instance_ids)
        customer_cache = self._bulk_load_by_instance_id(Customer, instance_ids)
        
        imported_count = 0
        updated_count = 0
        
        with self.db.no_autoflush:
            for row in records:
                try:
                    instance_id = self.extract_instance_id(row, 'BandhanPlus Quotes Report')
                    engine_no = self.extract_engine_serial_no(row, 'BandhanPlus Quotes Report')
                    
                    if not instance_id:
                        continue
                    
                    # Get branch_id from preloaded customer cache (O(1))
                    cust = customer_cache.get(instance_id)
                    branch_id = cust.branch_id if (cust and cust.branch_id) else None
                    
                    # Update or create customer
                    self.update_or_create_customer(instance_id, row, 'BandhanPlus Quotes Report', cache=customer_cache)
                    
                    # Prepare quote data
                    quote_data = {
                        'instance_id': instance_id,
                        'branch_id': branch_id,
                        'id_col': self.truncate_string(row.get('Id'), 100),
                        'quotation_ref_no': self.convert_to_string(row.get('QuotationRefNo')),
                        'company_name': self.truncate_string(row.get('CompanyName')),
                        'engine_no': engine_no,
                        'contact_person_name': self.truncate_string(row.get('ContactPersonName')),
                        'mobile_no': self.truncate_string(row.get('MobileNo'), 50),
                        'email_id': self.truncate_string(row.get('EmailId')),
                        'genset_kva': self.truncate_string(row.get('GensetKVA'), 100),
                        'zone': self.truncate_string(row.get('Zone'), 200),
                        'state': self.truncate_string(row.get('State'), 200),
                        'city': self.truncate_string(row.get('City'), 200),
                        'location': self.truncate_string(row.get('Location')),
                        'no_of_years': self.convert_to_numeric(row.get('NoOfYears')),
                        'genset_running_per_year': self.truncate_string(row.get('GensetRunningPerYear'), 100),
                        'created_date_time': self.parse_date(row.get('CreatedDateTime')),
                        'status': self.truncate_string(row.get('Status'), 100),
                        'payment_type': self.truncate_string(row.get('PaymentType'), 100),
                        'transaction_id': self.truncate_string(row.get('TransactionId'), 200),
                        'bank_name': self.truncate_string(row.get('BankName')),
                        'account_no': self.truncate_string(row.get('AccountNo'), 200),
                        'date_of_payment': self.parse_date(row.get('DateOfPayment')),
                        'payment_update_date_time': self.parse_date(row.get('PaymentUpdateDateTime')),
                        'is_neft_confirm': self.convert_to_boolean(row.get('IsNEFTConfirm')),
                        'is_cheque_confirm': self.convert_to_boolean(row.get('IsChequeConfirm')),
                        'cheque_deposited_address': self.convert_to_string(row.get('Cheque deposited-Address of YES Bank Branch')),
                        'cheque_given_dealership': self.truncate_string(row.get('cheque given-Name of KOEL Dealership')),
                        'cheque_deposited': self.truncate_string(row.get('Cheque Deposited'), 200),
                        'cheque_to_dealer': self.truncate_string(row.get('Cheque To Dealer'), 200),
                        'employee_name': self.truncate_string(row.get('Employee Name')),
                        'pulse_id': self.truncate_string(row.get('Pulse Id'), 200),
                        'is_invoice_sent': self.convert_to_boolean(row.get('IsInvoiceSent')),
                        'is_refund': self.convert_to_boolean(row.get('IsRefund')),
                        'agent_id': self.truncate_string(row.get('AgentId'), 200),
                        'quote_price': self.convert_to_float(row.get('QuotePrice')),
                        'quotation_value_including_tax': self.convert_to_float(row.get('Quotation Value Including tax')),
                        'name_of_agent': self.truncate_string(row.get('Name of Agent')),
                        'actual_amount': self.convert_to_float(row.get('Actual Amount')),
                        'reason_of_short_payment': self.convert_to_string(row.get('Reason of Short Payment')),
                        'status_updated_by_admin': self.convert_to_string(row.get('Status updated by Admin')),
                        'quotation_expiry_date': self.parse_date(row.get('Quotation Expiry Date')),
                        'is_expired': self.convert_to_boolean(row.get('IsExpired')),
                        'payment_updated_month': self.truncate_string(row.get('Payment Updated Month'), 50),
                        'pulse_instance_id': self.truncate_string(row.get('Pulse Instance ID'), 200),
                        'new_price_applicable': self.convert_to_boolean(row.get('New Price Applicable')),
                        'quotation_type': 'BandhanPlus',
                        'extra_data': self.collect_extra_data(row, extra_cols),
                    }
                    
                    # O(1) lookup from preloaded map
                    existing = existing_map.get(instance_id)
                    
                    if existing:
                        # Update existing record with new data
                        self.update_record(existing, quote_data)
                        updated_count += 1
                    else:
                        # Create new record
                        quote = BandhanPlusQuote(**quote_data)
                        self.db.add(quote)
                        existing_map[instance_id] = quote
                        imported_count += 1
                        
                except IntegrityError:
                    self.db.rollback()
                    continue
                except Exception:
                    continue
        
        self.db.commit()
        return imported_count, updated_count
    
    def import_pulse_quotation(self, file: UploadFile):
        """Import 'Pulse Quotation - Service Only' — ONE ROW PER QUOTATION.

        The record key is the pair Instance Id + Quote ID. It used to be the
        Instance Id ALONE (`groupby('Instance Id').first()`), which kept a single
        quotation per genset and threw every other one away: a genset quoted five
        times in a quarter stored one quote, carrying only that one quote's Labor
        / Parts amounts. Nothing downstream ever wanted that — the Customer page
        and the data hub read these rows as a LIST, and the Drive pages take [0],
        which is now the LATEST quotation (rows come back newest first) instead of
        whichever line happened to sit first in the file — and the Open Quotation
        Tracker cannot be built on it at all, since it COUNTS quotations.

        Quote ID is a critical column, so it is always there; a row that somehow
        has none still imports, keyed on its Instance Id alone, rather than being
        dropped. In-file duplicates of the same pair: FIRST wins.

        The upsert is empty-safe (blank cells keep the old value, extra_data is
        merged), so re-importing the same export only fills blanks in — and the
        existing one-per-genset rows are matched by their own pair and updated in
        place rather than duplicated."""
        contents = file.file.read()
        df = read_upload_table(contents)

        # Flexible headers: map known columns to canonical names; the rest are dynamic
        df, extra_cols = self.canonicalize_dataframe(df, 'Pulse Quotation - Service Only')

        is_valid, message = self.validate_file_format(df, 'Pulse Quotation - Service Only')
        if not is_valid:
            raise HTTPException(status_code=400, detail=f"Invalid file format for Pulse Quotation - Service Only: {message}")

        def norm_quote_id(v):
            # Same normalization the column is stored with, so a key built from
            # the file and one rebuilt from a DB row always agree.
            return self.convert_to_string(v)

        # Unique key = Instance Id + Quote ID; FIRST occurrence in the file wins.
        unique_rows = {}
        for row in df.to_dict('records'):
            instance_id = self.extract_instance_id(row, 'Pulse Quotation - Service Only')
            if not instance_id:
                continue
            key = (instance_id, norm_quote_id(row.get('Quote ID')))
            if key not in unique_rows:
                unique_rows[key] = row

        instance_ids = [iid for iid, _ in unique_rows]

        # Existing rows keyed by the same pair. Loaded by instance_id (indexed),
        # then re-keyed so each quotation of a genset is matched separately.
        existing_map = {}
        unique_iids = list(set(instance_ids))
        for i in range(0, len(unique_iids), 1000):
            chunk = unique_iids[i:i + 1000]
            for rec in self.db.query(PulseQuotation).filter(
                    PulseQuotation.instance_id.in_(chunk)).all():
                existing_map[(rec.instance_id, rec.quote_id)] = rec

        customer_cache = self._bulk_load_by_instance_id(Customer, instance_ids)
        linked_iids = set()

        imported_count = 0
        updated_count = 0

        with self.db.no_autoflush:
            for (instance_id, quote_id), row in unique_rows.items():
                try:
                    # Get branch_id from preloaded customer cache (O(1))
                    cust = customer_cache.get(instance_id)
                    branch_id = cust.branch_id if (cust and cust.branch_id) else None

                    # Update or create customer — ONCE per genset per file, not
                    # once per quotation of it.
                    if instance_id not in linked_iids:
                        self.update_or_create_customer(instance_id, row, 'Pulse Quotation - Service Only', cache=customer_cache)
                    
                    # Prepare quote data
                    quote_data = {
                        'instance_id': instance_id,
                        'branch_id': branch_id,
                        'creation_date': self.parse_date(row.get('Creation Date')),
                        'quote_id': quote_id,
                        'first_level_observations': self.convert_to_string(row.get('First level observations')),
                        'quote_status': self.truncate_string(row.get('Quote Status'), 100),
                        'sr_type': self.truncate_string(row.get('SR Type'), 200),
                        'sr_sub_type': self.truncate_string(row.get('SR Sub Type'), 200),
                        'instance_id_col': self.truncate_string(row.get('Instance Id'), 200),
                        'account': self.truncate_string(row.get('Account')),
                        'bill_to_address': self.convert_to_string(row.get('Bill To Address')),
                        'ship_to_address': self.convert_to_string(row.get('Ship To Address')),
                        'first_name': self.truncate_string(row.get('First Name'), 200),
                        'last_name': self.truncate_string(row.get('Last Name'), 200),
                        'contact_phone_number': self.truncate_string(row.get('Account/Contact Phone Number'), 50),
                        'installation_site_address': self.convert_to_string(row.get('Installation Site Address')),
                        'contact_primary_email': self.truncate_string(row.get('Account/Contact Primary Email')),
                        'service_dealer': self.truncate_string(row.get('Service Dealer')),
                        'labor_amount': self.convert_to_float(row.get('Labor Amount')),
                        'parts_amount': self.convert_to_float(row.get('Parts Amount')),
                        'total_amount': self.convert_to_float(row.get('Total Amount')),
                        'prepared_by': self.truncate_string(row.get('Prepared By')),
                        'recommended_by': self.truncate_string(row.get('Recommended By')),
                        'finance_company_address': self.convert_to_string(row.get('Finance Company Address')),
                        'account_number': self.truncate_string(row.get('Account Number'), 200),
                        'purpose_of_quotation': self.convert_to_string(row.get('Purpose Of Quotation')),
                        'sr_number': self.truncate_string(row.get('SR#:'), 200),
                        'quote_revised_flag': self.convert_to_boolean(row.get('Quote Revised Flag')),
                        'quote_submitted_date': self.parse_date(row.get('Quote Submitted Date')),
                        'exception_enquiry_no': self.truncate_string(row.get('Exception Enquiry #'), 200),
                        'lead_no': self.truncate_string(row.get('Lead #'), 200),
                        'quotation_lead_assigned_name': self.truncate_string(row.get('Quotation Lead Assigned Name')),
                        'quotation_lead_assigned_job_title': self.truncate_string(row.get('Quotation Lead Assigned Job Title')),
                        'quotation_lead_assigned_phone': self.truncate_string(row.get('Quotation Lead Assigned Phone Number'), 50),
                        'quotation_lead_assigned_uid': self.truncate_string(row.get('Quotation Lead Assigned UID'), 200),
                        'extra_data': self.collect_extra_data(row, extra_cols),
                    }
                    
                    # O(1) lookup from preloaded map, on the Instance Id +
                    # Quote ID pair
                    existing = existing_map.get((instance_id, quote_id))
                    
                    if existing:
                        # Update existing record with new data
                        self.update_record(existing, quote_data)
                        updated_count += 1
                    else:
                        # Create new record
                        quote = PulseQuotation(**quote_data)
                        self.db.add(quote)
                        existing_map[(instance_id, quote_id)] = quote
                        imported_count += 1
                        
                except IntegrityError:
                    self.db.rollback()
                    continue
                except Exception:
                    continue
        
        self.db.commit()
        return imported_count, updated_count
    
    def import_lms_data(self, file: UploadFile):
        """Import LMS Data for ERP - Allow multiple records per instance_id (upsert by Lead Number)"""
        contents = file.file.read()
        df = read_upload_table(contents)

        # Flexible headers: map known columns to canonical names; the rest are dynamic
        df, extra_cols = self.canonicalize_dataframe(df, 'LMS Data for ERP')

        is_valid, message = self.validate_file_format(df, 'LMS Data for ERP')
        if not is_valid:
            raise HTTPException(status_code=400, detail=f"Invalid file format for LMS Data for ERP: {message}")

        # Keep ALL rows — multiple leads can share the same instance_id
        records = df.to_dict('records')

        # Preload customers by instance_id (for customer upsert + branch lookup)
        instance_ids = [self.extract_instance_id(r, 'LMS Data for ERP') for r in records]
        customer_cache = self._bulk_load_by_instance_id(Customer, instance_ids)

        # Preload existing LMS rows keyed by lead_number (the real unique key of a lead)
        all_leads = list({self.convert_to_string(r.get('Lead Number')) for r in records if r.get('Lead Number') is not None})
        all_leads = [l for l in all_leads if l]
        existing_by_lead = {}
        for i in range(0, len(all_leads), 1000):
            chunk = all_leads[i:i + 1000]
            for lms in self.db.query(LMSData).filter(LMSData.lead_number.in_(chunk)).all():
                if lms.lead_number and lms.lead_number not in existing_by_lead:
                    existing_by_lead[lms.lead_number] = lms

        imported_count = 0
        updated_count = 0

        with self.db.no_autoflush:
            for row in records:
                try:
                    instance_id = self.extract_instance_id(row, 'LMS Data for ERP')
                    lead_number = self.convert_to_string(row.get('Lead Number'))

                    if not instance_id:
                        continue

                    # Update or create customer
                    self.update_or_create_customer(instance_id, row, 'LMS Data for ERP', cache=customer_cache)

                    # Prepare LMS data (new file format mapped onto model fields)
                    lms_data = {
                        'instance_id': instance_id,
                        'lead_number': lead_number,
                        'lead_created_date': self.parse_date(row.get('Lead Created Date')),
                        'lead_raised_by': self.truncate_string(row.get('Lead Raised By')),
                        'lead_status': self.truncate_string(row.get('Lead Status'), 200),
                        'lead_raised_for': self.truncate_string(row.get('Lead Raised For')),
                        'lead_assigned_to': self.truncate_string(row.get('Lead Assigned To')),
                        'sd_id': self.truncate_string(row.get('SD Code'), 100),
                        'sd_name': self.truncate_string(row.get('SD Name')),
                        'branch_name': self.truncate_string(row.get('SD Branch Name')),
                        'branch_id': self.truncate_string(row.get('SD Branch Code'), 100),
                        'lead_sr_number': self.truncate_string(row.get('Service Request Number'), 200),
                        'sr_type': self.truncate_string(row.get('SR Type'), 200),
                        'sr_sub_type': self.truncate_string(row.get('SR Sub Type'), 200),
                        'sr_sub_type_2': self.truncate_string(row.get('SR Sub Type.1'), 200),
                        'account_id': self.truncate_string(row.get('Account ID'), 200),
                        'account_name': self.truncate_string(row.get('Account Name')),
                        'account_contact_number': self.truncate_string(row.get('Account Contact Number'), 50),
                        'account_contact_email_id': self.truncate_string(row.get('Account Contact Email ID'), 500),
                        'tele_caller_name': self.truncate_string(row.get('Tele-Caller Name')),
                        'tele_caller_uid': self.truncate_string(row.get('Tele-Caller UID'), 100),
                        'tele_caller_mobile_number': self.truncate_string(row.get('Tele Caller Mobile Number'), 50),
                        'enquiry_allocation_remarks': self.convert_to_string(row.get('Enquiry Allocation Remarks')),
                        'instance_id_col': self.truncate_string(row.get('Instance ID'), 200),
                        'engine_app_code': self.truncate_string(row.get('Engine App Code'), 200),
                        'engine_serial_no': self.truncate_string(row.get('Engine Serial No'), 200),
                        'engine_model': self.truncate_string(row.get('Engine Model'), 200),
                        'pin_code': self.truncate_string(row.get('Pin Code'), 20),
                        'segment': self.truncate_string(row.get('Segment'), 200),
                        'kva_rating': self.truncate_string(row.get('kVA Rating'), 100),
                        'commissioning_date': self.parse_date(row.get('Commissioning Date')),
                        'installation_site_address': self.convert_to_string(row.get('Installation Site Address')),
                        'city': self.truncate_string(row.get('City'), 200),
                        'district': self.truncate_string(row.get('District'), 200),
                        'state': self.truncate_string(row.get('State'), 200),
                        'asset_contact_name': self.truncate_string(row.get('Asset Contact Name')),
                        'asset_contact_phone_number': self.truncate_string(row.get('Asset Contact Phone Number'), 50),
                        'efsr_contact_name': self.truncate_string(row.get('eFSR Contact Name')),
                        'efsr_customer_number': self.truncate_string(row.get('eFSR Customer Number'), 100),
                        'qualifying_date': self.parse_date(row.get('Qualifying Date')),
                        'quotation_type': self.truncate_string(row.get('Quotation Type'), 200),
                        'quotation_number': self.truncate_string(row.get('Quotation Number'), 200),
                        'quotation_approval_date': self.parse_date(row.get('Quotation Approved Date')),
                        'mode_of_lead_creation': self.truncate_string(row.get('Mode Of Lead Creation'), 200),
                        'quotation_submit_date': self.parse_date(row.get('Quotation Submit Date')),
                        'quotation_labour_amt': self.convert_to_float(row.get('Quotation Labour Amt')),
                        'quotation_part_amt': self.convert_to_float(row.get('Quotation Part Amt')),
                        'total_quote_amount': self.convert_to_float(row.get('Total Quote Amount')),
                        'quotation_lead_assigned_name': self.truncate_string(row.get('Quotation Lead Assigned Name')),
                        'quotation_lead_assigned_uid': self.truncate_string(row.get('Quotation Lead Assigned UID'), 100),
                        'quotation_lead_assigned_job_title': self.truncate_string(row.get('Quotation Lead Assigned Job Title')),
                        'enquiry_loss_reason': self.convert_to_string(row.get('Enquiry Loss Reason')),
                        'service_engineer_name': self.truncate_string(row.get('Service Engineer Name')),
                        'service_engineer_uid': self.truncate_string(row.get('Service Engineer UID'), 100),
                        'service_engineer_mobile_number': self.truncate_string(row.get('Service Engineer Mobile Number'), 50),
                        'order_number': self.truncate_string(row.get('Order Number'), 200),
                        'sic_code': self.truncate_string(row.get('SIC Code'), 200),
                        'sic_code_type': self.truncate_string(row.get('SIC Code Type'), 200),
                        'labour_invoice_number': self.truncate_string(row.get('Labour Invoice Number'), 200),
                        'labour_invoice_amount': self.convert_to_float(row.get('Labour Invoice Amount')),
                        'part_invoice_amount': self.convert_to_float(row.get('Part Invoice Amount')),
                        'part_invoice_number': self.truncate_string(row.get('Part Invoice Number'), 200),
                        'lead_source': self.truncate_string(row.get('Lead Source'), 200),
                        'next_action_required': self.truncate_string(row.get('Next Action Required')),
                        'new_contact': self.truncate_string(row.get('New Contact')),
                        'lead_contact_number': self.truncate_string(row.get('Lead Contact Number'), 50),
                        'next_action_date': self.parse_date(row.get('Next Action Date')),
                        'lead_assign_to_sd': self.truncate_string(row.get('Lead Assign To SD')),
                        'extra_data': self.collect_extra_data(row, extra_cols),
                    }

                    # Upsert by lead_number so multiple leads per instance_id are ALL kept
                    existing = existing_by_lead.get(lead_number) if lead_number else None

                    if existing:
                        # Update existing record with new data
                        self.update_record(existing, lms_data)
                        updated_count += 1
                    else:
                        # Create new record (duplicate instance_id is fine)
                        lms = LMSData(**lms_data)
                        self.db.add(lms)
                        if lead_number:
                            existing_by_lead[lead_number] = lms
                        imported_count += 1

                except IntegrityError:
                    self.db.rollback()
                    continue
                except Exception:
                    continue

        self.db.commit()
        return imported_count, updated_count
    
    def import_regular_bandhan(self, file: UploadFile):
        """Import Regular Bandhan (NEW quote-style format).
        - Rows are matched by 'Pulse Instance ID' ONLY (no engine-serial matching).
        - ONE row per instance_id: the FIRST occurrence in the file wins; later
          duplicates of the same instance_id are skipped.
        - Rows without a Pulse Instance ID are skipped.
        - The file has no branch column — the customer's branch_id is never changed.
        """
        contents = file.file.read()
        df = read_upload_table(contents)

        # Flexible headers: map known columns to canonical names; the rest are dynamic
        df, extra_cols = self.canonicalize_dataframe(df, 'Regular Bandhan Customers Report')

        is_valid, message = self.validate_file_format(df, 'Regular Bandhan Customers Report')
        if not is_valid:
            raise HTTPException(status_code=400, detail=f"Invalid file format for Regular Bandhan Customers Report: {message}")

        # ── FAST: dict iteration + bulk preload ──
        records = df.to_dict('records')

        all_iids = list({self.convert_to_string(r.get('Pulse Instance ID')) for r in records} - {None, ''})
        customer_cache = self._bulk_load_by_instance_id(Customer, all_iids)

        # Existing RegularBandhan rows by instance_id in ONE query batch (upsert targets)
        existing_by_iid = {}
        for i in range(0, len(all_iids), 1000):
            chunk = all_iids[i:i + 1000]
            for rb in self.db.query(RegularBandhan).filter(RegularBandhan.instance_id.in_(chunk)).all():
                if rb.instance_id and rb.instance_id not in existing_by_iid:
                    existing_by_iid[rb.instance_id] = rb

        imported_count = 0
        updated_count = 0
        seen_iids = set()  # first occurrence in the file wins

        with self.db.no_autoflush:
            for row in records:
                try:
                    instance_id = self.convert_to_string(row.get('Pulse Instance ID'))
                    if not instance_id:
                        continue
                    if instance_id in seen_iids:
                        continue  # duplicate instance_id in file — keep first occurrence only
                    seen_iids.add(instance_id)

                    # Record branch_id comes from the CUSTOMER (read-only) — the file
                    # has no branch column and must not change the customer's branch.
                    cust = customer_cache.get(instance_id)
                    branch_id = cust.branch_id if cust and cust.branch_id else None

                    # Fill blank customer fields (Company Name / Mobile No / Email Id / City)
                    self.update_or_create_customer(instance_id, row, 'Regular Bandhan Customers Report', cache=customer_cache)

                    bandhan_data = {
                        'instance_id': instance_id,
                        'branch_id': branch_id,
                        'id_col': self.convert_to_string(row.get('Id')),
                        'quotation_ref_no': self.convert_to_string(row.get('Quotation Ref No')),
                        'company_name': self.truncate_string(row.get('Company Name')),
                        'engine_no': self.truncate_string(row.get('Engine No'), 200),
                        'contact_person_name': self.truncate_string(row.get('Contact Person Name')),
                        'mobile_no': self.truncate_string(row.get('Mobile No'), 50),
                        'email_id': self.truncate_string(row.get('Email Id')),
                        'genset_kva': self.truncate_string(row.get('Genset KVA'), 100),
                        'zone': self.truncate_string(row.get('Zone'), 200),
                        'state': self.truncate_string(row.get('State'), 200),
                        'city': self.truncate_string(row.get('City'), 200),
                        'location': self.truncate_string(row.get('Location')),
                        'no_of_years': self.convert_to_numeric(row.get('No Of Years')),
                        'genset_running_per_year': self.truncate_string(row.get('Genset Running Per Year'), 100),
                        'created_date_time': self.parse_date(row.get('Created Date Time')),
                        'status': self.truncate_string(row.get('Status'), 100),
                        'payment_type': self.truncate_string(row.get('PaymentType'), 100),
                        'transaction_id': self.truncate_string(row.get('Transaction Id'), 200),
                        'bank_name': self.truncate_string(row.get('Bank Name')),
                        'account_no': self.truncate_string(row.get('Account No'), 200),
                        'date_of_payment': self.parse_date(row.get('Date Of Payment')),
                        'payment_update_date_time': self.parse_date(row.get('Payment Update Date Time')),
                        'is_neft_confirm': self.convert_to_boolean(row.get('Is NEFT Confirm')),
                        'is_cheque_confirm': self.convert_to_boolean(row.get('Is Cheque Confirm')),
                        'cheque_deposited_address': self.convert_to_string(row.get('Cheque deposited-Address of YES Bank Branch')),
                        'cheque_given_dealership': self.truncate_string(row.get('cheque given-Name of KOEL Dealership')),
                        'cheque_deposited': self.truncate_string(row.get('Cheque Deposited'), 200),
                        'cheque_to_dealer': self.truncate_string(row.get('Cheque To Dealer'), 200),
                        'employee_name': self.truncate_string(row.get('Employee Name')),
                        'pulse_id': self.convert_to_string(row.get('Pulse Id')),
                        'is_invoice_sent': self.convert_to_boolean(row.get('Is Invoice Sent')),
                        'is_refund': self.convert_to_boolean(row.get('Is Refund')),
                        'agent_id': self.convert_to_string(row.get('Agent Id')),
                        'quote_price': self.convert_to_float(row.get('QuotePrice')),
                        'quotation_value_including_tax': self.convert_to_float(row.get('Quotation Value Including tax')),
                        'name_of_agent': self.truncate_string(row.get('Name of Agent')),
                        'actual_amount': self.convert_to_float(row.get('Actual Amount')),
                        'reason_of_short_payment': self.convert_to_string(row.get('Reason of Short Payment')),
                        'status_updated_by_admin': self.convert_to_string(row.get('Status updated by Admin')),
                        'quotation_expiry_date': self.parse_date(row.get('Quotation Expiry Date')),
                        'is_expired': self.convert_to_boolean(row.get('IsExpired')),
                        'payment_updated_month': self.truncate_string(row.get('Payment Updated Month'), 50),
                        'new_price_applicable': self.convert_to_boolean(row.get('New Price Applicable')),
                        'quotation_type': self.truncate_string(row.get('Quotation Type'), 50),
                        'first_pm_date': self.parse_date(row.get('First PM Date')),
                        'agreement_start_date': self.parse_date(row.get('Agreement start date')),
                        'extra_data': self.collect_extra_data(row, extra_cols),
                    }

                    existing = existing_by_iid.get(instance_id)
                    if existing:
                        self.update_record(existing, bandhan_data)
                        updated_count += 1
                    else:
                        bandhan = RegularBandhan(**bandhan_data)
                        self.db.add(bandhan)
                        existing_by_iid[instance_id] = bandhan
                        imported_count += 1

                except IntegrityError:
                    self.db.rollback()
                    continue
                except Exception:
                    continue

        self.db.commit()
        return imported_count, updated_count
    
    def import_open_sr_load_report(self, file: UploadFile):
        """Import Open SR Load Report — upserted on the unique combination
        (Instance Id [Asset #], Service Request #); in-file duplicates of the
        combination keep the FIRST row only.

        ACCUMULATE: the file is imported as-is. Combinations already in the DB
        are updated in place and new ones are added; last_seen_date records the
        import they were last present in. Rows NOT in the file are left exactly
        as they are — nothing is deleted and nothing is flagged.

        There is no open/closed flag on this table. An SR is CLOSED when the
        same (instance_id, sr_number) appears in the 'MaxTTR - Oil Change SR
        Zero Labour Flag' file; until then it is open. See
        CustomerController.get_open_sr_load_reports_by_instance."""
        contents = file.file.read()
        df = read_upload_table(contents)
        
        # Flexible headers: map known columns to canonical names; the rest are dynamic
        df, extra_cols = self.canonicalize_dataframe(df, 'Open SR Load Report')

        is_valid, message = self.validate_file_format(df, 'Open SR Load Report')
        if not is_valid:
            raise HTTPException(status_code=400, detail=f"Invalid file format for Open SR Load Report: {message}")
        
        # ── FAST: dict iteration + bulk preload ──
        records = df.to_dict('records')

        # Unique key = (Instance Id [Asset #], Service Request #). Keep ONLY the
        # FIRST row in the file for each combination; later duplicates are
        # ignored — so the customer table is also updated from that first row.
        seen_keys = set()
        deduped_records = []
        for r in records:
            key = (self.extract_instance_id(r, 'Open SR Load Report'),
                   self.convert_to_string(r.get('Service Request #')))
            if key in seen_keys:
                continue
            seen_keys.add(key)
            deduped_records.append(r)
        records = deduped_records

        all_iids = [self.extract_instance_id(r, 'Open SR Load Report') for r in records]
        all_serials = [self.extract_engine_serial_no(r, 'Open SR Load Report') for r in records]
        engine_to_iid = self._build_engine_to_instance_map(all_serials)
        all_iids_full = list({*all_iids, *engine_to_iid.values()})
        customer_cache = self._bulk_load_by_instance_id(Customer, all_iids_full)
        
        # Pre-load existing OpenSRLoadReport rows by service_request_no in ONE
        # query batch, keyed by the upsert key (instance_id, service_request_no)
        all_srs = list({self.convert_to_string(r.get('Service Request #')) for r in records if r.get('Service Request #') is not None})
        all_srs = [s for s in all_srs if s]
        existing_by_key = {}
        for i in range(0, len(all_srs), 1000):
            chunk = all_srs[i:i + 1000]
            for sr in self.db.query(OpenSRLoadReport).filter(OpenSRLoadReport.service_request_no.in_(chunk)).all():
                key = (sr.instance_id, sr.service_request_no)
                if key not in existing_by_key:
                    existing_by_key[key] = sr
        
        imported_count = 0
        updated_count = 0
        import_time = now_ist()

        with self.db.no_autoflush:
            for row in records:
                try:
                    instance_id = self.extract_instance_id(row, 'Open SR Load Report')
                    
                    service_request_no = self.convert_to_string(row.get('Service Request #'))
                    engine_serial_no = self.extract_engine_serial_no(row, 'Open SR Load Report')
                    
                    # Get branch_id from preloaded customer cache (O(1))
                    branch_id = None
                    if instance_id:
                        cust = customer_cache.get(instance_id)
                        if cust and cust.branch_id:
                            branch_id = cust.branch_id
                    
                    # Update or create customer
                    if instance_id:
                        self.update_or_create_customer(instance_id, row, 'Open SR Load Report', cache=customer_cache)
                    elif engine_serial_no:
                        found_instance_id = engine_to_iid.get(engine_serial_no)
                        if found_instance_id:
                            self.update_or_create_customer(found_instance_id, row, 'Open SR Load Report', cache=customer_cache)
                    
                    # Prepare SR data
                    sr_data = {
                        'instance_id': instance_id,
                        'branch_id': branch_id,
                        'service_request_no': service_request_no,
                        'sr_due_date': self.parse_date(row.get('SR Due Date')),
                        'appointment_date': self.parse_date(row.get('Appointment Date')),
                        'service_dealer': self.truncate_string(row.get('Service Dealer')),
                        'status': self.truncate_string(row.get('Status'), 100),
                        'sr_type': self.truncate_string(row.get('SR Type'), 200),
                        'sr_sub_type': self.truncate_string(row.get('SR Sub-Type'), 200),
                        'problem_code': self.truncate_string(row.get('Problem Code'), 200),
                        'installation_site_address': self.convert_to_string(row.get('Installation Site Address')),
                        'engine_app_code': self.truncate_string(row.get('Engine App Code'), 200),
                        'voc': self.truncate_string(row.get('VOC'), 200),
                        'engine_serial_no': engine_serial_no,
                        'engine_series': self.truncate_string(row.get('Engine Series'), 200),
                        'engine_model': self.truncate_string(row.get('Engine Model'), 200),
                        'ticket_no': self.truncate_string(row.get('Ticket#'), 200),
                        'segment': self.truncate_string(row.get('Segment'), 200),
                        'task_start_date': self.parse_date(row.get('Task Start Date')),
                        'task_end_date': self.parse_date(row.get('Task End Date')),
                        'account': self.truncate_string(row.get('Account')),
                        'under_monitoring_date': self.parse_date(row.get('Under Monitoring Date')),
                        'under_monitoring_remark': self.convert_to_string(row.get('Under Monitoring Remark')),
                        'convert_pm_to_wet_pm_flag': self.truncate_string(row.get('Convert PM to Wet PM Flag'), 100),
                        'efsr_engineer_remarks': self.convert_to_string(row.get('eFSR Engineer Remarks')),
                        'quick_ticket_sr_comments': self.convert_to_string(row.get('Quick Ticket SR Comments')),
                        'actual_sr_due_date': self.parse_date(row.get('Actual SR Due Date')),
                        'convert_pm_to_wet_pm_flag_updated_date': self.parse_date(row.get('Convert PM to Wet PM Flag updated Date')),
                        'convert_pm_to_wet_pm_flag_updated_by': self.truncate_string(row.get('Convert PM to Wet PM Flag updated by')),
                        'customer_name': self.truncate_string(row.get('Customer Name')),
                        'contact_last_name': self.truncate_string(row.get('Contact Last Name'), 200),
                        'customer_mobile_no': self.truncate_string(row.get('Customer Mobile #'), 50),
                        'genset_appcode': self.truncate_string(row.get('Genset Appcode'), 200),
                        'contact_name': self.truncate_string(row.get('Contact Name')),
                        'primary_phone_no': self.truncate_string(row.get('Primary Phone#'), 50),
                        'mode': self.truncate_string(row.get('Mode'), 100),
                        'close_date_time': self.parse_date(row.get('Close Date/Time')),
                        'special_tool': self.truncate_string(row.get('Special Tool'), 500),
                        'special_tool_name': self.truncate_string(row.get('Special Tool Name'), 500),
                        'repeat': self.truncate_string(row.get('Repeat'), 100),
                        'assigned_to': self.truncate_string(row.get('Assigned To')),
                        'oil_change_flg': self.truncate_string(row.get('Oil Change Flg'), 100),
                        'claim_created': self.truncate_string(row.get('Claim Created'), 100),
                        'agreement_no': self.truncate_string(row.get('Agreement #'), 200),
                        'cancellation_reason': self.convert_to_string(row.get('Cancellation Reason')),
                        'csp_cancellation_reasons': self.truncate_string(row.get('CSP Cancellation Reasons'), 500),
                        'csp_cancellation_remarks': self.convert_to_string(row.get('CSP Cancellation Remarks')),
                        'asm_ase_remarks': self.convert_to_string(row.get('ASM/ASE Remarks')),
                        'asm_ase_remarks_date': self.parse_date(row.get('ASM/ASE Remarks Date')),
                        'battery_charger_availability': self.truncate_string(row.get('Battery Charger Availability'), 100),
                        'wet_pm_due_flag': self.truncate_string(row.get('Wet PM Due Flag'), 100),
                        'cap_limit_approval_remarks': self.convert_to_string(row.get('Cap Limit Approval Remarks')),
                        'cap_limit_deviation_remarks': self.convert_to_string(row.get('Cap Limit Deviation Remarks')),
                        'cap_limit_deviation_status': self.truncate_string(row.get('Cap Limit Deviation Status'), 100),
                        'cap_limit_user_details': self.truncate_string(row.get('Cap limit User details'), 500),
                        'csp_prepone_flag': self.truncate_string(row.get('CSP Prepone Flag'), 100),
                        'csp_prepone_flag_updated_by': self.truncate_string(row.get('CSP Prepone Flag updated By')),
                        'bandhan_pm_sr_closure_within_15_days_flag': self.truncate_string(row.get('Bandhan PM SR closure within 15 days flag'), 100),
                        'bandhan_pm_lock_removal_flag_updated_by': self.truncate_string(row.get('Bandhan PM Lock Removal flag updated by')),
                        'bandhan_pm_lock_removal_flag_updated_date': self.parse_date(row.get('Bandhan PM Lock Removal flag updated Date')),
                        'bandhan_pm_sr_closure_90_days_max_after_pm_due_date_flag': self.truncate_string(row.get('Bandhan PM SR Closure @90 days max after PM Due Date flag'), 100),
                        'bandhan_pm_due_date_lock_removal_flag_updated_by': self.truncate_string(row.get('Bandhan PM Due Date Lock Removal flag updated by')),
                        'bandhan_pm_due_date_lock_removal_flag_updated_date': self.parse_date(row.get('Bandhan PM Due Date Lock Removal flag updated Date')),
                        'bandhan_job_card_creation_prior_to_60_days_flag': self.truncate_string(row.get('Bandhan Job card creation prior to 60 days flag'), 100),
                        'bandhan_pm_jc_creation_lock_removal_flag_updated_by': self.truncate_string(row.get('Bandhan PM JC creation Lock Removal flag updated by')),
                        'bandhan_pm_jc_creation_lock_removal_flag_updated_date': self.parse_date(row.get('Bandhan PM JC creation Lock Removal flag updated Date')),
                        'account_id': self.truncate_string(row.get('Account Id'), 200),
                        'sr_created_by': self.truncate_string(row.get('SR Created BY')),
                        'sr_created_date': self.parse_date(row.get('SR Created Date')),
                        'efsr_krm_number': self.truncate_string(row.get('eFSR KRM Number'), 200),
                        'dry_csp_approved_by': self.truncate_string(row.get('Dry CSP Approved by')),
                        'dry_csp_approved_date': self.parse_date(row.get('Dry CSP Approved Date')),
                        'last_seen_date': import_time,
                        'extra_data': self.collect_extra_data(row, extra_cols),
                    }
                    
                    # O(1) lookup on (instance_id, service_request_no)
                    existing = None
                    if service_request_no:
                        existing = existing_by_key.get((instance_id, service_request_no))
                        if existing is None and instance_id:
                            # Legacy/pending row imported before its instance
                            # was known — adopt it instead of duplicating the SR
                            existing = existing_by_key.pop((None, service_request_no), None)

                    if existing:
                        # Update existing record
                        self.update_record(existing, sr_data)
                        existing_by_key[(existing.instance_id, existing.service_request_no)] = existing
                        updated_count += 1
                    else:
                        # Create new record
                        sr_report = OpenSRLoadReport(**sr_data)
                        self.db.add(sr_report)
                        if service_request_no:
                            existing_by_key[(instance_id, service_request_no)] = sr_report
                        imported_count += 1
                        
                except IntegrityError:
                    self.db.rollback()
                    continue
                except Exception:
                    continue

        # No snapshot pass: rows absent from this upload keep their data as-is.
        # Whether an SR is still open is answered against the MaxTTR file at
        # read time, not by what the latest Open SR upload happened to contain.
        self.db.commit()

        # Welcome Letter module: every unique CC (Commissioning) instance in
        # the freshly imported Open SR data is upserted into the persistent
        # welcome_letter_entries table (sent letters keep their state). Every CC
        # row ever imported counts, so a commissioning SR that has since closed
        # is never lost. Never lets a sync problem fail the import.
        try:
            from app.controllers.welcome_letter_controller import sync_from_open_sr
            added = sync_from_open_sr(self.db)
            if added:
                print(f"[welcome-letter] {added} new CC customer(s) added from Open SR import")
        except Exception as e:
            print(f"[welcome-letter] sync skipped: {e}")

        return imported_count, updated_count

    def match_pending_regular_bandhan(self):
        """OBSOLETE with the NEW Regular Bandhan format: rows are matched by
        'Pulse Instance ID' at import time and rows without one are skipped, so
        there are no pending (instance-less) records to match anymore."""
        return 0

    def match_pending_open_sr_records(self):
        """Match Open SR Load Report records that don't have instance_id yet"""
        pending = self.db.query(OpenSRLoadReport).filter(
            OpenSRLoadReport.instance_id.is_(None)
        ).all()
        if not pending:
            return 0
        
        # Bulk pre-build the lookup maps (used to be 6 queries per row, now 6 queries TOTAL)
        serials = [p.engine_serial_no for p in pending if p.engine_serial_no]
        engine_to_iid = self._build_engine_to_instance_map(serials)
        
        iids_found = list(set(engine_to_iid.values()))
        customer_cache = self._bulk_load_by_instance_id(Customer, iids_found)
        iid_to_branch = self._build_instance_to_branch_map(iids_found)
        
        matched = 0
        for record in pending:
            if not record.engine_serial_no:
                continue
            instance_id = engine_to_iid.get(record.engine_serial_no)
            if not instance_id:
                continue
            
            record.instance_id = instance_id
            matched += 1
            
            # Update branch_id from customer
            customer = customer_cache.get(instance_id)
            if customer and customer.branch_id:
                record.branch_id = customer.branch_id
            
            if customer and not customer.branch_id:
                branch_id = iid_to_branch.get(instance_id)
                if branch_id:
                    customer.branch_id = branch_id
        
        if matched > 0:
            self.db.commit()
        
        return matched
    
    def import_maxttr_oil_change_sr(self, file):
        """Import 'MaxTTR - Oil Change SR Zero Labour Flag' (Close SR Report) — ONE row per unique
        (instance_id, sr_number) combination, upserted on re-import. If the
        same combination appears multiple times in the file, the FIRST row
        wins. ONLY instance_ids that already exist in the customers table are
        stored; every other row is skipped (this file enriches known
        customers, it never creates new ones)."""
        contents = file.file.read()
        df = read_upload_table(contents)

        # Flexible headers: map known columns to canonical names; the rest are dynamic
        df, extra_cols = self.canonicalize_dataframe(df, 'MaxTTR - Oil Change SR Zero Labour Flag')

        # Case/spacing-insensitive header lookup so small header variations
        # ("OIL CHANGE FLAG" / "Oil Change Flag") don't break the import.
        norm = {str(c).strip().lower(): c for c in df.columns if pd.notna(c)}

        def col(*names):
            for n in names:
                c = norm.get(n.lower())
                if c is not None:
                    return c
            return None

        iid_col = col('INSTANCE ID', 'Instance Id [Asset #]', 'Instance Id', 'Asset Number')
        if not iid_col:
            raise HTTPException(
                status_code=400,
                detail="Invalid file format for MaxTTR - Oil Change SR Zero Labour Flag: missing 'INSTANCE ID' column"
            )

        sr_col = col('SR NUMBER', 'SR NO', 'SR #', 'SERVICE REQUEST NUMBER')
        if not sr_col:
            raise HTTPException(
                status_code=400,
                detail="Invalid file format for MaxTTR - Oil Change SR Zero Labour Flag: missing 'SR NUMBER' column"
            )

        if not col('SR TYPE'):
            raise HTTPException(
                status_code=400,
                detail="Invalid file format for MaxTTR - Oil Change SR Zero Labour Flag: missing 'SR TYPE' column"
            )
        if not col('SR SUBTYPE', 'SR SUB TYPE', 'SR SUB-TYPE'):
            raise HTTPException(
                status_code=400,
                detail="Invalid file format for MaxTTR - Oil Change SR Zero Labour Flag: missing 'SR SUBTYPE' column"
            )

        # value getter for a header (returns None when the column is absent)
        def val(row, *names):
            c = col(*names)
            return row.get(c) if c else None

        def norm_iid(v):
            s = self.convert_to_string(v)
            if not s:
                return None
            if 'Asset #:' in s:
                s = s.split('Asset #:')[-1].strip()
            return s or None

        records = df.to_dict('records')

        # Unique key = (instance_id, sr_number). Keep ONLY the FIRST row in the
        # file for each combination; later duplicates are ignored.
        def norm_sr(v):
            s = self.convert_to_string(v)
            return s.strip() if s else ''

        unique_rows = {}
        for row in records:
            iid = norm_iid(row.get(iid_col))
            if not iid:
                continue
            key = (iid, norm_sr(row.get(sr_col)))
            if key not in unique_rows:
                unique_rows[key] = row
        records = list(unique_rows.values())

        all_iids = list({norm_iid(r.get(iid_col)) for r in records} - {None})
        customer_cache = self._bulk_load_by_instance_id(Customer, all_iids)

        # Existing MaxTTR - Oil Change SR rows for these instance_ids, keyed by the
        # upsert key (instance_id, sr_number)
        existing = {}
        for i in range(0, len(all_iids), 1000):
            chunk = all_iids[i:i + 1000]
            for rec in self.db.query(MaxTTROilChangeSRZeroLabourFlag).filter(MaxTTROilChangeSRZeroLabourFlag.instance_id.in_(chunk)).all():
                existing[(rec.instance_id, (rec.sr_number or '').strip())] = rec

        imported_count = 0
        updated_count = 0

        with self.db.no_autoflush:
            for row in records:
                iid = norm_iid(row.get(iid_col))
                if not iid:
                    continue
                cust = customer_cache.get(iid)
                if not cust:
                    continue  # instance_id not in customers table — skip

                data = {
                    'zone_name': self.truncate_string(val(row, 'ZONE NAME'), 200),
                    'asm_name': self.truncate_string(val(row, 'ASM NAME')),
                    'sd_id': self.truncate_string(val(row, 'SD ID'), 100),
                    'sd_name': self.truncate_string(val(row, 'SD NAME')),
                    'branch_id': self.truncate_string(val(row, 'BRANCH ID'), 100) or cust.branch_id,
                    'branch_name': self.truncate_string(val(row, 'BRANCH NAME')),
                    'application_code': self.truncate_string(val(row, 'APPLICATION CODE'), 200),
                    'engine_serial_no': self.truncate_string(val(row, 'ENGINE SERIAL NO'), 200),
                    'engine_model': self.truncate_string(val(row, 'ENGINE MODEL'), 200),
                    'segment': self.truncate_string(val(row, 'SEGMENT'), 200),
                    'product_segment': self.truncate_string(val(row, 'PRODUCT SEGMENT'), 200),
                    'account_name': self.truncate_string(val(row, 'ACCOUNT NAME')),
                    'sr_number': self.truncate_string(val(row, 'SR NUMBER'), 200),
                    'sr_type': self.truncate_string(val(row, 'SR TYPE'), 200),
                    'sr_subtype': self.truncate_string(val(row, 'SR SUBTYPE', 'SR SUB TYPE', 'SR SUB-TYPE'), 200),
                    'sr_open_date': self.parse_date(val(row, 'SR OPEN DATE')),
                    'sr_close_date': self.parse_date(val(row, 'SR CLOSE DATE')),
                    'mode_of_sr': self.truncate_string(val(row, 'MODE OF SR'), 200),
                    'zero_labour_flag': self.truncate_string(val(row, 'ZERO LABOUR FLAG', 'ZERO LABOR FLAG'), 100),
                    'oil_change_flag': self.truncate_string(val(row, 'OIL CHANGE FLAG', 'OIL CHANGE FLG'), 100),
                    'count_of_tasks': self.convert_to_string(val(row, 'COUNT OF TASKS')),
                    'extra_data': self.collect_extra_data(row, extra_cols),
                }

                key = (iid, norm_sr(row.get(sr_col)))
                rec = existing.get(key)
                if rec:
                    # Same empty-safe update as every other table: blank cells
                    # never wipe existing data, extra_data is merged.
                    self.update_record(rec, data)
                    updated_count += 1
                else:
                    rec = MaxTTROilChangeSRZeroLabourFlag(instance_id=iid, **data)
                    self.db.add(rec)
                    existing[key] = rec
                    imported_count += 1

        self.db.commit()

        # This file IS the SR closure record, so any CSP drive asset whose SR
        # just landed here is finished — complete it in its drive right away.
        # Never let that sync fail the import itself.
        try:
            from app.controllers.campaign_controller import CampaignController
            CampaignController(self.db).auto_complete_csp_srs_closed_in_maxttr()
        except Exception as e:
            self.db.rollback()
            print(f"CSP auto-complete after MaxTTR import failed: {e}")

        return imported_count, updated_count

    def import_response_time_maxttr(self, file):
        """Import 'Response Time & MaxTTR Details' — SR NUMBER is the primary
        key: ONE row per unique SR NUMBER, upserted on re-import (blank cells
        never wipe existing data). If the same SR NUMBER appears multiple
        times in the file, the FIRST row wins. The customers table is also
        refreshed, but ONLY from the FIRST row of each instance_id in the
        file (instance_id repeats across SRs) — same empty-safe rules as
        every other import."""
        contents = file.file.read()
        df = read_upload_table(contents)

        # Flexible headers: map known columns to canonical names; the rest are dynamic
        df, extra_cols = self.canonicalize_dataframe(df, 'Response Time & MaxTTR Details')

        # This import had NO column check at all, so a file missing SR TYPE or
        # SE NAME uploaded happily and the Employee Productivity report just
        # came back short. It is validated like every other import now.
        is_valid, message = self.validate_file_format(df, 'Response Time & MaxTTR Details')
        if not is_valid:
            return {"success": False, "message": message}

        # Case/spacing-insensitive header lookup so small header variations
        # don't break the import.
        norm = {str(c).strip().lower(): c for c in df.columns if pd.notna(c)}

        def col(*names):
            for n in names:
                c = norm.get(n.lower())
                if c is not None:
                    return c
            return None

        # Fixed columns — the file must contain every one of them
        required = [
            ('BRANCH ID',), ('INSTANCE ID', 'Instance Id [Asset #]', 'Instance Id', 'Asset Number'),
            ('SR NUMBER', 'SR NO', 'SR #'), ('SR OPEN DATE',),
            # SR TASK END DATE is the attendance date: Employee Productivity's
            # 'Days present on Task end' is the DISTINCT count of it per engineer.
            ('SR TASK END DATE', 'TASK END DATE', 'SR TASK END DATE & TIME'),
            ('SR CLOSE DATE',),
            ('SE NAME',), ('SE TICKET NUM', 'SE TICKET NUMBER', 'SE TICKET NO')
        ]
        for names in required:
            if not col(*names):
                raise HTTPException(
                    status_code=400,
                    detail=f"Invalid file format for Response Time & MaxTTR Details: missing '{names[0]}' column"
                )

        sr_col = col('SR NUMBER', 'SR NO', 'SR #')
        iid_col = col('INSTANCE ID', 'Instance Id [Asset #]', 'Instance Id', 'Asset Number')

        # value getter for a header (returns None when the column is absent)
        def val(row, *names):
            c = col(*names)
            return row.get(c) if c else None

        def norm_iid(v):
            s = self.convert_to_string(v)
            if not s:
                return None
            if 'Asset #:' in s:
                s = s.split('Asset #:')[-1].strip()
            return s or None

        def norm_sr(v):
            s = self.convert_to_string(v)
            return s.strip() if s else None

        records = df.to_dict('records')

        # Unique key = SR NUMBER. Keep ONLY the FIRST row in the file for each
        # SR number; later duplicates are ignored.
        unique_rows = {}
        for row in records:
            sr = norm_sr(row.get(sr_col))
            if not sr:
                continue
            if sr not in unique_rows:
                unique_rows[sr] = row
        records = list(unique_rows.values())

        all_iids = list({norm_iid(r.get(iid_col)) for r in records} - {None})
        customer_cache = self._bulk_load_by_instance_id(Customer, all_iids)

        # Existing rows keyed by the upsert key (sr_number)
        all_srs = list(unique_rows.keys())
        existing = {}
        for i in range(0, len(all_srs), 1000):
            chunk = all_srs[i:i + 1000]
            for rec in self.db.query(ResponseTimeMaxTTR).filter(ResponseTimeMaxTTR.sr_number.in_(chunk)).all():
                existing[(rec.sr_number or '').strip()] = rec

        imported_count = 0
        updated_count = 0
        customers_seen = set()  # only the FIRST row per instance_id touches the customer

        with self.db.no_autoflush:
            for row in records:
                sr = norm_sr(row.get(sr_col))
                if not sr:
                    continue
                iid = norm_iid(row.get(iid_col))

                # Customer master: first occurrence of this instance_id only
                # (instance_id is duplicated across SR rows in this file)
                if iid and iid not in customers_seen:
                    customers_seen.add(iid)
                    self.update_or_create_customer(
                        iid, row, 'Response Time & MaxTTR Details', cache=customer_cache
                    )

                data = {
                    'instance_id': iid,
                    'zone_name': self.truncate_string(val(row, 'ZONE NAME'), 200),
                    'asm_name': self.truncate_string(val(row, 'ASM NAME')),
                    'sd_id': self.truncate_string(val(row, 'SD ID'), 100),
                    'sd_name': self.truncate_string(val(row, 'SD NAME')),
                    'branch_id': self.truncate_string(val(row, 'BRANCH ID'), 100),
                    'branch_name': self.truncate_string(val(row, 'BRANCH NAME')),
                    'application_code': self.truncate_string(val(row, 'APPLICATION CODE'), 200),
                    'engine_serial_no': self.truncate_string(val(row, 'ENGINE SERIAL NO'), 200),
                    'segment': self.truncate_string(val(row, 'SEGMENT'), 200),
                    'product_segment': self.truncate_string(val(row, 'PRODUCT SEGMENT'), 200),
                    'goem_oem': self.truncate_string(val(row, 'GOEM OEM'), 200),
                    'account_name': self.truncate_string(val(row, 'ACCOUNT NAME')),
                    'sr_type': self.truncate_string(val(row, 'SR TYPE'), 200),
                    'sr_subtype': self.truncate_string(val(row, 'SR SUBTYPE', 'SR SUB TYPE', 'SR SUB-TYPE'), 200),
                    'sr_open_date': self.parse_date(val(row, 'SR OPEN DATE')),
                    'sr_task_start_date': self.parse_date(val(row, 'SR TASK START DATE')),
                    'sr_task_end_date': self.parse_date(val(row, 'SR TASK END DATE')),
                    'sr_close_date': self.parse_date(val(row, 'SR CLOSE DATE')),
                    'engineer_remarks': self.convert_to_string(val(row, 'ENGINEER REMARKS')),
                    'se_name': self.truncate_string(val(row, 'SE NAME')),
                    'se_ticket_num': self.truncate_string(val(row, 'SE TICKET NUM', 'SE TICKET NUMBER', 'SE TICKET NO'), 200),
                    'response_time_range_in_hrs': self.truncate_string(val(row, 'RESPONSE TIME RANGE IN HRS'), 200),
                    'response_time': self.truncate_string(val(row, 'Response Time'), 200),
                    'maxttr_on_task_closed_in_hrs': self.truncate_string(val(row, 'MaxTTR on Task Closed in hrs'), 200),
                    'maxttr_on_sr_closed_in_hrs': self.truncate_string(val(row, 'MaxTTR on SR Closed in hrs'), 200),
                    'extra_data': self.collect_extra_data(row, extra_cols),
                }

                rec = existing.get(sr)
                if rec:
                    # Same empty-safe update as every other table: blank cells
                    # never wipe existing data, extra_data is merged.
                    self.update_record(rec, data)
                    updated_count += 1
                else:
                    rec = ResponseTimeMaxTTR(sr_number=sr, **data)
                    self.db.add(rec)
                    existing[sr] = rec
                    imported_count += 1

        self.db.commit()
        return imported_count, updated_count

    def import_cdi_detail_report(self, file):
        """Import 'CDI Detail Report' — writes to cdi_detail_report and LINKS
        each row to the customers table on ASSET NUMBER, the genset key the
        Asset files store as instance_id (present on 100% of the rows of the
        real export, and matching an existing customer on 4,978 of 4,979).
        No other import table is touched.

        The customer link uses the shared empty-safe helper, so a blank cell in
        this file can never wipe a value the customer master already holds, and
        only the FIRST row of each instance_id in the file is applied.

        SR NUMBER is the primary key: ONE row per unique SR NUMBER, upserted on
        re-import (blank cells never wipe existing data). If the same SR NUMBER
        appears several times in the file, the FIRST row wins. Fixed columns:
        SR NUMBER, BRANCH NAME, X TECHNICIAN ID, X TECHNICIAN NAME,
        CDI CATEGORY, ACTIVITY END DATE, Overall Experience, ASSET NUMBER —
        every other column is dynamic (extra_data). BRANCH NAME is the branch the Customer
        Delight Index report (Annual Reports) groups the feedback by: this file
        carries no BRANCH ID, so the name is the only branch it has."""
        contents = file.file.read()
        df = read_upload_table(contents)

        # Flexible headers: map the fixed columns to canonical names; rest dynamic
        df, extra_cols = self.canonicalize_dataframe(df, 'CDI Detail Report')

        norm = {str(c).strip().lower(): c for c in df.columns if pd.notna(c)}

        def col(*names):
            for n in names:
                c = norm.get(n.lower())
                if c is not None:
                    return c
            return None

        sr_col = col('SR NUMBER', 'SR NO', 'SR #')
        if not sr_col:
            raise HTTPException(
                status_code=400,
                detail="Invalid file format for CDI Detail Report: missing 'SR NUMBER' column"
            )

        def val(row, *names):
            c = col(*names)
            return row.get(c) if c else None

        def norm_sr(v):
            s = self.convert_to_string(v)
            return s.strip() if s else None

        # Unique key = SR NUMBER, FIRST occurrence in the file wins
        unique_rows = {}
        for row in df.to_dict('records'):
            sr = norm_sr(row.get(sr_col))
            if not sr:
                continue
            if sr not in unique_rows:
                unique_rows[sr] = row

        # Existing rows keyed by sr_number
        all_srs = list(unique_rows.keys())
        existing = {}
        for i in range(0, len(all_srs), 1000):
            chunk = all_srs[i:i + 1000]
            for rec in self.db.query(CDIDetailReport).filter(CDIDetailReport.sr_number.in_(chunk)).all():
                existing[(rec.sr_number or '').strip()] = rec

        # Customer relation: preload every instance the file mentions.
        all_iids = [self.extract_instance_id(r, 'CDI Detail Report')
                    for r in unique_rows.values()]
        customer_cache = self._bulk_load_by_instance_id(Customer, all_iids)
        linked_iids = set()

        imported_count = 0
        updated_count = 0

        with self.db.no_autoflush:
            for sr, row in unique_rows.items():
                instance_id = self.extract_instance_id(row, 'CDI Detail Report')
                # FIRST occurrence of an instance_id wins: later rows for the
                # same genset still store their own instance_id, they just do
                # not re-apply this file's values to the customer master.
                if instance_id and instance_id not in linked_iids:
                    linked_iids.add(instance_id)
                    self.update_or_create_customer(
                        instance_id, row, 'CDI Detail Report', cache=customer_cache)

                data = {
                    'instance_id': instance_id,
                    'branch_name': self.truncate_string(val(row, 'BRANCH NAME'), 150),
                    'x_technician_id': self.truncate_string(val(row, 'X TECHNICIAN ID'), 200),
                    'x_technician_name': self.truncate_string(val(row, 'X TECHNICIAN NAME')),
                    'cdi_category': self.truncate_string(val(row, 'CDI CATEGORY'), 200),
                    'x_account_name': self.truncate_string(val(row, 'X ACCOUNT NAME')),
                    'feedback_customer_name': self.truncate_string(val(row, 'FEEDBACK TKN CUST NAME')),
                    'feedback_customer_number': self.truncate_string(val(row, 'FEEDBACK TKN CUST NUM'), 50),
                    'activity_end_date': self.parse_date(val(row, 'ACTIVITY END DATE')),
                    'overall_experience': self.truncate_string(val(row, 'Overall Experience'), 50),
                    'extra_data': self.collect_extra_data(row, extra_cols),
                }

                rec = existing.get(sr)
                if rec:
                    # Empty-safe update: blank cells keep the old value,
                    # extra_data is merged.
                    self.update_record(rec, data)
                    updated_count += 1
                else:
                    rec = CDIDetailReport(sr_number=sr, **data)
                    self.db.add(rec)
                    existing[sr] = rec
                    imported_count += 1

        self.db.commit()
        return imported_count, updated_count

    def import_efsr_report(self, file):
        """Import 'EFSR Report' — writes to efsr_report and LINKS each row to
        the customers table on Instance ID (present on 100% of the rows of the
        real export, and matching an existing customer on 9,895 of 9,929).
        No other import table is touched.

        The customer link uses the shared empty-safe helper, so a blank cell in
        this file can never wipe a value the customer master already holds, and
        only the FIRST row of each instance_id in the file is applied.

        The key is the COMBINATION Appointment Number + Service Engineer UID +
        Task Assigned Date & Time: ONE row per unique triple, upserted on
        re-import (blank cells never wipe existing data, extra_data is merged).

        That triple is the file's real grain — one row per TASK ASSIGNMENT.
        Measured on the two real exports (11,760 and 9,929 rows):
          Service Request No. + UID   dropped 898 (7.6%) and 714 (7.2%) of rows,
                                      and 'first wins' kept the CANCELLED
                                      attempt while deleting the COMPLETED one.
          Appointment Number alone    dropped 91 / 7  (appointment re-assigned
                                      to another engineer).
          + Service Engineer UID      dropped 26 / 4  (same engineer assigned
                                      the same appointment twice).
          + Task Assigned Date        0 dropped in BOTH files.
        Service Request No. is NOT part of the key: the appointment number is
        '<SR No.>_<n>' in 100% of rows, so the SR adds nothing to it.

        Re-imports still land on the existing row because the assigned date
        never moves: across the 9,499 (appointment, UID) pairs present in both
        exports it changed 0 times, while 108 GAINED a Task End Date.

        Fixed columns: SD Branch Code, Service Request No., Appointment Number,
        SR Type, Task Assigned Date & Time, Task End Date, SR Closed Date,
        SR Status, Service Engineer Name, Service Engineer UID, Instance ID —
        every other column is dynamic (extra_data)."""
        contents = file.file.read()
        df = read_upload_table(contents)

        # Flexible headers: map the fixed columns to canonical names; rest dynamic
        df, extra_cols = self.canonicalize_dataframe(df, 'EFSR Report')

        norm = {str(c).strip().lower(): c for c in df.columns if pd.notna(c)}

        def col(*names):
            for n in names:
                c = norm.get(n.lower())
                if c is not None:
                    return c
            return None

        sr_col = col('Service Request No.', 'Service Request No', 'Service Request Number', 'SR NUMBER')
        if not sr_col:
            raise HTTPException(
                status_code=400,
                detail="Invalid file format for EFSR Report: missing 'Service Request No.' column"
            )

        # The record key's first column, so it is as mandatory as the SR number.
        appt_col = col('Appointment Number')
        if not appt_col:
            raise HTTPException(
                status_code=400,
                detail=("Invalid file format for EFSR Report: missing 'Appointment Number' "
                        "column - it is part of the record key (Appointment Number + "
                        "Service Engineer UID + Task Assigned Date & Time)")
            )

        def val(row, *names):
            c = col(*names)
            return row.get(c) if c else None

        def norm_sr(v):
            s = self.convert_to_string(v)
            return s.strip() if s else None

        def norm_uid(v):
            # Same normalization the column is stored with, so a key built from
            # the file and one rebuilt from an existing DB row always agree.
            return self.truncate_string(v, 100)

        def norm_appt(v):
            return self.truncate_string(v, 200)

        def norm_dt(v):
            # The stored column is DATETIME and the file carries minute
            # precision, so dropping microseconds keeps a key built from the
            # file identical to one rebuilt from the DB row.
            return v.replace(microsecond=0) if isinstance(v, datetime) else v

        uid_col = col('Service Engineer UID')

        # Unique key = (Appointment Number, Service Engineer UID, Task Assigned
        # Date). With the full triple the real files have NO in-file duplicates
        # at all; the first-wins guard only ever fires on a row repeated
        # verbatim, so nothing real is collapsed any more.
        unique_rows = {}
        for row in df.to_dict('records'):
            sr = norm_sr(row.get(sr_col))
            appt = norm_appt(row.get(appt_col))
            if not appt:
                # The portal always fills this in (0 blanks in either real
                # file). If it ever does not, fall back to the SR number so the
                # row is still stored under a deterministic key.
                appt = self.truncate_string(sr, 200)
            if not appt:
                continue                 # no appointment AND no SR: nothing to key on
            key = (appt,
                   norm_uid(row.get(uid_col)) if uid_col else None,
                   norm_dt(self.parse_date(
                       val(row, 'Task Assigned Date & Time', 'Task Assigned Date'))))
            if key not in unique_rows:
                unique_rows[key] = (sr, row)

        # Existing rows keyed by the same triple. Loaded by appointment number
        # (indexed), then re-keyed so each assignment is matched separately.
        all_appts = list({a for a, _u, _d in unique_rows})
        existing = {}
        for i in range(0, len(all_appts), 1000):
            chunk = all_appts[i:i + 1000]
            for rec in self.db.query(EFSRReport).filter(
                    EFSRReport.appointment_number.in_(chunk)).all():
                existing[(rec.appointment_number, rec.service_engineer_uid,
                          norm_dt(rec.task_assigned_date))] = rec

        # Customer relation: preload every instance the file mentions.
        all_iids = [self.extract_instance_id(r, 'EFSR Report')
                    for _sr, r in unique_rows.values()]
        customer_cache = self._bulk_load_by_instance_id(Customer, all_iids)
        linked_iids = set()

        imported_count = 0
        updated_count = 0

        with self.db.no_autoflush:
            for (appt, uid, assigned), (sr, row) in unique_rows.items():
                # service_request_no is NOT NULL. It is always in the file, but
                # the appointment number is '<SR No.>_<n>', so a blank SR cell
                # can be recovered from the key itself rather than dropping the
                # row or inserting a null.
                if not sr:
                    sr = appt.split('_')[0] or appt

                instance_id = self.extract_instance_id(row, 'EFSR Report')
                # FIRST occurrence of an instance_id wins: later task rows for
                # the same genset still store their own instance_id, they just
                # do not re-apply this file's values to the customer master.
                if instance_id and instance_id not in linked_iids:
                    linked_iids.add(instance_id)
                    self.update_or_create_customer(
                        instance_id, row, 'EFSR Report', cache=customer_cache)

                data = {
                    'service_request_no': sr,
                    'instance_id': instance_id,
                    'sd_branch_code': self.truncate_string(val(row, 'SD Branch Code'), 100),
                    'sr_type': self.truncate_string(val(row, 'SR Type'), 200),
                    'task_assigned_date': assigned,
                    'task_end_date': self.parse_date(
                        val(row, 'Task End Date', 'Task End Date & Time')),
                    'sr_closed_date': self.parse_date(val(row, 'SR Closed Date')),
                    'sr_status': self.truncate_string(val(row, 'SR Status'), 200),
                    'service_engineer_name': self.truncate_string(val(row, 'Service Engineer Name')),
                    'service_engineer_uid': uid,
                    'account': self.truncate_string(val(row, 'Account')),
                    'installation_site_address': self.convert_to_string(
                        val(row, 'Installation Site Address')),
                    'customer_name': self.truncate_string(val(row, 'Customer Name')),
                    'customer_contact_number': self.truncate_string(
                        val(row, 'Customer contact number'), 50),
                    'extra_data': self.collect_extra_data(row, extra_cols),
                }

                rec = existing.get((appt, uid, assigned))
                if rec:
                    # Empty-safe update: blank cells keep the old value,
                    # extra_data is merged.
                    self.update_record(rec, data)
                    updated_count += 1
                else:
                    rec = EFSRReport(appointment_number=appt, **data)
                    self.db.add(rec)
                    existing[(appt, uid, assigned)] = rec
                    imported_count += 1

        self.db.commit()
        return imported_count, updated_count


    def import_amc_expiry_planner(self, file):
        """Import 'AMC Agreement Expiry Planner' — the agreements coming up for
        renewal, LINKED to the customers table on INSTANCE ID.

        The key is the COMBINATION Instance Id + Agreement Number: ONE row per
        pair, upserted on re-import (blank cells never wipe existing data,
        extra_data is merged). Measured on the real 1,572-row export:
          INSTANCE ID alone       1,261 unique -> 311 rows (19.8%) lost; a
                                  genset renews, so it has several agreements.
          AGREEMENT NUMBER alone  1,550 unique ->  22 rows lost; one agreement
                                  covers a fleet (600550273 spans 4 gensets).
          the pair                1,572 unique ->   0 rows lost.

        Fixed columns: Instance Id, Agreement Number, Branch Id, Account Name,
        Installation Site Address, Agreement End Date. Every other column of
        the file is dynamic (extra_data).

        Customer master: Account Name -> customer_name, Installation Site
        Address -> location, Branch Id -> branch_id, keyed on Instance Id."""
        contents = file.file.read()
        df = read_upload_table(contents)

        # Flexible headers: map the fixed columns to canonical names; rest dynamic
        df, extra_cols = self.canonicalize_dataframe(df, 'AMC Agreement Expiry Planner')

        is_valid, message = self.validate_file_format(df, 'AMC Agreement Expiry Planner')
        if not is_valid:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid file format for AMC Agreement Expiry Planner: {message}"
            )

        def norm_agreement(v):
            # Same normalization the column is stored with, so a key built from
            # the file and one rebuilt from a DB row always agree.
            return self.truncate_string(v, 200)

        # Collapse in-file duplicates on the pair. First wins — a row repeated
        # verbatim is the only thing this can ever drop (the real export has 0).
        unique_rows = {}
        for row in df.to_dict('records'):
            instance_id = self.extract_instance_id(row, 'AMC Agreement Expiry Planner')
            if not instance_id:
                continue
            agreement_number = norm_agreement(row.get('AGREEMENT NUMBER'))
            key = (instance_id, agreement_number)
            if key not in unique_rows:
                unique_rows[key] = row

        instance_ids = [iid for iid, _ in unique_rows]

        # Existing rows keyed by the same pair. Loaded by instance_id (indexed),
        # then re-keyed so each agreement of a genset is matched separately.
        existing = {}
        unique_iids = list(set(instance_ids))
        for i in range(0, len(unique_iids), 1000):
            chunk = unique_iids[i:i + 1000]
            for rec in self.db.query(AMCExpiryPlanner).filter(
                    AMCExpiryPlanner.instance_id.in_(chunk)).all():
                existing[(rec.instance_id, rec.agreement_number)] = rec

        customer_cache = self._bulk_load_by_instance_id(Customer, instance_ids)

        imported_count = 0
        updated_count = 0

        with self.db.no_autoflush:
            for (instance_id, agreement_number), row in unique_rows.items():
                try:
                    # Link to the customer master (creates the customer if the
                    # genset has not been seen by any other import yet).
                    self.update_or_create_customer(
                        instance_id, row, 'AMC Agreement Expiry Planner',
                        cache=customer_cache)

                    data = {
                        'instance_id': instance_id,
                        'branch_id': self.truncate_string(row.get('BRANCH ID'), 100),
                        'account_name': self.truncate_string(row.get('ACCOUNT NAME')),
                        'installation_site_address': self.convert_to_string(
                            row.get('INSTALLATION SITE ADDRESS')),
                        'agreement_end_date': self.parse_date(row.get('AGREEMENT END DATE')),
                        'extra_data': self.collect_extra_data(row, extra_cols),
                    }

                    rec = existing.get((instance_id, agreement_number))
                    if rec:
                        # Empty-safe update: blank cells keep the old value,
                        # extra_data is merged.
                        self.update_record(rec, data)
                        updated_count += 1
                    else:
                        rec = AMCExpiryPlanner(agreement_number=agreement_number, **data)
                        self.db.add(rec)
                        existing[(instance_id, agreement_number)] = rec
                        imported_count += 1

                except IntegrityError:
                    self.db.rollback()
                    continue
                except Exception:
                    continue

        self.db.commit()
        return imported_count, updated_count


    # ==================== LMS Data from Insia ====================

    def _resolve_instance_ids_by_sr(self, sr_numbers):
        """Map SR number -> instance_id using every import table that carries
        both columns. 'LMS Data from Insia' has no genset key of its own, so the SR the
        lead was raised on is the only route from one of its rows to a customer.

        Sources are tried in order and the FIRST hit wins; each is a chunked
        IN() query, never a lookup per row. An SR that is in none of them yet
        resolves to nothing at all: that row imports unlinked and picks its
        instance up on a later upload, once the SR file has been loaded (the
        upsert is empty-safe, so re-importing the same lead file only fills the
        blanks in).
        """
        wanted = list({sr for sr in sr_numbers if sr})
        if not wanted:
            return {}

        sources = [
            (OpenSRLoadReport, OpenSRLoadReport.service_request_no),
            (ResponseTimeMaxTTR, ResponseTimeMaxTTR.sr_number),
            (MaxTTROilChangeSRZeroLabourFlag, MaxTTROilChangeSRZeroLabourFlag.sr_number),
            (EFSRReport, EFSRReport.service_request_no),
        ]

        resolved = {}
        for model, sr_col in sources:
            remaining = [sr for sr in wanted if sr not in resolved]
            if not remaining:
                break
            for i in range(0, len(remaining), 1000):
                chunk = remaining[i:i + 1000]
                rows = self.db.query(sr_col, model.instance_id).filter(
                    sr_col.in_(chunk), model.instance_id.isnot(None)
                ).all()
                for sr, iid in rows:
                    key = (sr or '').strip()
                    if key and iid and key not in resolved:
                        resolved[key] = iid
        return resolved

    def import_lms_insia(self, file):
        """Import 'LMS Data from Insia' - the second LMS layout - into lms_insia.

        LEAD NUMBER is the record key: ONE row per lead, upserted on re-import
        (blank cells never wipe existing data, extra_data is merged). When the
        same lead appears several times in the file the FIRST row wins - the
        real export repeats a lead once per PRODUCT LIST / PRODUCT TYPE line,
        and those two dynamic columns are the only difference in 301 of the 310
        repeated leads.

        Fixed columns: LEAD NUMBER, LEAD CREATED DATE, BRANCH ID, ACCOUNT NAME,
        LEAD SR NUMBER, SERVICE ENGINEER NAME, ORDER CREATION DATE. Every other
        column of the file is dynamic and kept as JSON in extra_data.

        CUSTOMER LINK - this file carries no Instance Id, so each row reaches
        the customers table through LEAD SR NUMBER: the SR is looked up in the
        SR tables (Open SR Load Report, Response Time & MaxTTR, MaxTTR Oil
        Change, EFSR Report) and that row's instance_id is stored on the lead.
        Only ACCOUNT NAME is contributed back to the customer master, empty-safe
        and only from the FIRST row of each instance in the file: the lead file
        has no contact number, e-mail or site address to give. Leads with no SR
        number (~47% of the real export) or with an SR that has not been
        uploaded yet import unlinked.

        No other import table is touched."""
        contents = file.file.read()
        df = read_upload_table(contents)

        # Flexible headers: map the fixed columns to canonical names; rest dynamic
        df, extra_cols = self.canonicalize_dataframe(df, 'LMS Data from Insia')

        is_valid, message = self.validate_file_format(df, 'LMS Data from Insia')
        if not is_valid:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid file format for LMS Data from Insia: {message}"
            )

        norm = {str(c).strip().lower(): c for c in df.columns if pd.notna(c)}

        def col(*names):
            for n in names:
                c = norm.get(n.lower())
                if c is not None:
                    return c
            return None

        def val(row, *names):
            c = col(*names)
            return row.get(c) if c else None

        lead_col = col('LEAD NUMBER')
        if not lead_col:
            raise HTTPException(
                status_code=400,
                detail="Invalid file format for LMS Data from Insia: missing 'LEAD NUMBER' column"
            )

        # Unique key = LEAD NUMBER, FIRST occurrence in the file wins
        unique_rows = {}
        for row in df.to_dict('records'):
            lead = self.convert_to_string(row.get(lead_col))
            lead = lead.strip() if lead else None
            if not lead:
                continue
            if lead not in unique_rows:
                unique_rows[lead] = row

        # Existing rows keyed by lead_number
        all_leads = list(unique_rows.keys())
        existing = {}
        for i in range(0, len(all_leads), 1000):
            chunk = all_leads[i:i + 1000]
            for rec in self.db.query(LMSInsia).filter(LMSInsia.lead_number.in_(chunk)).all():
                existing[(rec.lead_number or '').strip()] = rec

        # Customer relation: resolve every SR the file mentions to an instance
        # in ONE pass, then preload the customers those instances point at.
        sr_by_lead = {}
        for lead, row in unique_rows.items():
            sr = self.convert_to_string(val(row, 'LEAD SR NUMBER'))
            sr_by_lead[lead] = sr.strip() if sr else None
        sr_to_instance = self._resolve_instance_ids_by_sr(sr_by_lead.values())
        customer_cache = self._bulk_load_by_instance_id(
            Customer, list(sr_to_instance.values()))
        linked_iids = set()

        imported_count = 0
        updated_count = 0

        with self.db.no_autoflush:
            for lead, row in unique_rows.items():
                sr = sr_by_lead.get(lead)
                instance_id = sr_to_instance.get(sr) if sr else None

                # FIRST lead of each instance wins: later leads on the same
                # genset still store their own instance_id, they just do not
                # re-apply this file's values to the customer master.
                if instance_id and instance_id not in linked_iids:
                    linked_iids.add(instance_id)
                    self.update_or_create_customer(
                        instance_id, row, 'LMS Data from Insia', cache=customer_cache)

                data = {
                    'instance_id': instance_id,
                    'lead_created_date': self.parse_date(val(row, 'LEAD CREATED DATE')),
                    'branch_id': self.truncate_string(val(row, 'BRANCH ID'), 100),
                    'account_name': self.truncate_string(val(row, 'ACCOUNT NAME')),
                    'lead_sr_number': self.truncate_string(val(row, 'LEAD SR NUMBER'), 200),
                    'service_engineer_name': self.truncate_string(val(row, 'SERVICE ENGINEER NAME')),
                    'order_creation_date': self.parse_date(val(row, 'ORDER CREATION DATE')),
                    'extra_data': self.collect_extra_data(row, extra_cols),
                }

                rec = existing.get(lead)
                if rec:
                    # Empty-safe update: blank cells keep the old value,
                    # extra_data is merged.
                    self.update_record(rec, data)
                    updated_count += 1
                else:
                    rec = LMSInsia(lead_number=lead, **data)
                    self.db.add(rec)
                    existing[lead] = rec
                    imported_count += 1

        self.db.commit()
        return imported_count, updated_count


    # ==================== All Invoice Detailed Report ====================

    def import_all_invoice_report(self, file):
        """Import 'All Invoice Detailed Report' — every invoice LINE the ERP
        raised — into all_invoice_report.

        INVOICE NUMBER is the record key: ONE row per invoice, upserted on
        re-import (blank cells never wipe existing data, extra_data is merged).
        It is genuinely unique — the real 30,242-row export holds 30,242 distinct
        invoice numbers, with none blank — so nothing collapses on it. When the
        same number does appear twice the FIRST row wins.

        Fixed columns: Invoice Number, Branch Id, Branch Name, Instance Id,
        Account Name, Invoice Date, Invoice Status, Invoice Segment, Invoice
        Type, Invoice Amount. Every other column of the file is dynamic and kept
        as JSON in extra_data.

        CUSTOMER LINK — rows are linked on INSTANCE ID, but only the Service
        lines carry one: in the real export all 14,419 Service rows have an
        Instance Id and all 15,747 OTC + 76 Agreement rows have none (OTC is
        counter sale, there is no genset). A row without one imports UNLINKED
        rather than being dropped, or half the file would never land. Account
        Name is the only customer-master field the file can give, and it is
        contributed once per instance (the first row of that genset in the
        file) — re-reading it for all 14k service rows buys nothing.

        Branch Id also tops up customers.branch_id, the same way the other
        branch-carrying imports do."""
        contents = file.file.read()
        df = read_upload_table(contents)

        # Flexible headers: map the fixed columns to canonical names; rest dynamic
        df, extra_cols = self.canonicalize_dataframe(df, 'All Invoice Detailed Report')

        is_valid, message = self.validate_file_format(df, 'All Invoice Detailed Report')
        if not is_valid:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid file format for All Invoice Detailed Report: {message}"
            )

        # Unique key = INVOICE NUMBER, FIRST occurrence in the file wins.
        unique_rows = {}
        for row in df.to_dict('records'):
            inv = self.convert_to_string(row.get('INVOICE NUMBER'))
            inv = inv.strip() if inv else None
            if not inv:
                continue
            if inv not in unique_rows:
                unique_rows[inv] = row

        # Existing rows keyed by invoice_number (indexed).
        all_invoices = list(unique_rows.keys())
        existing = {}
        for i in range(0, len(all_invoices), 1000):
            chunk = all_invoices[i:i + 1000]
            for rec in self.db.query(AllInvoiceReport).filter(
                    AllInvoiceReport.invoice_number.in_(chunk)).all():
                existing[(rec.invoice_number or '').strip()] = rec

        # Preload the customers the file's Service lines point at, in one pass.
        instance_ids = [self.extract_instance_id(r, 'All Invoice Detailed Report')
                        for r in unique_rows.values()]
        customer_cache = self._bulk_load_by_instance_id(Customer, instance_ids)
        linked_iids = set()

        imported_count = 0
        updated_count = 0

        with self.db.no_autoflush:
            for inv, row in unique_rows.items():
                try:
                    instance_id = self.extract_instance_id(row, 'All Invoice Detailed Report')

                    # Link to the customer master ONCE per genset per file
                    # (creates the customer if no other import has seen it yet).
                    if instance_id and instance_id not in linked_iids:
                        self.update_or_create_customer(
                            instance_id, row, 'All Invoice Detailed Report',
                            cache=customer_cache)
                        linked_iids.add(instance_id)

                    data = {
                        'instance_id': instance_id,
                        'branch_id': self.truncate_string(row.get('BRANCH ID'), 100),
                        'branch_name': self.truncate_string(row.get('BRANCH NAME')),
                        'account_name': self.truncate_string(row.get('ACCOUNT NAME')),
                        'invoice_date': self.parse_date(row.get('INVOICE DATE')),
                        'invoice_status': self.truncate_string(row.get('INVOICE STATUS'), 100),
                        'invoice_segment': self.truncate_string(row.get('INVOICE SEGMENT'), 100),
                        'invoice_type': self.truncate_string(row.get('INVOICE TYPE'), 100),
                        'invoice_amount': self.convert_to_float(row.get('INVOICE AMOUNT')),
                        'extra_data': self.collect_extra_data(row, extra_cols),
                    }

                    rec = existing.get(inv)
                    if rec:
                        # Empty-safe update: blank cells keep the old value,
                        # extra_data is merged.
                        self.update_record(rec, data)
                        updated_count += 1
                    else:
                        rec = AllInvoiceReport(invoice_number=inv, **data)
                        self.db.add(rec)
                        existing[inv] = rec
                        imported_count += 1

                except IntegrityError:
                    self.db.rollback()
                    continue
                except Exception:
                    continue

        self.db.commit()
        return imported_count, updated_count


    def process_file(self, file: UploadFile, file_type: str, column_mapping: dict = None):
        """Process uploaded file based on type"""
        try:
            self.user_column_mapping = column_mapping or {}
            import_functions = {
                'AMC Population Report': self.import_amc_agreement,
                'Asset Detailed Report': self.import_asset_detailed,
                'Asset Details with Last Oil Service': self.import_asset_service,
                'Anubandhan Plus Quotes Report': self.import_anubandhan_plus_quotes,
                'Anubandhan Quotes Report': self.import_anubandhan_quotes,
                'BandhanPlus Quotes Report': self.import_bandhan_plus_quotes,
                'Pulse Quotation - Service Only': self.import_pulse_quotation,
                'Regular Bandhan Customers Report': self.import_regular_bandhan,
                'LMS Data for ERP': self.import_lms_data,
                'Open SR Load Report': self.import_open_sr_load_report,
                'MaxTTR - Oil Change SR Zero Labour Flag': self.import_maxttr_oil_change_sr,
                'Response Time & MaxTTR Details': self.import_response_time_maxttr,
                'CDI Detail Report': self.import_cdi_detail_report,
                'EFSR Report': self.import_efsr_report,
                'AMC Agreement Expiry Planner': self.import_amc_expiry_planner,
                'LMS Data from Insia': self.import_lms_insia,
                'All Invoice Detailed Report': self.import_all_invoice_report
            }

            # Old file-type names still accepted (cached client bundles)
            if file_type == 'Open SR Data':
                file_type = 'MaxTTR - Oil Change SR Zero Labour Flag'
            elif file_type == 'LMS Insia':
                file_type = 'LMS Data from Insia'

            if file_type not in import_functions:
                raise HTTPException(status_code=400, detail=f"Unknown file type: {file_type}")
            
            imported_count, updated_count = import_functions[file_type](file)

            # STANDALONE files: their data lives in its own table only. Skip the
            # cross-table matching and the customers branch backfill entirely so
            # the upload cannot touch the customers table or any other table.
            if file_type in STANDALONE_FILE_TYPES:
                return {
                    "imported": imported_count,
                    "updated": updated_count,
                    "total_processed": imported_count + updated_count,
                    "matched_regular_bandhan": 0,
                    "matched_open_sr": 0,
                    "branch_updated": 0
                }

            # Match pending records
            matched_regular = self.match_pending_regular_bandhan()
            matched_open_sr = self.match_pending_open_sr_records()
            
            # Update missing branch IDs in bulk (was 4 SELECTs per customer; now 4 SELECTs TOTAL)
            customers_missing_branch = self.db.query(Customer).filter(
                Customer.branch_id.is_(None)
            ).all()
            
            branch_updated = 0
            if customers_missing_branch:
                missing_iids = [c.instance_id for c in customers_missing_branch if c.instance_id]
                iid_to_branch = self._build_instance_to_branch_map(missing_iids)
                for customer in customers_missing_branch:
                    bid = iid_to_branch.get(customer.instance_id)
                    if bid:
                        customer.branch_id = bid
                        branch_updated += 1
                
                if branch_updated > 0:
                    self.db.commit()
            
            return {
                "imported": imported_count,
                "updated": updated_count,
                "total_processed": imported_count + updated_count,
                "matched_regular_bandhan": matched_regular,
                "matched_open_sr": matched_open_sr,
                "branch_updated": branch_updated
            }
            
        except HTTPException:
            raise
        except Exception as e:
            self.db.rollback()
            raise HTTPException(status_code=500, detail=f"Error processing file: {str(e)}")
        finally:
            file.file.close()


def backfill_cdi_activity_end(db: Session, chunk: int = 2000) -> int:
    """Fill cdi_detail_report.activity_end_date for rows imported before the
    column existed, from 'ACTIVITY END DATE' in their extra_data JSON.
    Idempotent — a no-op once every row has a date."""
    def _batch():
        return (db.query(CDIDetailReport)
                .filter(CDIDetailReport.activity_end_date.is_(None),
                        CDIDetailReport.extra_data.isnot(None))
                .limit(chunk).all())

    rows, done = _batch(), 0
    while rows:
        moved = 0
        for rec in rows:
            try:
                blob = json.loads(rec.extra_data or "{}")
            except Exception:
                blob = {}
            raw = blob.get("ACTIVITY END DATE")
            if raw in (None, ""):
                continue
            ts = pd.to_datetime(str(raw), errors="coerce")
            if pd.isna(ts):
                # extra_data written before the Excel-serial fix can still hold
                # a bare serial ("46368") that pd.to_datetime reads as NaT.
                serial = excel_serial_to_datetime(raw)
                if serial is None:
                    continue
                rec.activity_end_date = serial
                moved += 1
                continue
            rec.activity_end_date = ts.to_pydatetime()
            moved += 1
        db.commit()
        done += moved
        if not moved or len(rows) < chunk:
            break
        rows = _batch()
    return done


def backfill_cdi_branch_name(db: Session, chunk: int = 2000) -> int:
    """Move 'BRANCH NAME' out of cdi_detail_report.extra_data and into the real
    column, for rows imported before that column existed.

    Also DELETES the key from the JSON once it has been moved. Both matter: the
    Customer page renders every extra_data key as its own column, so a row that
    kept the raw header as well as the field would show the branch twice.

    Idempotent — the scan is driven by rows whose JSON still carries the key, so
    it finds nothing on later startups. (The SQL top-up in
    performance_indexes.py fills the column the moment it is added; this is what
    tidies the JSON up afterwards, and the safety net for any row that top-up
    could not read as JSON.)"""
    def _batch():
        return (db.query(CDIDetailReport)
                .filter(CDIDetailReport.extra_data.like('%BRANCH NAME%'))
                .limit(chunk).all())

    rows, done = _batch(), 0
    while rows:
        moved = 0
        for rec in rows:
            try:
                blob = json.loads(rec.extra_data or "{}")
            except Exception:
                blob = {}
            if "BRANCH NAME" not in blob:
                continue
            raw = blob.pop("BRANCH NAME")
            if not rec.branch_name and raw not in (None, ""):
                rec.branch_name = str(raw).strip()[:150]
            rec.extra_data = json.dumps(blob) if blob else None
            moved += 1
        db.commit()
        done += moved
        if not moved or len(rows) < chunk:
            break
        rows = _batch()
    return done


def backfill_efsr_task_end(db: Session, chunk: int = 2000) -> int:
    """Fill efsr_report.task_end_date for rows imported before the column
    existed, reading 'Task End Date' out of their extra_data JSON.

    Parsed in Python, not SQL: the file writes 'M/D/YYYY, h:mm AM' text, which
    T-SQL's TRY_CONVERT cannot read. Paged by PRIMARY KEY, not by re-running the
    same "IS NULL" query: thousands of EFSR rows carry no Task End Date at all
    and would be re-fetched forever otherwise. Idempotent — a row with a date is
    never looked at again, so later startups are a no-op.
    """
    last_id, done = 0, 0
    while True:
        rows = (db.query(EFSRReport)
                .filter(EFSRReport.task_end_date.is_(None),
                        EFSRReport.extra_data.isnot(None),
                        EFSRReport.id > last_id)
                .order_by(EFSRReport.id)
                .limit(chunk).all())
        if not rows:
            break
        last_id = rows[-1].id
        for rec in rows:
            try:
                blob = json.loads(rec.extra_data or "{}")
            except Exception:
                continue
            raw = (blob.get("Task End Date")
                   or blob.get("Task End Date & Time"))
            if raw in (None, ""):
                continue
            ts = pd.to_datetime(str(raw), errors="coerce")
            if pd.isna(ts):
                # extra_data written before the Excel-serial fix can still hold
                # a bare serial ("46368") that pd.to_datetime reads as NaT.
                serial = excel_serial_to_datetime(raw)
                if serial is None:
                    continue
                rec.task_end_date = serial
                moved += 1
                continue
            rec.task_end_date = ts.to_pydatetime()
            done += 1
        db.commit()
    return done


def backfill_efsr_task_assigned(db: Session, chunk: int = 2000) -> int:
    """Fill efsr_report.task_assigned_date for rows imported before the column
    existed, reading 'Task Assigned Date & Time' out of their extra_data JSON.

    Parsed in Python, not SQL: the file writes the value as 'M/D/YYYY, h:mm AM'
    text, which T-SQL's TRY_CONVERT cannot read. Idempotent — once a row has a
    date it is never looked at again, so this is a no-op on later startups.
    """
    rows = (db.query(EFSRReport)
            .filter(EFSRReport.task_assigned_date.is_(None),
                    EFSRReport.extra_data.isnot(None))
            .limit(chunk).all())
    done = 0
    while rows:
        for rec in rows:
            try:
                blob = json.loads(rec.extra_data or "{}")
            except Exception:
                blob = {}
            raw = (blob.get("Task Assigned Date & Time")
                   or blob.get("Task Assigned Date"))
            if raw in (None, ""):
                continue
            ts = pd.to_datetime(str(raw), errors="coerce")
            if pd.isna(ts):
                # extra_data written before the Excel-serial fix can still hold
                # a bare serial ("46368") that pd.to_datetime reads as NaT.
                serial = excel_serial_to_datetime(raw)
                if serial is None:
                    continue
                rec.task_assigned_date = serial
                moved += 1
                continue
            rec.task_assigned_date = ts.to_pydatetime()
            done += 1
        db.commit()
        if len(rows) < chunk:
            break
        rows = (db.query(EFSRReport)
                .filter(EFSRReport.task_assigned_date.is_(None),
                        EFSRReport.extra_data.isnot(None))
                .limit(chunk).all())
        if not any(r.task_assigned_date is None for r in rows):
            break
    return done
