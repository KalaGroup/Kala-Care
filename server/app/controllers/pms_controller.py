# ============================================================================
# PMS (Performance Management System) — Spare & Labour sales vs monthly targets
# ----------------------------------------------------------------------------
# Two Excel files feed the module (Part Sale + Labour Revenue). Rows accumulate
# in pms_sales_records with hash-based dedupe, so the user can upload daily /
# weekly / monthly / quarterly extracts and re-uploads never double-count.
# The report is a pivot of NET TAXABLE AMOUNT by BRANCH ID / CLAIM INVOICE DATE
# against the AOP Master monthly targets (pms_branch_targets).
# ============================================================================
import calendar
import hashlib
import io
import json
import math
import re
from datetime import date, datetime, timedelta

import pandas as pd
from sqlalchemy import (Date, String, and_ as sa_and, case as sa_case, cast,
                        distinct, func, literal_column, or_ as sa_or, text)
from sqlalchemy.orm import Session

from app.models.pms_model import (
    PmsBranchTarget, PmsHoliday, PmsSrTypeMapping, PmsUploadBatch,
    PmsSalesRecord, PmsMonthSettings, PmsHead, PmsSeUid,
    PmsLeadCategory, PmsLeadRaisedForMap, PmsMaxttrHead, PmsMaxttrSrTypeMap,
    PmsEfsrHead, PmsEfsrSrTypeMap, PmsCdiTarget, PmsAmcTarget,
    PmsAmcCategoryTarget, PmsQuoteCityBranch,
    PmsServiceLoadHead, PmsServiceLoadSrTypeMap, PmsServiceLoadTarget,
    PmsServiceLoadPctTarget, PmsServiceLoadManual, PmsServiceLoadSeCount,
)
from app.models.user_model import User, UserRole, UserBranchAccess
from app.time_utils import now_ist

# Segment-wise breakdown: rows whose SEGMENT column is blank are OTC sales.
SEGMENT_OTC = "OTC"

# ERP branches (same codes as the rest of the ERP) used to auto-prefill a
# month's Target Master; responsible person = the branch's Branch Admin.
ERP_BRANCHES = [
    ("MH", "420435_1", "Ch.Sambhaji Nagar"),
    ("MH", "420435_2", "Ahilyanagar"),
    ("MH", "420435_3", "Beed"),
    ("MH", "420435_4", "Nanded"),
    ("MH", "420435_5", "Babhaleshwar"),
    ("MH", "420435_6", "Latur"),
    ("KA", "420435_8", "Hubli"),
    ("KA", "420435_9", "Belagavi"),
    ("KA", "420435_10", "Hospet"),
    ("KA", "420435_11", "Ballari"),
    ("KA", "420435_12", "Bagalkot"),
    ("KA", "420435_13", "Gulbarga"),
    ("KA", "420435_14", "Bijapur"),
]

# KOEL's OWN corporate cover. It is the one agreement type the dealership does
# not sell, so the AMC & Bandhan Projection sheet keeps it off the branch rows
# and gives it a row of its own under the total.
KOEL_AGREEMENT_TYPE = "KOEL Agreement"

# ---------------- QUOTE CITY -> BRANCH ------------------------------------- #
# The four Bandhan QUOTE files are KOEL's, and their branch column knows KOEL's
# structure rather than this dealership's - so the AMC & Bandhan Projection sheet
# places a paid quote on a branch by the customer's CITY.
#
# Which city belongs to which branch is TYPED by the business, in AOP Master ->
# AMC & Bandhan AOP -> the City Master table (PmsQuoteCityBranch). It is not
# derived here and it is never guessed: an earlier version filled the list in
# from district geography and was wrong in ways nobody could see from the report.
# A city nobody has mapped yet goes to the Unmapped Branch row and is named under
# the table, so it reads as a job to do rather than as a wrong number.


def _quote_city_key(city) -> str:
    """A city's identity: letters and digits only, upper case. So 'Ch. Sambhaji
    Nagar', 'CH SAMBHAJINAGAR' and 'Chhatrapati-Sambhajinagar' cannot become
    three separate territories in the master."""
    return re.sub(r"[^A-Z0-9]+", "", str(city or "").upper())


def _quote_city_map(db: Session) -> dict:
    """{city key -> branch id}, as the business has mapped it."""
    return {c.city_key: c.branch_id
            for c in db.query(PmsQuoteCityBranch).all() if c.branch_id}


# ---------------- SR TYPE -> HEAD DEFAULTS (given by business) -------------- #

DEFAULT_SR_HEADS = {
    "Bandhan Premium": "AMC",
    "KOEL Anubandh": "AMC",
    "KOEL Anubandhan Plus": "AMC",
    "KOEL Bandhan": "AMC",
    "KOEL Bandhan Plus": "AMC",
    "KOEL AMC": "KOEL AMC",
    "OTC Order": "OTC Order",
    "Post Warranty": "Post Warranty",
    "Campaign": "Warranty",
    "CSP": "Warranty",
    "Line Rejection": "Warranty",
    "Paid CSP": "Warranty",
    "Revalidation": "Warranty",
    "Warranty": "Warranty",
    "WG DG CSP": "Warranty",
}

HEAD_CHOICES = ["Warranty", "Post Warranty", "AMC", "KOEL AMC", "OTC Order"]

# ---------------- EMPLOYEE PRODUCTIVITY CONSTANTS --------------------------- #
# DEFAULT 'Lead Raised For' (LMS file) -> product category mapping. This only
# SEEDS the Lead Category Master (AOP Master tab) on first use and backs its
# Reset button — the live mapping the report reads is the DB table.
DEFAULT_LEAD_CATEGORIES = {
    "Allied Oil": "Allied Oil",
    "Battery": "Battery",
    "BD Spares": "Spares",
    "Coolant Change": "Coolant",
    "DF Kit": "Allied Product",
    "Diesel Exhaust Fluid": "DEF",
    "Mobile Lighting Tower": "Whole Goods",
    "New DG": "Whole Goods",
    "New Engine": "Whole Goods",
    "NuLife": "Whole Goods",
    "Oil": "K-Oil",
    "Others/Remarks": "Others",
    "Overhauling": "Others",
    "Paid Services -PM": "Others",
    "RECD": "Allied Product",
    "Service AMC/Bandhan/Anubandhan": "AMC",
}

# Default columns of the 'Product Wise Lead Count' group (seed the master).
LEAD_CATEGORY_CHOICES = ["Allied Oil", "Allied Product", "AMC", "Battery",
                         "Coolant", "DEF", "K-Oil", "Others", "Spares",
                         "Whole Goods"]

# 'Lead Raised For' values with no category in the master land here, so the
# split always adds up to the lead count.
LEAD_UNMAPPED = "Unmapped"

# Branch groups of the report's first column: several branches roll up into one
# collapsible category row. Branches not listed here get a row of their own.
EPR_BRANCH_GROUPS = [
    ["420435_1", "420435_4", "420435_7"],
    ["420435_2", "420435_3", "420435_5", "420435_6"],
    ["420435_8"],
    ["420435_9"],
    ["420435_10", "420435_11", "420435_12"],
    ["420435_13", "420435_14"],
]

# SR types with no head in the SR Type Master land in this bucket so the row
# still adds up to Total SR.
HEAD_UNMAPPED = "Unmapped"

# A branch code that no KALA master knows — the EFSR file carries ANOTHER
# dealer's SD BRANCH CODE on ~1% of its rows (420444_9, 420427_3 ...) — must
# never become a branch row of its own. Those SRs belong to the branch the
# ENGINEER belongs to; only an engineer with no KALA branch anywhere lands in
# this one explicit bucket, so the total still adds up and the gap is visible.
UNMAPPED_BRANCH_ID = "UNMAPPED"
UNMAPPED_BRANCH_NAME = "Unmapped Branch"

# CDI feedback buckets (CDI Detail Report -> 'CDI CATEGORY'). Classified on the
# leading word so the score range in brackets can change without breaking:
# 'Promotor(09-10)', 'Detractor(00 - 06)', anything else is Passive.
CDI_PROMOTOR, CDI_DETRACTOR, CDI_PASSIVE = 0, 1, 2

# The bucket names IN CONSTANT ORDER — index 0/1/2 above. Every CDI payload
# indexes its counts with these, so the order is part of the contract.
CDI_BUCKETS = ["Promotor", "Detractor", "Passive"]


def _cdi_bucket(cat):
    """'CDI CATEGORY' -> bucket. Read from the LEADING WORD so the score range
    in brackets can change ('Promotor(09-10)', 'Detractor(00 - 06)') without
    breaking; anything that is neither is Passive."""
    c = _tight(cat or "")
    if c.startswith("PROMOTOR"):
        return CDI_PROMOTOR
    if c.startswith("DETRACTOR"):
        return CDI_DETRACTOR
    return CDI_PASSIVE

# ---- MAXTTR SR TYPE -> HEAD (Employee Productivity) ------------------------
# The MaxTTR file has its OWN SR Type column, with values the Sales/Labour file
# never carries (Courtesy Visit, Dealer AMC, DG Commissioning). These only SEED
# the 'SR Type Master (MaxTTR)' in the AOP Master and back its Reset button —
# the live mapping the report reads is the DB table.
MAXTTR_HEAD_CHOICES = ["Warranty", "Post Warranty", "AMC", "KOEL AMC",
                       "Courtesy Visit", "Others"]

# ---- EFSR SR TYPE -> HEAD (the 'Allocate SR' split) ------------------------
# The EFSR Report shares most SR Types with MaxTTR but adds a few of its own
# (Commercial, RECD Kit). Seeds the 'SR Type Master (EFSR)' and its Reset.
EFSR_HEAD_CHOICES = ["Warranty", "Post Warranty", "AMC", "KOEL AMC",
                     "Courtesy Visit", "Others"]

DEFAULT_EFSR_SR_HEADS = {
    "Warranty": "Warranty",
    "CSP": "Warranty",
    "Paid CSP": "Warranty",
    "Campaign": "Warranty",
    "Line Rejection": "Warranty",
    "Revalidation": "Warranty",
    "WG DG CSP": "Warranty",
    "Post Warranty": "Post Warranty",
    "KOEL Bandhan": "AMC",
    "KOEL Bandhan Plus": "AMC",
    "KOEL Anubandh": "AMC",
    "KOEL Anubandhan Plus": "AMC",
    "Bandhan Premium": "AMC",
    "Dealer AMC": "AMC",
    "KOEL AMC": "KOEL AMC",
    "Courtesy Visit": "Courtesy Visit",
    "DG Commissioning": "Others",
    "Commercial": "Others",
    "RECD Kit": "Others",
}

DEFAULT_MAXTTR_SR_HEADS = {
    "Warranty": "Warranty",
    "CSP": "Warranty",
    "Paid CSP": "Warranty",
    "Campaign": "Warranty",
    "Line Rejection": "Warranty",
    "Revalidation": "Warranty",
    "WG DG CSP": "Warranty",
    "Post Warranty": "Post Warranty",
    "KOEL Bandhan": "AMC",
    "KOEL Bandhan Plus": "AMC",
    "KOEL Anubandh": "AMC",
    "KOEL Anubandhan Plus": "AMC",
    "Bandhan Premium": "AMC",
    "Dealer AMC": "AMC",
    "KOEL AMC": "KOEL AMC",
    "Courtesy Visit": "Courtesy Visit",
    "DG Commissioning": "Others",
}

# ---- SERVICE LOAD SR TYPE -> HEAD (Annual: Service Load and Response) ------
# A THIRD grouping of the same MaxTTR SR Type column, and deliberately not a
# reuse of DEFAULT_MAXTTR_SR_HEADS: that one folds CSP into Warranty and Dealer
# AMC into AMC because Employee Productivity reports six heads, while the
# Service Load sheet prints CSP and Dealer AMC as rows of their own. Same file,
# two legitimate breakdowns — see PmsServiceLoadHead.
SERVICE_LOAD_HEAD_CHOICES = ["CSP", "Post Warranty", "Warranty", "KOEL AMC",
                             "Dealer AMC", "Courtesy Visit", "Others"]

DEFAULT_SERVICE_LOAD_SR_HEADS = {
    "CSP": "CSP",
    "Paid CSP": "CSP",
    "WG DG CSP": "CSP",
    "Post Warranty": "Post Warranty",
    "Warranty": "Warranty",
    "Extended Warranty": "Warranty",
    "Line Rejection": "Warranty",
    "Campaign": "Warranty",
    "Revalidation": "Warranty",
    "KOEL AMC": "KOEL AMC",
    "KOEL Bandhan": "KOEL AMC",
    "KOEL Bandhan Plus": "KOEL AMC",
    "Bandhan Premium": "KOEL AMC",
    "KOEL Anubandh": "KOEL AMC",
    "KOEL Anubandhan Plus": "KOEL AMC",
    "Dealer AMC": "Dealer AMC",
    "Courtesy Visit": "Courtesy Visit",
    "DG Commissioning": "Others",
    "Commercial": "Others",
    "RECD Kit": "Others",
    "POT": "Others",
    "Job Work": "Others",
}

# The sheet's percentage rows and the AOP figures they are measured against.
SERVICE_LOAD_METRICS = ("productivity", "resp4", "closed24", "closed48",
                        "ftr", "fvr")

# FTR / FVR are the two rows of the sheet nothing in any upload can produce, so
# they are TYPED — an actual percentage per month and per cumulative year, next
# to the AOP target the rest of the sheet is measured against.
SERVICE_LOAD_MANUAL_METRICS = ("ftr", "fvr")

# ---------------- FLEXIBLE HEADER MATCHING ---------------------------------- #
# Same philosophy as the customer Import module: headers are matched on their
# alphanumeric skeleton ("Claim Invoice Date" == "CLAIM  INVOICE DATE."), the
# canonical fields are extracted, and every unrecognised column is preserved
# in extra_data JSON so nothing from the file is lost.

def _tight(name) -> str:
    return re.sub(r"[^A-Z0-9]", "", str(name).upper())


# canonical field -> accepted header skeletons (first match wins)
CANON_HEADERS = {
    "zone_name": ["ZONENAME", "ZONE"],
    "soid": ["SOID", "SDID", "SONO", "SONUMBER", "SOI"],
    "sd_name": ["SDNAME", "SD", "DEALERNAME"],
    "branch_id": ["BRANCHID", "BRANCHCODE", "BRANCH"],
    "branch_name": ["BRANCHNAME"],
    "claim_invoice_no": ["CLAIMINVOICENO", "CLAIMINVOICENUMBER", "INVOICENO", "INVOICENUMBER"],
    "claim_invoice_date": ["CLAIMINVOICEDATE", "INVOICEDATE"],
    "product_segment": ["PRODUCTSEGMENT", "PRODSEGMENT", "PRODUCTSEG"],
    "segment": ["SEGMENT", "SEGMENTNAME", "CUSTOMERSEGMENT"],
    "sr_type": ["SERVICEREPORTTYPE", "CLAIMINVOICESRTYPE", "SRTYPE", "SERVICETYPE",
                "REPORTTYPE", "SERVICEREPORT", "TYPEOFSERVICE", "CLAIMTYPE", "SRREPORTTYPE"],
    "net_taxable_amount": ["NETTAXABLEAMOUNT", "NETTAXABLEAMT", "NETTAXABLEVALUE",
                           "NETAMOUNT", "TAXABLEAMOUNT", "TAXABLEVALUE"],
    # ---- remaining standard file columns — REAL columns, no extra_data ----
    "instance_id": ["INSTANCEID"],                                     # part
    "application_code": ["APPLICATIONCODE", "APPCODE"],                # part
    "engine_serial_no": ["ENGINESERIALNO", "ENGINESERIALNUMBER", "ENGINESRNO"],  # part
    "sr_sub_type": ["CLAIMINVOICESRSUBTYPE", "SRSUBTYPE"],             # both files
    "category": ["CATEGORY"],                                          # part
    "part_category": ["PARTCATEGORY"],                                 # part
    "part_number": ["PARTNUMBER", "PARTNO"],                           # part
    "part_description": ["PARTDESCRIPTION", "PARTDESCTRIPTION"],       # part (file typo)
    "quantity": ["QUANTITY", "QTY"],                                   # part
    "series": ["SERIES"],                                              # labour
    "sr_number": ["SRNUMBER", "SRNO"],                                 # labour
}

# The SR Type column differs per file and feeds the SR Type Master:
# Part Sale (spares) file -> 'CLAIM INVOICE SR TYPE', Labour file -> 'SR TYPE'.
# These take priority over the generic sr_type header fallbacks above.
_SR_TYPE_PRIORITY = {
    "part": ["CLAIMINVOICESRTYPE"],
    "labour": ["SRTYPE"],
}

# The report cannot be built without these three.
CRITICAL_FIELDS = ["branch_id", "claim_invoice_date", "net_taxable_amount"]

FIELD_LABELS = {
    "branch_id": "BRANCH ID",
    "claim_invoice_date": "CLAIM INVOICE DATE",
    "net_taxable_amount": "NET TAXABLE AMOUNT",
}


def _map_headers(df: pd.DataFrame, record_type: str = None):
    """Return ({canonical_field: actual column}, [unmapped columns]).

    record_type ('part' | 'labour') puts that file's known SR Type header
    first — CLAIM INVOICE SR TYPE for spares, SR TYPE for labour — so it
    always wins over the generic fallbacks."""
    cols = [c for c in df.columns if pd.notna(c)]
    by_tight = {}
    for c in cols:
        by_tight.setdefault(_tight(c), c)

    mapping, used = {}, set()
    for field, keys in CANON_HEADERS.items():
        if field == "sr_type" and record_type in _SR_TYPE_PRIORITY:
            pref = _SR_TYPE_PRIORITY[record_type]
            keys = pref + [k for k in keys if k not in pref]
        for k in keys:
            col = by_tight.get(k)
            if col is not None and col not in used:
                mapping[field] = col
                used.add(col)
                break
    # BRANCH alone must not shadow BRANCH NAME if both are generic
    unmapped = [c for c in cols if c not in used]
    return mapping, unmapped


def _norm_branch_id(value) -> str:
    """Branch ids appear as '420435-1', '420435_1', '420435 1' across files —
    normalise to the underscore form used everywhere else in the ERP."""
    s = str(value or "").strip()
    if not s:
        return ""
    if s.endswith(".0"):  # pandas float-read of a numeric id
        s = s[:-2]
    return re.sub(r"[\s\-/]+", "_", s).upper()


def _parse_date(value):
    """DATE ONLY — any time part ('2026-07-01 11:16:21') is dropped.

    Year-first values (yyyy-mm-dd...) must NOT be parsed day-first: with
    dayfirst=True pandas can flip '2026-07-01' into 7 Jan. dayfirst stays on
    only for day-first Indian formats like '01-07-2026'."""
    if value is None or (isinstance(value, float) and math.isnan(value)):
        return None
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    s = str(value).strip()
    year_first = bool(re.match(r"^\d{4}[-/.]", s))
    ts = pd.to_datetime(s, dayfirst=not year_first, errors="coerce")
    return None if pd.isna(ts) else ts.date()


def _parse_amount(value) -> float:
    if value is None:
        return 0.0
    try:
        if isinstance(value, str):
            value = value.replace(",", "").replace("₹", "").strip() or 0
        f = float(value)
        return 0.0 if math.isnan(f) else round(f, 2)
    except (ValueError, TypeError):
        return 0.0


def _clean_str(value, limit=140):
    if value is None or (isinstance(value, float) and math.isnan(value)):
        return None
    s = str(value).strip()
    if s.endswith(".0") and s[:-2].isdigit():
        s = s[:-2]
    return s[:limit] or None


def _read_excel(contents: bytes) -> pd.DataFrame:
    df = pd.read_excel(io.BytesIO(contents))
    df = df.dropna(how="all")
    return df


# ---------------- UPLOAD / VALIDATE ---------------------------------------- #

def validate_file(contents: bytes, filename: str, record_type: str = None):
    """Dry-run: report which canonical columns were found / are missing and a
    small sample, without writing anything. record_type ('part' | 'labour')
    is accepted for parity with import_file; header matching is the same for
    both files."""
    try:
        df = _read_excel(contents)
    except Exception as e:
        return {"success": False, "message": f"Could not read Excel file: {e}"}

    mapping, unmapped = _map_headers(df, record_type)
    missing = [FIELD_LABELS[f] for f in CRITICAL_FIELDS if f not in mapping]
    sample = df.head(5).fillna("").astype(str).to_dict(orient="records")

    # Only three columns are mandatory, so a trimmed export still imports — but
    # the columns that IDENTIFY a row decide how it is stored. A labour file
    # without LABOUR PART NUM is the per-SR summary: it holds the same money as
    # the detailed report but in fewer rows, and it REPLACES any detailed rows
    # already stored for its invoices (that is what stops the two shapes being
    # counted twice). Say so up front rather than let the totals surprise anyone.
    tight_cols = {_tight(c) for c in df.columns if pd.notna(c)}
    warnings = []
    if record_type == "labour":
        if not (tight_cols & {"LABOURPARTNUM", "LABORPARTNUM",
                              "LABOURPARTNUMBER", "LABORPARTNUMBER"}):
            warnings.append(
                "No LABOUR PART NUM column — this is the per-SR summary, not the "
                "detailed report. It imports as ONE row per SR and replaces any "
                "detailed rows already stored for the same invoices. The total "
                "stays correct; the labour-part breakdown is lost.")
        if not (tight_cols & {"SRNUMBER", "SRNO"}):
            warnings.append(
                "No SR NUMBER column — rows of one invoice cannot be told apart, "
                "so only one row per invoice will be kept. Upload the detailed "
                "Labour Revenue report instead.")
    elif record_type == "part" and not (tight_cols & {"PARTNUMBER", "PARTNO"}):
        warnings.append(
            "No PART NUMBER column — the part lines of an invoice cannot be told "
            "apart, so only one line per invoice will be kept.")

    return {
        "success": not missing,
        "message": ("File format OK" if not missing
                    else "Missing critical columns: " + ", ".join(missing)),
        "warnings": warnings,
        "file_name": filename,
        "rows": int(len(df)),
        "columns": int(len(df.columns)),
        "mapped": {f: str(c) for f, c in mapping.items()},
        "unmapped_columns": [str(c) for c in unmapped],
        "missing_critical": missing,
        "sample": sample,
    }


# Fields compared to decide whether a re-uploaded invoice actually changed.
_UPSERT_FIELDS = [
    "zone_name", "soid", "sd_name", "branch_id", "branch_name",
    "claim_invoice_date", "product_segment", "segment", "sr_type",
    "net_taxable_amount",
    "instance_id", "application_code", "engine_serial_no", "sr_sub_type",
    "category", "part_category", "part_number", "part_description",
    "quantity", "series", "sr_number",
    "extra_data",
]


# Line-level discriminator inside one invoice, per file type: the columns that,
# together with CLAIM INVOICE NUMBER, identify ONE row of the file. Each entry
# is a list of column groups; a group contributes the first of its spellings
# that the file actually has.
#
# The Part Sale file has one row per PART LINE (invoice + PART NUMBER).
# The Labour file has one row per LABOUR PART LINE: a single SR is billed as
# several lines — warranty labour charges, the engineer's travel, and so on —
# all sharing one SR NUMBER, so the SR alone is NOT unique. Keying on the SR
# only kept the last line of each SR and silently dropped the rest, which made
# the labour report read well under the file's own total.
_LINE_KEY_HEADERS = {
    "part": [["PARTNUMBER", "PARTNO"]],
    "labour": [["SRNUMBER", "SRNO"],
               ["LABOURPARTNUM", "LABORPARTNUM", "LABOURPARTNUMBER", "LABORPARTNUMBER"]],
}


# ---- Upload progress (polled by the frontend while an import runs) -------- #
# The import runs in a worker thread (run_in_threadpool in the route), so the
# progress GET endpoint stays responsive and can read this dict live.
UPLOAD_PROGRESS = {}


def set_upload_progress(token, pct, stage=""):
    if token:
        UPLOAD_PROGRESS[token] = {"pct": int(min(100, max(0, pct))), "stage": stage}


def get_upload_progress(token):
    info = UPLOAD_PROGRESS.get(token)
    if info and info["pct"] >= 100:
        UPLOAD_PROGRESS.pop(token, None)     # done — free the slot
    return info or {"pct": 0, "stage": "Starting…"}


def import_file(db: Session, contents: bytes, filename: str, record_type: str,
                user_id: str, progress_token: str = None):
    """Parse the file and upsert rows keyed on CLAIM INVOICE NO + line key.

    Identity = invoice number + the line discriminator (PART NUMBER for the
    Part Sale file, SR NUMBER for Labour). A new line is inserted, a
    re-uploaded line with changed values UPDATES the stored row (latest
    upload wins), and an identical re-upload counts as a duplicate and is
    skipped. Rows without an invoice number fall back to a full-content hash.
    """
    if record_type not in ("part", "labour"):
        return {"success": False, "message": "record_type must be 'part' or 'labour'"}

    set_upload_progress(progress_token, 3, "Reading Excel file…")
    try:
        df = _read_excel(contents)
    except Exception as e:
        set_upload_progress(progress_token, 100, "Failed")
        return {"success": False, "message": f"Could not read Excel file: {e}"}

    mapping, unmapped = _map_headers(df, record_type)
    missing = [FIELD_LABELS[f] for f in CRITICAL_FIELDS if f not in mapping]
    if missing:
        set_upload_progress(progress_token, 100, "Failed")
        return {"success": False,
                "message": "Missing critical columns: " + ", ".join(missing)}

    set_upload_progress(progress_token, 8, "Parsing rows…")
    batch = PmsUploadBatch(
        record_type=record_type, file_name=filename[:255], total_rows=int(len(df)),
        uploaded_by=user_id,
    )
    db.add(batch)
    db.flush()

    # Resolve the line-key columns (PART NUMBER / SR NUMBER + LABOUR PART NUM)
    # that this file actually carries.
    tight_cols = {_tight(c): c for c in df.columns if pd.notna(c)}
    line_cols = []
    for group in _LINE_KEY_HEADERS.get(record_type, []):
        col = next((tight_cols[k] for k in group if k in tight_cols), None)
        if col is not None:
            line_cols.append(col)

    inserted = updated = duplicates = skipped = 0
    by_line = {}        # (inv_no, line_key) -> parsed field dict (last in file wins)
    no_invoice = []     # rows without an invoice number -> content-hash dedupe

    total_rows = max(1, len(df))
    for row_i, (_, row) in enumerate(df.iterrows()):
        if progress_token and row_i % 200 == 0:
            set_upload_progress(progress_token, 8 + 42 * row_i / total_rows,
                                f"Parsing rows… {row_i:,} / {total_rows:,}")
        get = lambda f: row[mapping[f]] if f in mapping else None

        inv_date = _parse_date(get("claim_invoice_date"))
        branch_id = _norm_branch_id(get("branch_id"))
        amount = _parse_amount(get("net_taxable_amount"))
        if not branch_id or inv_date is None:
            skipped += 1
            continue

        extra = {}
        for c in unmapped:
            v = row[c]
            if pd.notna(v) and str(v).strip() != "":
                extra[str(c)] = str(v)

        inv_no = _clean_str(get("claim_invoice_no"), 100)
        fields = {
            "zone_name": _clean_str(get("zone_name"), 80),
            "soid": _clean_str(get("soid"), 80),
            "sd_name": _clean_str(get("sd_name"), 150),
            "branch_id": branch_id,
            "branch_name": _clean_str(get("branch_name"), 150),
            "claim_invoice_date": inv_date,
            "product_segment": _clean_str(get("product_segment"), 100),
            "segment": _clean_str(get("segment"), 100),
            "sr_type": _clean_str(get("sr_type"), 120),
            "net_taxable_amount": amount,
            # every remaining standard column stored as a REAL column
            "instance_id": _clean_str(get("instance_id"), 100),
            "application_code": _clean_str(get("application_code"), 100),
            "engine_serial_no": _clean_str(get("engine_serial_no"), 100),
            "sr_sub_type": _clean_str(get("sr_sub_type"), 120),
            "category": _clean_str(get("category"), 100),
            "part_category": _clean_str(get("part_category"), 100),
            "part_number": _clean_str(get("part_number"), 120),
            "part_description": _clean_str(get("part_description"), 255),
            "quantity": _parse_amount(get("quantity")) if "quantity" in mapping else None,
            "series": _clean_str(get("series"), 100),
            "sr_number": _clean_str(get("sr_number"), 100),
            # only truly UNKNOWN extra columns (none in the standard files)
            "extra_data": json.dumps(extra, ensure_ascii=False) if extra else None,
        }

        if inv_no:
            line_key = "|".join((_clean_str(row[c], 120) or "") for c in line_cols)
            if (inv_no, line_key) in by_line:
                duplicates += 1        # repeated inside the same file — last wins
            by_line[(inv_no, line_key)] = fields
        else:
            raw = "|".join([record_type, branch_id, "", inv_date.isoformat(),
                            f"{amount:.2f}", fields["sr_type"] or "", fields["segment"] or ""])
            key = hashlib.sha256(raw.encode("utf-8")).hexdigest()
            no_invoice.append((key, fields))

    # ---- line-keyed upsert: the identity hash is deterministic, so existing
    # rows are found by dedupe_key in chunks ----
    id_of = {k: hashlib.sha256(f"{record_type}|inv|{k[0]}|{k[1]}".encode("utf-8")).hexdigest()
             for k in by_line}
    # A labour export comes in two shapes: the DETAILED report (one row per
    # labour line, so the identity is invoice + SR + LABOUR PART NUM) and the
    # same data SUMMARISED per SR (no part column, identity invoice + SR).
    # They describe the same money, but their identities never match — upload
    # both and every rupee is stored twice. So for the invoices this file
    # carries, whatever is already stored and is NOT one of this file's own rows
    # is removed: the newest file's version of an invoice is the one that
    # stands, in either direction. (Also cleans up rows written before the part
    # number joined the key.)
    if record_type == "labour" and by_line:
        new_ids = set(id_of.values())
        invoices = sorted({k[0] for k in by_line})
        stored = []
        for i in range(0, len(invoices), 500):
            stored += (db.query(PmsSalesRecord.id, PmsSalesRecord.dedupe_key)
                       .filter(PmsSalesRecord.record_type == "labour",
                               PmsSalesRecord.claim_invoice_no.in_(invoices[i:i + 500]))
                       .all())
        stale_ids = [rid for rid, dk in stored if dk not in new_ids]
        for i in range(0, len(stale_ids), 500):
            (db.query(PmsSalesRecord)
             .filter(PmsSalesRecord.id.in_(stale_ids[i:i + 500]))
             .delete(synchronize_session=False))
        if stale_ids:
            db.flush()
            print(f"[pms] labour: replaced {len(stale_ids)} stored row(s) of "
                  f"{len(invoices)} invoice(s) with this file's own rows")
    set_upload_progress(progress_token, 52, "Matching existing records…")
    existing = {}
    id_list = list(id_of.values())
    for i in range(0, len(id_list), 800):
        chunk = id_list[i:i + 800]
        for rec in db.query(PmsSalesRecord).filter(
                PmsSalesRecord.dedupe_key.in_(chunk)).all():
            existing[rec.dedupe_key] = rec

    for up_i, (key_pair, fields) in enumerate(by_line.items()):
        if progress_token and up_i % 200 == 0:
            set_upload_progress(progress_token, 58 + 32 * up_i / max(1, len(by_line)),
                                f"Importing rows… {up_i:,} / {len(by_line):,}")
        identity = id_of[key_pair]
        rec = existing.get(identity)
        if rec is not None:
            if all(getattr(rec, f) == fields[f] for f in _UPSERT_FIELDS):
                duplicates += 1        # identical re-upload
            else:
                for f in _UPSERT_FIELDS:
                    setattr(rec, f, fields[f])
                rec.batch_id = batch.id
                updated += 1           # same invoice line, newer values — latest wins
        else:
            db.add(PmsSalesRecord(record_type=record_type, claim_invoice_no=key_pair[0],
                                  dedupe_key=identity, batch_id=batch.id, **fields))
            inserted += 1

    set_upload_progress(progress_token, 90, "Importing remaining rows…")
    # ---- rows without an invoice number: content-hash dedupe (as before) ----
    seen_keys = set()
    keys = [k for k, _ in no_invoice]
    existing_keys = set()
    for i in range(0, len(keys), 800):
        chunk = keys[i:i + 800]
        rows = db.query(PmsSalesRecord.dedupe_key).filter(
            PmsSalesRecord.dedupe_key.in_(chunk)).all()
        existing_keys.update(k for (k,) in rows)

    for key, fields in no_invoice:
        if key in existing_keys or key in seen_keys:
            duplicates += 1
            continue
        seen_keys.add(key)
        db.add(PmsSalesRecord(record_type=record_type, claim_invoice_no=None,
                              dedupe_key=key, batch_id=batch.id, **fields))
        inserted += 1

    # ---- SR Type Master auto-sync: every SR type seen in an upload is added
    # to the mapping permanently (head defaulted when known). Rows are only
    # ever added here — deleting the uploaded data later never removes them.
    set_upload_progress(progress_token, 93, "Updating SR Type Master…")
    seen_types = {f["sr_type"] for f in by_line.values() if f.get("sr_type")}
    seen_types.update(f["sr_type"] for _, f in no_invoice if f.get("sr_type"))
    new_sr_types = 0
    if seen_types:
        known = {m.sr_type.lower() for m in db.query(PmsSrTypeMapping).all()}
        for sr in sorted(seen_types):
            if sr.lower() not in known:
                db.add(PmsSrTypeMapping(sr_type=sr,
                                        head=DEFAULT_SR_HEADS.get(sr),
                                        created_by=user_id))
                known.add(sr.lower())
                new_sr_types += 1

    batch.inserted_rows = inserted
    batch.updated_rows = updated
    batch.duplicate_rows = duplicates
    batch.skipped_rows = skipped
    set_upload_progress(progress_token, 96, "Saving to database…")
    db.commit()
    set_upload_progress(progress_token, 100, "Done")

    return {
        "success": True,
        "message": (f"{inserted} new, {updated} updated, {duplicates} duplicates skipped"
                    + (f" — {new_sr_types} new SR type(s) added to master" if new_sr_types else "")),
        "sr_types_added": new_sr_types,
        "batch_id": batch.id,
        "total_rows": batch.total_rows,
        "inserted": inserted,
        "updated": updated,
        "duplicates": duplicates,
        "skipped": skipped,
    }


# pms_upload_batches is shared with the Training Report, which files its own
# uploads under record_type 'training'. Both of the calls below are the Sales &
# Labour page's, so they stay on ITS two types — clearing that page's data must
# not delete the training audit trail (its rows point at those batch ids).
_SALES_TYPES = ("part", "labour")


def clear_all_data(db: Session):
    """Wipe every uploaded sales row + upload batch (targets, SR map and
    saved reports are kept). Used to re-import everything from scratch."""
    rows = db.query(PmsSalesRecord).delete(synchronize_session=False)
    batches = (db.query(PmsUploadBatch)
               .filter(PmsUploadBatch.record_type.in_(_SALES_TYPES))
               .delete(synchronize_session=False))
    db.commit()
    return {"success": True, "deleted_rows": rows, "deleted_batches": batches}


def list_batches(db: Session, limit: int = 50):
    rows = (db.query(PmsUploadBatch)
            .filter(PmsUploadBatch.record_type.in_(_SALES_TYPES))
            .order_by(PmsUploadBatch.id.desc()).limit(limit).all())
    return [{
        "id": b.id, "record_type": b.record_type, "file_name": b.file_name,
        "total_rows": b.total_rows, "inserted_rows": b.inserted_rows,
        "updated_rows": b.updated_rows or 0,
        "duplicate_rows": b.duplicate_rows, "skipped_rows": b.skipped_rows,
        "uploaded_by": b.uploaded_by,
        "uploaded_at": b.uploaded_at.isoformat() if b.uploaded_at else None,
    } for b in rows]


# ---------------- report cache ---------------------------------------------
# The report and the FY panels are pure functions of the stored data, and the
# database usually sits across the network — so a repeat view (re-opening a
# panel, switching report type, a second user asking for the same period)
# should not pay for the whole aggregation again.
#
# The key carries a VERSION read from the database itself (one small query),
# not a timestamp: any upload, cancel/restore, target save or SR-type change
# moves it, so every worker process invalidates at the same moment and no
# stale figure can survive a data change.
_REPORT_CACHE = {}
_REPORT_CACHE_MAX = 24

# Big tables are fingerprinted by row count / last id / cancelled count; the
# small masters by CHECKSUM_AGG, which also moves when an EXISTING row is
# edited (remapping an SR type to another head, renaming a head, changing a
# target or a working-day count).
_VERSION_SQL = text("""
    SELECT (SELECT COUNT(*) FROM dbo.pms_sales_records),
           (SELECT ISNULL(MAX(id), 0) FROM dbo.pms_sales_records),
           (SELECT ISNULL(SUM(CAST(is_cancelled AS INT)), 0) FROM dbo.pms_sales_records),
           (SELECT ISNULL(CHECKSUM_AGG(CHECKSUM(branch_id, target_month, region,
                                                spare_target, labour_target)), 0)
              FROM dbo.pms_branch_targets),
           (SELECT ISNULL(CHECKSUM_AGG(CHECKSUM(target_month, working_days,
                                                working_days_mh, working_days_ka)), 0)
              FROM dbo.pms_month_settings),
           (SELECT ISNULL(CHECKSUM_AGG(CHECKSUM(sr_type, head)), 0) FROM dbo.pms_sr_type_map),
           (SELECT ISNULL(CHECKSUM_AGG(CHECKSUM(sr_type, head)), 0) FROM dbo.pms_maxttr_sr_type_map),
           (SELECT ISNULL(CHECKSUM_AGG(CHECKSUM(sr_type, head)), 0) FROM dbo.pms_efsr_sr_type_map),
           (SELECT ISNULL(CHECKSUM_AGG(CHECKSUM(lead_raised_for, category)), 0)
              FROM dbo.pms_lead_raised_for_map),
           (SELECT ISNULL(CHECKSUM_AGG(CHECKSUM(se_name, se_uid)), 0) FROM dbo.pms_se_uid_master),
           (SELECT ISNULL(CHECKSUM_AGG(CHECKSUM(name)), 0) FROM dbo.pms_heads),
           (SELECT ISNULL(CHECKSUM_AGG(CHECKSUM(name)), 0) FROM dbo.pms_maxttr_heads),
           (SELECT ISNULL(CHECKSUM_AGG(CHECKSUM(name)), 0) FROM dbo.pms_efsr_heads),
           (SELECT ISNULL(CHECKSUM_AGG(CHECKSUM(name)), 0) FROM dbo.pms_lead_categories),
           (SELECT ISNULL(CHECKSUM_AGG(CHECKSUM(fy, scope, scope_key, target_pct)), 0)
              FROM dbo.pms_cdi_targets),
           (SELECT ISNULL(CHECKSUM_AGG(CHECKSUM(fy, branch_id, proj_nos, prior_nos)), 0)
              FROM dbo.pms_amc_targets),
           -- Annual Reports: the AMC sheet ships its per-category AOP inside the
           -- cached payload, so editing one in the AOP master has to move the
           -- fingerprint or the sheet would keep serving the old target.
           (SELECT ISNULL(CHECKSUM_AGG(CHECKSUM(fy, row_key, aop_nos)), 0)
              FROM dbo.pms_amc_category_targets),
           (SELECT COUNT(*) FROM dbo.pms_amc_category_targets),
           -- The City Master decides which branch a paid quote lands on, so
           -- mapping a city has to rebuild the AMC & Bandhan Projection sheet.
           (SELECT ISNULL(CHECKSUM_AGG(CHECKSUM(city_key, branch_id)), 0)
              FROM dbo.pms_quote_city_branch),
           (SELECT COUNT(*) FROM dbo.pms_quote_city_branch),
           -- The AMC sheet's Expired and Renewed rows are counted straight out
           -- of the Expiry Planner, which is UPSERTED on instance + agreement
           -- number: a re-upload that only moves end dates changes neither the
           -- row count nor MAX(id), so the last update has to be tracked too.
           (SELECT COUNT(*) FROM dbo.amc_expiry_planner),
           (SELECT ISNULL(MAX(id), 0) FROM dbo.amc_expiry_planner),
           (SELECT ISNULL(CONVERT(VARCHAR(30), MAX(updated_at), 126), '')
              FROM dbo.amc_expiry_planner),
           -- Annual Reports: AMC & Bandhan Projection counts the AMC Population
           -- Report, which is UPSERTED on INSTANCE ID - a re-upload that only
           -- moves gensets onto their renewed agreement changes neither the row
           -- count nor MAX(id), so the last update has to be tracked as well.
           (SELECT COUNT(*) FROM dbo.amc_agreements),
           (SELECT ISNULL(MAX(id), 0) FROM dbo.amc_agreements),
           (SELECT ISNULL(CONVERT(VARCHAR(30), MAX(updated_at), 126), '') FROM dbo.amc_agreements),
           -- The four BANDHAN QUOTE files: the AMC sheet's KOEL Bandhan rows are
           -- counted from these, on PAYMENT UPDATE DATE TIME. They are UPSERTED on
           -- the quote's own id, so a re-upload that only fills a payment date in
           -- on rows that already existed moves neither the count nor MAX(id) -
           -- exactly the trap the amc_agreements line above documents, and it
           -- matters more here, because filling that date in IS the sale.
           (SELECT COUNT(*) FROM dbo.anubandhan_quotes),
           (SELECT ISNULL(CONVERT(VARCHAR(30), MAX(updated_at), 126), '') FROM dbo.anubandhan_quotes),
           (SELECT COUNT(*) FROM dbo.anubandhan_plus_quotes),
           (SELECT ISNULL(CONVERT(VARCHAR(30), MAX(updated_at), 126), '') FROM dbo.anubandhan_plus_quotes),
           (SELECT COUNT(*) FROM dbo.regular_bandhan),
           (SELECT ISNULL(CONVERT(VARCHAR(30), MAX(updated_at), 126), '') FROM dbo.regular_bandhan),
           (SELECT COUNT(*) FROM dbo.bandhan_plus_quotes),
           (SELECT ISNULL(CONVERT(VARCHAR(30), MAX(updated_at), 126), '') FROM dbo.bandhan_plus_quotes),
           (SELECT ISNULL(CHECKSUM_AGG(CHECKSUM(holiday_date, region)), 0) FROM dbo.pms_holidays),
           (SELECT COUNT(*) FROM dbo.pms_holidays),
           (SELECT COUNT(*) FROM dbo.response_time_maxttr),
           (SELECT ISNULL(MAX(id), 0) FROM dbo.response_time_maxttr),
           -- MaxTTR is UPSERTED on SR NUMBER, so a re-upload of the same SRs
           -- changes neither the count nor MAX(id) — exactly the trap the Open SR
           -- line below documents. It matters here because 'Days present on Task
           -- end' reads SR TASK END DATE: a file re-uploaded to fill that column
           -- in on rows that already existed would otherwise keep serving the
           -- cached payload with the column empty.
           (SELECT ISNULL(CONVERT(VARCHAR(30), MAX(updated_at), 126), '') FROM dbo.response_time_maxttr),
           (SELECT COUNT(*) FROM dbo.lms_data),
           (SELECT ISNULL(MAX(id), 0) FROM dbo.lms_data),
           -- LMS is UPSERTED on LEAD NUMBER, and Employee Productivity now reads
           -- its QUOTATION TYPE too (OTC quotes are out of Spare Conv. Amount):
           -- a re-upload that only corrects that column on rows that already
           -- exist moves neither the count nor MAX(id).
           (SELECT ISNULL(CONVERT(VARCHAR(30), MAX(updated_at), 126), '') FROM dbo.lms_data),
           -- 'LMS Data from Insia' carries the ORDER CREATION DATE the two
           -- Conv. Amount columns are dated on. Upserted on LEAD NUMBER, so a
           -- re-upload that only fills that date in on existing leads has to
           -- move the fingerprint as well.
           (SELECT COUNT(*) FROM dbo.lms_insia),
           (SELECT ISNULL(MAX(id), 0) FROM dbo.lms_insia),
           (SELECT ISNULL(CONVERT(VARCHAR(30), MAX(updated_at), 126), '') FROM dbo.lms_insia),
           (SELECT COUNT(*) FROM dbo.efsr_report),
           (SELECT ISNULL(MAX(id), 0) FROM dbo.efsr_report),
           -- EFSR is UPSERTED on (SR NUMBER, SERVICE ENGINEER UID), so a re-upload
           -- that only FILLS IN Task End / Task Assigned Date on rows that already
           -- exist changes neither the count nor MAX(id) — SR Allocation and the
           -- Allocate SR column would keep serving the cached, stale numbers.
           (SELECT ISNULL(CONVERT(VARCHAR(30), MAX(updated_at), 126), '') FROM dbo.efsr_report),
           (SELECT COUNT(*) FROM dbo.cdi_detail_report),
           (SELECT ISNULL(MAX(id), 0) FROM dbo.cdi_detail_report),
           -- Same trap: CDI is upserted on SR NUMBER, so track the last update too.
           (SELECT ISNULL(CONVERT(VARCHAR(30), MAX(updated_at), 126), '') FROM dbo.cdi_detail_report),
           -- Annual Reports: Service Penetration reads the asset master, and
           -- Open SR feeds the SR Allocation grid's branch-wise column
           (SELECT COUNT(*) FROM dbo.asset_detailed),
           (SELECT ISNULL(MAX(id), 0) FROM dbo.asset_detailed),
           (SELECT COUNT(*) FROM dbo.open_sr_load_reports),
           (SELECT ISNULL(MAX(id), 0) FROM dbo.open_sr_load_reports),
           -- was SUM(is_active); that flag is gone (no more soft delete), so the
           -- fingerprint tracks the last upsert instead — an import that only
           -- UPDATES rows changes neither the count nor MAX(id).
           (SELECT ISNULL(CONVERT(VARCHAR(30), MAX(updated_at), 126), '') FROM dbo.open_sr_load_reports),
           -- Training Report: upserted on UID + SKILL + TRAINING DATE +
           -- CATEGORY, so a re-upload that only corrects values on rows that
           -- already exist moves neither the count nor MAX(id).
           (SELECT COUNT(*) FROM dbo.pms_training_records),
           (SELECT ISNULL(MAX(id), 0) FROM dbo.pms_training_records),
           (SELECT ISNULL(CONVERT(VARCHAR(30), MAX(updated_at), 126), '') FROM dbo.pms_training_records),
           -- and the manually typed leavers, which the training payload lays
           -- over the file's CURRENT STATUS: marking one engineer as left
           -- touches no imported row at all, so without this the page would
           -- keep serving them as Active out of the cache.
           (SELECT ISNULL(CHECKSUM_AGG(CHECKSUM(uid_no, status, left_on)), 0)
              FROM dbo.pms_training_status_overrides),
           (SELECT COUNT(*) FROM dbo.pms_training_status_overrides),
           -- the typed FTR / FVR figures of the Service Load sheet
           (SELECT ISNULL(CHECKSUM_AGG(CHECKSUM(metric, period, value)), 0)
              FROM dbo.pms_service_load_manual),
           (SELECT COUNT(*) FROM dbo.pms_service_load_manual),
           -- and its typed SE headcount per branch
           (SELECT ISNULL(CHECKSUM_AGG(CHECKSUM(branch_id, se_count)), 0)
              FROM dbo.pms_service_load_se_count),
           (SELECT COUNT(*) FROM dbo.pms_service_load_se_count),
           -- Annual Reports: Service Load and Response. Its three masters are
           -- CHECKSUM_AGG'd like every other small master, so re-heading one SR
           -- Type or editing one monthly AOP figure rebuilds the sheet at once.
           (SELECT ISNULL(CHECKSUM_AGG(CHECKSUM(name)), 0) FROM dbo.pms_service_load_heads),
           (SELECT ISNULL(CHECKSUM_AGG(CHECKSUM(sr_type, head)), 0) FROM dbo.pms_service_load_sr_type_map),
           (SELECT ISNULL(CHECKSUM_AGG(CHECKSUM(target_month, branch_id, sr_target)), 0)
              FROM dbo.pms_service_load_targets),
           (SELECT COUNT(*) FROM dbo.pms_service_load_targets),
           (SELECT ISNULL(CHECKSUM_AGG(CHECKSUM(fy, metric, scope, scope_key, target_value)), 0)
              FROM dbo.pms_service_load_pct_targets),
           (SELECT COUNT(*) FROM dbo.pms_service_load_pct_targets)
""")


def _data_version(db: Session):
    """A cheap fingerprint of everything the reports read."""
    try:
        return tuple(db.execute(_VERSION_SQL).first() or ())
    except Exception:
        return None          # can't fingerprint -> never serve from cache


def _cached(db: Session, key, build):
    """Return build()'s result, reusing it while the data has not changed."""
    version = _data_version(db)
    if version is None:
        return build()
    ck = (key, version)
    hit = _REPORT_CACHE.get(ck)
    if hit is not None:
        return hit
    value = build()
    if len(_REPORT_CACHE) >= _REPORT_CACHE_MAX:
        _REPORT_CACHE.clear()          # tiny cache: drop it all, rebuild on demand
    _REPORT_CACHE[ck] = value
    return value


def data_summary(db: Session):
    """Row counts + invoice-date range per record type (shown on the page).
    One grouped aggregate instead of six queries — same output, index-only."""
    by_rt = {r[0]: r for r in
             db.query(PmsSalesRecord.record_type,
                      func.count(PmsSalesRecord.id),
                      func.min(PmsSalesRecord.claim_invoice_date),
                      func.max(PmsSalesRecord.claim_invoice_date))
             .group_by(PmsSalesRecord.record_type).all()}
    out = {}
    for rt in ("part", "labour"):
        row = by_rt.get(rt)
        out[rt] = {
            "rows": int(row[1]) if row else 0,
            "from_date": row[2].isoformat() if row and row[2] else None,
            "to_date": row[3].isoformat() if row and row[3] else None,
        }
    return out


def preview_rows(db: Session, record_type: str, limit: int = 200, offset: int = 0,
                 search: str = None, cancelled: str = None):
    """One page of stored rows (newest first) + the total count, so the
    frontend can lazy-load the full dataset with infinite scroll.
    `search` filters on CLAIM INVOICE NO (contains, case-insensitive).
    `cancelled`: None/'all' = every row, 'cancelled' = only cancelled
    invoices, 'active' = only non-cancelled."""
    # Only the columns the preview table shows — a full entity load would also
    # drag every internal column (dedupe_key, batch id, timestamps …) across
    # the wire for each of the 200 rows.
    COLS = (PmsSalesRecord.id, PmsSalesRecord.zone_name, PmsSalesRecord.soid,
            PmsSalesRecord.sd_name, PmsSalesRecord.branch_id, PmsSalesRecord.branch_name,
            PmsSalesRecord.claim_invoice_no, PmsSalesRecord.claim_invoice_date,
            PmsSalesRecord.product_segment, PmsSalesRecord.segment,
            PmsSalesRecord.sr_type, PmsSalesRecord.net_taxable_amount,
            PmsSalesRecord.instance_id, PmsSalesRecord.application_code,
            PmsSalesRecord.engine_serial_no, PmsSalesRecord.sr_sub_type,
            PmsSalesRecord.category, PmsSalesRecord.part_category,
            PmsSalesRecord.part_number, PmsSalesRecord.part_description,
            PmsSalesRecord.quantity, PmsSalesRecord.series, PmsSalesRecord.sr_number,
            PmsSalesRecord.is_cancelled, PmsSalesRecord.cancelled_by,
            PmsSalesRecord.cancelled_at, PmsSalesRecord.extra_data)
    q = (db.query(PmsSalesRecord)
         .filter(PmsSalesRecord.record_type == record_type))
    if search:
        # Escape LIKE wildcards (SQL Server also treats [ as one) so the user's
        # text is matched literally anywhere inside the invoice no.
        safe = (search.strip().replace("\\", "\\\\").replace("%", "\\%")
                .replace("_", "\\_").replace("[", "\\["))
        q = q.filter(PmsSalesRecord.claim_invoice_no.ilike(f"%{safe}%", escape="\\"))
    if cancelled == "cancelled":
        q = q.filter(PmsSalesRecord.is_cancelled == True)   # noqa: E712
    elif cancelled == "active":
        q = q.filter(PmsSalesRecord.is_cancelled == False)  # noqa: E712
    rows = (q.with_entities(*COLS).order_by(PmsSalesRecord.id.desc())
            .offset(offset).limit(limit).all())
    # Page count + the type's cancelled-row count (whole dataset, so the filter
    # chip can show it regardless of the current search/page) in ONE round trip.
    total, cancelled_total = (
        db.query(func.count(),
                 func.sum(sa_case((PmsSalesRecord.is_cancelled == True, 1),  # noqa: E712
                                  else_=0)))
        .filter(PmsSalesRecord.record_type == record_type).first())
    if search or cancelled in ("cancelled", "active"):
        total = q.count()     # the page is filtered — count that filter
    return {
        "total": int(total or 0),
        "cancelled_total": int(cancelled_total or 0),
        "items": [{
            "id": r.id,
            "zone_name": r.zone_name, "soid": r.soid, "sd_name": r.sd_name,
            "branch_id": r.branch_id, "branch_name": r.branch_name,
            "claim_invoice_no": r.claim_invoice_no,
            "claim_invoice_date": r.claim_invoice_date.isoformat() if r.claim_invoice_date else None,
            "product_segment": r.product_segment, "segment": r.segment,
            "sr_type": r.sr_type, "net_taxable_amount": r.net_taxable_amount,
            "instance_id": r.instance_id, "application_code": r.application_code,
            "engine_serial_no": r.engine_serial_no, "sr_sub_type": r.sr_sub_type,
            "category": r.category, "part_category": r.part_category,
            "part_number": r.part_number, "part_description": r.part_description,
            "quantity": r.quantity, "series": r.series, "sr_number": r.sr_number,
            "is_cancelled": bool(r.is_cancelled),
            "cancelled_by": r.cancelled_by,
            "cancelled_at": r.cancelled_at.isoformat() if r.cancelled_at else None,
            # legacy rows only — unknown extra columns (original header -> value)
            "extra": json.loads(r.extra_data) if r.extra_data else {},
        } for r in rows],
    }


def set_row_cancelled(db: Session, record_type: str, row_id: int,
                      cancelled: bool, user_id: str = None):
    """Cancel / restore ONE stored row (not the whole invoice). The filter is
    scoped to the record type, so a Part Sale cancel can never touch Labour
    data and vice versa. The row stays in the database, just flagged — and
    every generated report skips flagged rows."""
    rows = (db.query(PmsSalesRecord)
            .filter(PmsSalesRecord.id == int(row_id),
                    PmsSalesRecord.record_type == record_type)
            .update({PmsSalesRecord.is_cancelled: bool(cancelled),
                     PmsSalesRecord.cancelled_by: (user_id if cancelled else None),
                     PmsSalesRecord.cancelled_at: (now_ist() if cancelled else None)},
                    synchronize_session=False))
    db.commit()
    if not rows:
        return {"success": False, "message": "Row not found"}
    return {"success": True, "rows": rows, "cancelled": bool(cancelled)}


# ---------------- AOP MASTER: BRANCH TARGETS -------------------------------- #

# Working-days master is YEAR-INDEPENDENT: one row per calendar month
# ('ALL-04' = April) applies to EVERY financial year. Year-specific rows
# ('2026-04', from before this change) remain as a fallback.
_ALL_WD_PREFIX = "ALL-"


def _all_wd_map(db: Session):
    """{month number '04'..'12': PmsMonthSettings} of the universal rows."""
    rows = (db.query(PmsMonthSettings)
            .filter(PmsMonthSettings.target_month.like(f"{_ALL_WD_PREFIX}%")).all())
    return {r.target_month[len(_ALL_WD_PREFIX):]: r for r in rows}


def _count_workdays(start: date, end: date, off=None) -> int:
    """Days in [start..end] that are worked: Sundays never count, and neither
    does a date in `off` — the holidays ticked in the AOP Master's working-days
    calendar for the region being measured."""
    n, cur = 0, start
    while cur <= end:
        if cur.weekday() != 6 and (off is None or cur not in off):
            n += 1
        cur += timedelta(days=1)
    return n


def _holiday_sets(db: Session, start: date = None, end: date = None):
    """{'MH': {date, …}, 'KA': {…}} of the ticked holidays. A region with no
    rows simply has an empty set, i.e. Sundays only — exactly the behaviour
    before the calendar existed."""
    q = db.query(PmsHoliday.holiday_date, PmsHoliday.region)
    if start:
        q = q.filter(PmsHoliday.holiday_date >= start)
    if end:
        q = q.filter(PmsHoliday.holiday_date <= end)
    out = {"MH": set(), "KA": set()}
    for d, reg in q.all():
        d = d.date() if hasattr(d, "date") else d
        out.setdefault((reg or "MH").upper(), set()).add(d)
    return out


def _off_of(holidays, region):
    """The holiday set that applies to a branch's region."""
    return holidays.get("KA" if (region or "").upper() == "KA" else "MH", set())


def _month_bounds(month: str):
    y, m = map(int, month.split("-"))
    return date(y, m, 1), date(y, m, calendar.monthrange(y, m)[1])


# The Profile-side lookups below feed EVERY AOP Master / FY screen, and they
# only ever read four small columns — so they select those columns instead of
# whole User / UserBranchAccess entities, and both share one pass over the
# branch-access table.
def _user_branch_rows(db: Session):
    """[(user_id, branch, branch_name)] of every branch-access row."""
    return (db.query(UserBranchAccess.user_id, UserBranchAccess.branch,
                     UserBranchAccess.branch_name).all())


def _branch_user_options(db: Session, access_rows=None):
    """{branch: [{user_id, name, role}]} — everyone who can be made a branch's
    Responsible Person in the AOP Master. A user appears under their PRIMARY
    branch and under every branch granted to them in Profile, so a person
    covering four branches shows up in all four dropdowns."""
    users = (db.query(User.user_id, User.name, User.branch, User.role)
             .filter(User.is_deleted == False,          # noqa: E712
                     User.is_blocked == False)          # noqa: E712
             .all())
    by_uid = {u.user_id: u for u in users}
    out = {}

    def _add(branch, u):
        b = _norm_branch_id(branch)
        if not b or b == "HO":
            return
        lst = out.setdefault(b, [])
        if not any(x["user_id"] == u.user_id for x in lst):
            role = u.role.value if hasattr(u.role, "value") else str(u.role)
            lst.append({"user_id": u.user_id, "name": u.name, "role": role})

    for u in users:
        _add(u.branch, u)
    for uid, branch, _name in (_user_branch_rows(db) if access_rows is None else access_rows):
        u = by_uid.get(uid)
        if u is not None:
            _add(branch, u)
    for lst in out.values():
        lst.sort(key=lambda x: (x["name"] or "").lower())
    return out


def _branch_admins(db: Session, access_rows=None):
    """branch -> Branch Admin name. A branch admin with multi-branch access
    (UserBranchAccess, granted from Profile) is the responsible person for
    EVERY branch they can access, not just their primary one."""
    admins = {}
    branch_admins = (db.query(User.user_id, User.name, User.branch)
                     .filter(User.role == UserRole.BRANCH_ADMIN,
                             User.is_deleted == False)  # noqa: E712
                     .all())
    for u in branch_admins:
        admins.setdefault(_norm_branch_id(u.branch), u.name)
    by_uid = {u.user_id: u.name for u in branch_admins}
    if by_uid:
        rows = _user_branch_rows(db) if access_rows is None else access_rows
        for uid, branch, _name in rows:
            if uid in by_uid:
                admins.setdefault(_norm_branch_id(branch), by_uid[uid])
    return admins


def _profile_branches(db: Session, access_rows=None):
    """Every branch the ERP knows: the static list plus any branch that
    appears on a user account in the Profile page (new branches show up here
    automatically). HO is not a sales branch."""
    branches = {b: {"region": r, "name": n} for r, b, n in ERP_BRANCHES}
    for branch, branch_name in (db.query(User.branch, User.branch_name)
                                .filter(User.is_deleted == False).all()):  # noqa: E712
        b = _norm_branch_id(branch)
        if b and b != "HO" and b not in branches:
            branches[b] = {"region": None, "name": branch_name}
    for _uid, branch, branch_name in (_user_branch_rows(db) if access_rows is None
                                      else access_rows):
        b = _norm_branch_id(branch)
        if b and b != "HO" and b not in branches:
            branches[b] = {"region": None, "name": branch_name}
    return branches


def _branch_sort_key(branch_id):
    """Natural order — 420435_1, _2 … _10, _14 (string sort puts _10 before _8)."""
    m = re.search(r"(\d+)$", branch_id or "")
    return (int(m.group(1)) if m else 10 ** 9, branch_id or "")


# ---- Financial-year view (Apr..Mar) ---------------------------------------
# The Target Master UI edits a whole FY at once: one grid per metric with 12
# month columns + a monthly working-days master. Storage is unchanged — the
# same per-(month, branch) rows in pms_branch_targets / pms_month_settings the
# report already reads.

def _fy_months(fy_start: int):
    """['2025-04' .. '2025-12', '2026-01' .. '2026-03'] for fy_start=2025."""
    return ([f"{fy_start}-{m:02d}" for m in range(4, 13)] +
            [f"{fy_start + 1}-{m:02d}" for m in range(1, 4)])


def get_targets_year_payload(db: Session, fy_start: int):
    """Branch rows for the whole FY (spare/labour per month, in rupees) plus
    the monthly working-days settings. Branch list + responsible person are
    synced from the Profile page on every load, same as the month view; rows
    are materialised in the DB only on save."""
    months = _fy_months(fy_start)
    access_rows = _user_branch_rows(db)      # read once, used by both helpers
    branches = _profile_branches(db, access_rows)
    admins = _branch_admins(db, access_rows)

    def _blank_row(branch_id, region=None, name=None, person=None):
        return {
            "branch_id": branch_id, "region": region, "branch_name": name,
            "responsible_person": person,
            "spare": {m: 0 for m in months},
            "labour": {m: 0 for m in months},
        }

    by_branch = {b: _blank_row(b, info["region"], info["name"], admins.get(b))
                 for b, info in branches.items()}

    targets = (db.query(PmsBranchTarget)
               .filter(PmsBranchTarget.target_month.in_(months))
               .order_by(PmsBranchTarget.target_month).all())
    for t in targets:
        row = by_branch.setdefault(
            t.branch_id,
            _blank_row(t.branch_id, t.region, t.branch_name, t.responsible_person))
        row["spare"][t.target_month] = t.spare_target or 0
        row["labour"][t.target_month] = t.labour_target or 0
        # Region is user-editable — a saved row's region wins over the
        # profile default (latest month wins via the order_by above).
        if t.region:
            row["region"] = t.region
        if t.branch_name and not row["branch_name"]:
            row["branch_name"] = t.branch_name
        # The master wins: a person chosen here is the branch's Responsible
        # Person, whatever Profile's branch-admin default said.
        if t.responsible_person:
            row["responsible_person"] = t.responsible_person

    default_wd = {}
    for m in months:
        m_start, m_end = _month_bounds(m)
        default_wd[m] = _count_workdays(m_start, m_end)
    # This FY's month rows AND the universal 'ALL-MM' master in one round trip.
    settings = (db.query(PmsMonthSettings)
                .filter(sa_or(PmsMonthSettings.target_month.in_(months),
                              PmsMonthSettings.target_month.like(f"{_ALL_WD_PREFIX}%")))
                .all())
    saved = {s.target_month: s for s in settings if not s.target_month.startswith(_ALL_WD_PREFIX)}
    all_wd = {s.target_month[len(_ALL_WD_PREFIX):]: s for s in settings
              if s.target_month.startswith(_ALL_WD_PREFIX)}

    # Region-wise working days (MH / KA), PER FINANCIAL YEAR: this FY's own
    # saved month row wins; the universal ('ALL-MM') master and the legacy
    # single value are the fallback for months never saved for this FY.
    def _wd_pair(m):
        s = saved.get(m) or all_wd.get(m[5:7])
        base = (s.working_days if s and s.working_days else default_wd[m])
        return {
            "mh": (s.working_days_mh if s and s.working_days_mh else base),
            "ka": (s.working_days_ka if s and s.working_days_ka else base),
        }

    return {
        "months": months,
        "items": sorted(by_branch.values(),
                        key=lambda r: _branch_sort_key(r["branch_id"])),
        "working_days": {m: _wd_pair(m) for m in months},
        "default_working_days": default_wd,
        # dropdown choices for the Responsible Person column
        "branch_users": _branch_user_options(db, access_rows),
    }


def list_holidays(db: Session, fy_start: int):
    """Every ticked holiday of the financial year, as
    {'YYYY-MM-DD': ['MH','KA']} — the shape the AOP Master calendar reads."""
    months = _fy_months(fy_start)
    fy_from, _ = _month_bounds(months[0])
    _, fy_to = _month_bounds(months[-1])
    out = {}
    for d, reg, name in (db.query(PmsHoliday.holiday_date, PmsHoliday.region,
                                  PmsHoliday.name)
                         .filter(PmsHoliday.holiday_date >= fy_from,
                                 PmsHoliday.holiday_date <= fy_to).all()):
        d = (d.date() if hasattr(d, "date") else d).isoformat()
        out.setdefault(d, {"regions": [], "name": name})
        out[d]["regions"].append((reg or "MH").upper())
    return {"fy": fy_start, "holidays": out}


def save_holidays(db: Session, fy_start: int, holidays: dict, user_id: str):
    """Replace the FY's holiday calendar with what the master now shows.
    `holidays` is {'YYYY-MM-DD': {'regions': ['MH','KA'], 'name': str}} — a
    date with no regions is simply absent, so unticking removes the row."""
    months = _fy_months(fy_start)
    fy_from, _ = _month_bounds(months[0])
    _, fy_to = _month_bounds(months[-1])

    wanted = {}
    for iso, info in (holidays or {}).items():
        try:
            d = date.fromisoformat(str(iso)[:10])
        except ValueError:
            continue
        if not (fy_from <= d <= fy_to):
            continue                       # never touch another year's calendar
        regs = info.get("regions") if isinstance(info, dict) else info
        name = (info.get("name") if isinstance(info, dict) else None) or None
        for reg in {str(r).upper() for r in (regs or []) if str(r).upper() in ("MH", "KA")}:
            wanted[(d, reg)] = name

    existing = {((r.holiday_date.date() if hasattr(r.holiday_date, "date")
                  else r.holiday_date), (r.region or "MH").upper()): r
                for r in db.query(PmsHoliday)
                .filter(PmsHoliday.holiday_date >= fy_from,
                        PmsHoliday.holiday_date <= fy_to).all()}

    added = removed = 0
    for key, name in wanted.items():
        row = existing.get(key)
        if row is None:
            db.add(PmsHoliday(holiday_date=key[0], region=key[1],
                              name=name, created_by=user_id))
            added += 1
        elif (row.name or None) != name:
            row.name = name
    for key, row in existing.items():
        if key not in wanted:
            db.delete(row)
            removed += 1
    db.commit()
    return {"success": True, "added": added, "removed": removed,
            **list_holidays(db, fy_start)}


def save_targets_year(db: Session, fy_start: int, rows: list, user_id: str,
                      working_days: dict = None):
    """Upsert the FY's target rows (12 months per branch) and the monthly
    working-days settings. Values arrive in rupees."""
    months = _fy_months(fy_start)
    month_set = set(months)

    def _iv(v):
        try:
            return max(1, min(31, int(v)))
        except (ValueError, TypeError):
            return None

    for m, wd in (working_days or {}).items():
        if m not in month_set:
            continue
        # New style: {'mh': n, 'ka': n}. Legacy: a single int for both.
        if isinstance(wd, dict):
            mh, ka = _iv(wd.get("mh")), _iv(wd.get("ka"))
        else:
            mh = ka = _iv(wd)
        if mh is None and ka is None:
            continue
        # Saved PER FINANCIAL YEAR under the real month key ('2026-04') —
        # each FY keeps its own working-days master. Old universal 'ALL-MM'
        # rows stay as a fallback for FYs that were never saved.
        key = m
        setting = (db.query(PmsMonthSettings)
                   .filter(PmsMonthSettings.target_month == key).first())
        if not setting:
            setting = PmsMonthSettings(target_month=key)
            db.add(setting)
        if mh is not None:
            setting.working_days_mh = mh
        if ka is not None:
            setting.working_days_ka = ka
        # legacy mirror (pre-split readers)
        setting.working_days = mh or ka
        setting.updated_by = user_id

    existing = {(t.target_month, t.branch_id): t for t in
                db.query(PmsBranchTarget)
                .filter(PmsBranchTarget.target_month.in_(months)).all()}
    saved = 0
    for r in rows:
        branch_id = _norm_branch_id(r.get("branch_id"))
        if not branch_id:
            continue
        region = (r.get("region") or "").strip().upper()[:10] or None
        branch_name = _clean_str(r.get("branch_name"), 120)
        person = _clean_str(r.get("responsible_person"), 120)
        spare = r.get("spare") or {}
        labour = r.get("labour") or {}
        for m in months:
            row = existing.get((m, branch_id))
            if not row:
                row = PmsBranchTarget(target_month=m, branch_id=branch_id,
                                      created_by=user_id)
                db.add(row)
                existing[(m, branch_id)] = row
            row.region = region
            row.branch_name = branch_name
            row.responsible_person = person
            row.spare_target = _parse_amount(spare.get(m))
            row.labour_target = _parse_amount(labour.get(m))
            row.updated_by = user_id
        saved += 1
    db.commit()
    return {"success": True, "saved": saved,
            **get_targets_year_payload(db, fy_start)}


# ---------------- HEAD MASTER (shared by the four SR Type masters) ---------- #
# ONE list of heads, four mappings. The Sales & Labour, MaxTTR, EFSR and Service
# Load masters each keep their OWN sr_type -> head mapping — the same SR Type is
# legitimately grouped differently by different reports — but the list of heads
# they pick from is common: add or delete a head in any of the four tabs and the
# other three follow.
#
# WHY FOUR TABLES STILL EXIST: each report prints its heads in ITS OWN order (the
# Service Load sheet leads with CSP, Employee Productivity with Warranty), so
# every master keeps its own row order. _sync_head_master() keeps the four tables
# in step name-for-name — a head added anywhere is APPENDED to the other three,
# never reordering what is already there — and delete_head_common() removes a
# name from all four at once.
#
# A head no SR Type in a master maps to is NOT a column / row of that master's
# report — see _report_heads(). That is what keeps the shared list from opening
# an empty 'CSP' column in Employee Productivity or an 'OTC Order' row on the
# Service Load sheet: the MAPPING decides what a report prints, not membership
# of the head list.

SR_HEAD_MASTERS = [
    # key,           label,                               AOP tab,   head model,         mapping model,           defaults,                  sr_type len
    ("sales",        "SR Type Master (Sales and Labour)", "srtypes", PmsHead,            PmsSrTypeMapping,        HEAD_CHOICES,              120),
    ("maxttr",       "SR Type Master (MaxTTR)",           "mxtypes", PmsMaxttrHead,      PmsMaxttrSrTypeMap,      MAXTTR_HEAD_CHOICES,       200),
    ("efsr",         "SR Type Master (EFSR)",             "eftypes", PmsEfsrHead,        PmsEfsrSrTypeMap,        EFSR_HEAD_CHOICES,         200),
    ("service_load", "SR Type Master (Service Load)",     "sltypes", PmsServiceLoadHead, PmsServiceLoadSrTypeMap, SERVICE_LOAD_HEAD_CHOICES, 200),
]

SR_MASTER_BY_KEY = {m[0]: m for m in SR_HEAD_MASTERS}


def _head_key(name) -> str:
    """Heads compare on their squashed upper-case form, so 'KOEL  amc' and
    'KOEL AMC' can never become two heads."""
    return re.sub(r"\s+", " ", str(name or "").strip()).upper()


def _sync_head_master(db: Session):
    """Make the four head tables carry the same set of names.

    Seeds an empty table from its own defaults, then appends to every table any
    name the other three (or their own mappings) already carry. Appending only —
    the order a report prints its heads in is the order of ITS table."""
    present = {}          # master key -> {head keys it already has}
    union = {}            # head key -> display name (first seen wins)
    for key, _label, _tab, HeadModel, MapModel, defaults, _ln in SR_HEAD_MASTERS:
        rows = db.query(HeadModel).order_by(HeadModel.id).all()
        if not rows:
            for h in defaults:
                db.add(HeadModel(name=h, created_by="system"))
            db.commit()
            rows = db.query(HeadModel).order_by(HeadModel.id).all()
        present[key] = {_head_key(r.name) for r in rows}
        for r in rows:
            union.setdefault(_head_key(r.name), r.name)
        # a head already mapped but missing from the list would leave that SR
        # Type showing a value its own dropdown does not offer — pull it in too
        for (h,) in (db.query(MapModel.head)
                     .filter(MapModel.head.isnot(None), MapModel.head != "")
                     .distinct().all()):
            if _head_key(h):
                union.setdefault(_head_key(h), str(h).strip())

    added = 0
    for key, _label, _tab, HeadModel, _M, _d, _ln in SR_HEAD_MASTERS:
        for hk, name in union.items():
            if hk not in present[key]:
                db.add(HeadModel(name=name[:60], created_by="system"))
                added += 1
    if added:
        db.commit()


def list_heads_for(db: Session, master_key: str):
    """The shared head list, in the order THIS master prints them."""
    _sync_head_master(db)
    HeadModel = SR_MASTER_BY_KEY[master_key][3]
    return [{"id": h.id, "name": h.name}
            for h in db.query(HeadModel).order_by(HeadModel.id).all()]


def add_head_common(db: Session, name: str, user_id: str, master_key: str):
    """Add a head to ALL FOUR SR Type masters at once."""
    name = (_clean_str(name, 60) or "").strip()
    if not name:
        return {"success": False, "message": "Head name is required"}
    _sync_head_master(db)
    hk = _head_key(name)
    for _k, _label, _tab, HeadModel, _M, _d, _ln in SR_HEAD_MASTERS:
        for row in db.query(HeadModel).all():
            if _head_key(row.name) == hk:
                return {"success": False,
                        "message": f"Head “{row.name}” already exists"}
    for _k, _label, _tab, HeadModel, _M, _d, _ln in SR_HEAD_MASTERS:
        db.add(HeadModel(name=name, created_by=user_id))
    db.commit()
    return {"success": True, "items": list_heads_for(db, master_key),
            "message": f"Head “{name}” added to all four SR Type masters"}


def delete_head_common(db: Session, head_id: int, master_key: str):
    """Remove a head from ALL FOUR masters — refused while ANY of them still
    maps an SR Type to it, with the message naming where it is still in use."""
    _sync_head_master(db)
    HeadModel = SR_MASTER_BY_KEY[master_key][3]
    row = db.query(HeadModel).filter(HeadModel.id == head_id).first()
    if not row:
        return {"success": False, "message": "Head not found"}
    name, hk = row.name, _head_key(row.name)

    used = []
    for _k, label, _tab, _H, MapModel, _d, _ln in SR_HEAD_MASTERS:
        n = sum(1 for (h,) in db.query(MapModel.head)
                .filter(MapModel.head.isnot(None), MapModel.head != "").all()
                if _head_key(h) == hk)
        if n:
            used.append(f"{label} ({n})")
    if used:
        return {"success": False,
                "message": f"“{name}” is still mapped in "
                           f"{', '.join(used)} — clear those first"}

    for _k, _label, _tab, HeadModel2, _M, _d, _ln in SR_HEAD_MASTERS:
        for r in db.query(HeadModel2).all():
            if _head_key(r.name) == hk:
                db.delete(r)
    db.commit()
    return {"success": True, "items": list_heads_for(db, master_key),
            "message": f"Head “{name}” removed from all four SR Type masters"}


def _report_heads(db: Session, master_key: str):
    """The heads a report prints, in its own master's order: the ones some SR
    Type in THAT master actually maps to.

    The head list is shared by the four masters, so membership alone cannot
    decide a report's columns — a head only Service Load uses would otherwise
    open an empty column in Employee Productivity. A head that IS mapped but has
    no rows in the data still prints (an empty column is the honest answer
    there); one nothing maps to does not."""
    _k, _label, _tab, HeadModel, MapModel, _d, _ln = SR_MASTER_BY_KEY[master_key]
    rows = db.query(HeadModel).order_by(HeadModel.id).all()
    if not rows:                                   # fresh DB — seed, then read
        _sync_head_master(db)
        rows = db.query(HeadModel).order_by(HeadModel.id).all()
    used = {_head_key(h) for (h,) in
            db.query(MapModel.head)
            .filter(MapModel.head.isnot(None), MapModel.head != "").distinct().all()
            if _head_key(h)}
    return [h.name for h in rows if _head_key(h.name) in used]


# ---------------- THE SAME SR TYPE IN MORE THAN ONE MASTER ------------------ #
# 'Bandhan Premium' is in all four masters; 'RECD Kit' only in EFSR. Mapping it
# in one tab and then having to hunt for it in the others is how the four drift
# apart, so a save OFFERS to carry the head across — and only offers: nothing is
# written until the user ticks it, and a master that does not already have that
# SR Type is never listed (this links what exists, it never creates rows).

def _sr_key(s) -> str:
    return re.sub(r"\s+", " ", str(s or "").strip()).upper()


def cross_check_sr_types(db: Session, source: str, items: list):
    """Which OTHER masters carry the SR Types just saved in `source`, and what
    head each one holds today. Read-only — this is the offer, not the write."""
    if source not in SR_MASTER_BY_KEY:
        return {"success": False, "message": "Unknown SR Type master"}

    wanted = {}
    for it in items or []:
        sr = re.sub(r"\s+", " ", str((it or {}).get("sr_type") or "").strip())
        if sr:
            wanted[_sr_key(sr)] = {"sr_type": sr,
                                   "head": (_clean_str((it or {}).get("head"), 60) or "")}
    if not wanted:
        return {"success": True, "matches": []}

    found = {}
    for key, label, tab, _H, MapModel, _d, _ln in SR_HEAD_MASTERS:
        if key == source:
            continue
        for row in db.query(MapModel).all():
            k = _sr_key(row.sr_type)
            if k not in wanted:
                continue
            cur = (row.head or "").strip()
            if _head_key(cur) == _head_key(wanted[k]["head"]):
                continue                      # already agrees — nothing to offer
            found.setdefault(k, []).append({
                "master": key, "label": label, "tab": tab,
                "sr_type": row.sr_type, "current_head": cur,
            })

    matches = [{"sr_type": wanted[k]["sr_type"], "head": wanted[k]["head"],
                "targets": t} for k, t in found.items()]
    matches.sort(key=lambda m: m["sr_type"].upper())
    return {"success": True, "matches": matches}


def apply_cross_sr_types(db: Session, targets: list, user_id: str,
                         allowed_masters=None):
    """Copy a head onto the SAME SR Type in another master. Only rows that
    already exist are touched, and only in masters the caller may edit."""
    applied = 0
    by_master, blocked = {}, set()
    for t in targets or []:
        key = str((t or {}).get("master") or "")
        m = SR_MASTER_BY_KEY.get(key)
        sr = re.sub(r"\s+", " ", str((t or {}).get("sr_type") or "").strip())
        if not m or not sr:
            continue
        if allowed_masters is not None and key not in allowed_masters:
            blocked.add(m[1])
            continue
        MapModel = m[4]
        head = _clean_str((t or {}).get("head"), 60)
        row = next((r for r in db.query(MapModel).all()
                    if _sr_key(r.sr_type) == _sr_key(sr)), None)
        if not row:
            continue                          # gone since the offer was made
        row.head = head
        row.updated_by = user_id
        applied += 1
        by_master[m[1]] = by_master.get(m[1], 0) + 1
    if applied:
        db.commit()
    return {"success": True, "applied": applied, "by_master": by_master,
            "blocked": sorted(blocked)}


# ---------------- SR TYPE MASTER (SALES AND LABOUR) ------------------------- #

def list_heads(db: Session):
    """Head master rows — the list shared by the four SR Type masters."""
    return list_heads_for(db, "sales")


def add_head(db: Session, name: str, user_id: str):
    return add_head_common(db, name, user_id, "sales")


def delete_head(db: Session, head_id: int):
    return delete_head_common(db, head_id, "sales")


def _seed_sr_defaults(db: Session):
    existing = {m.sr_type.lower() for m in db.query(PmsSrTypeMapping).all()}
    added = 0
    for sr, head in DEFAULT_SR_HEADS.items():
        if sr.lower() not in existing:
            db.add(PmsSrTypeMapping(sr_type=sr, head=head, created_by="system"))
            added += 1
    if added:
        db.commit()
    return added


def list_sr_types(db: Session):
    if db.query(PmsSrTypeMapping).count() == 0:
        _seed_sr_defaults(db)
    rows = db.query(PmsSrTypeMapping).order_by(PmsSrTypeMapping.sr_type).all()
    return [{"id": m.id, "sr_type": m.sr_type, "head": m.head} for m in rows]


def save_sr_types(db: Session, items: list, user_id: str):
    for it in items:
        sr = _clean_str(it.get("sr_type"), 120)
        if not sr:
            continue
        row = (db.query(PmsSrTypeMapping)
               .filter(PmsSrTypeMapping.sr_type == sr).first())
        if not row:
            row = PmsSrTypeMapping(sr_type=sr, created_by=user_id)
            db.add(row)
        row.head = _clean_str(it.get("head"), 60)
        row.updated_by = user_id
    db.commit()
    return {"success": True, "items": list_sr_types(db)}


def sync_sr_types(db: Session, user_id: str):
    """Pull distinct SR types present in the uploaded data into the mapping
    (new ones arrive with head defaulted from the known list, else blank)."""
    _seed_sr_defaults(db)
    known = {m.sr_type.lower() for m in db.query(PmsSrTypeMapping).all()}
    distinct = (db.query(PmsSalesRecord.sr_type)
                .filter(PmsSalesRecord.sr_type.isnot(None))
                .distinct().all())
    added = 0
    for (sr,) in distinct:
        sr = (sr or "").strip()
        if sr and sr.lower() not in known:
            db.add(PmsSrTypeMapping(sr_type=sr,
                                    head=DEFAULT_SR_HEADS.get(sr),
                                    created_by=user_id))
            known.add(sr.lower())
            added += 1
    db.commit()
    return {"success": True, "added": added, "items": list_sr_types(db)}


def reset_sr_types(db: Session, user_id: str):
    """Restore every default mapping to its given head (extra custom SR types
    are left untouched)."""
    for sr, head in DEFAULT_SR_HEADS.items():
        row = db.query(PmsSrTypeMapping).filter(PmsSrTypeMapping.sr_type == sr).first()
        if row:
            row.head = head
            row.updated_by = user_id
        else:
            db.add(PmsSrTypeMapping(sr_type=sr, head=head, created_by=user_id))
    db.commit()
    return {"success": True, "items": list_sr_types(db)}


# ---------------- SR TYPE MASTER (MAXTTR) ----------------------------------- #
# Same shape as the Sales/Labour SR Type Master, but over the MaxTTR file's own
# SR Type column — this is what the Employee Productivity report groups by.

def list_maxttr_heads(db: Session):
    """The shared head list, in the order the Employee Productivity report
    prints its SR Type columns."""
    return list_heads_for(db, "maxttr")


def add_maxttr_head(db: Session, name: str, user_id: str):
    return add_head_common(db, name, user_id, "maxttr")


def delete_maxttr_head(db: Session, head_id: int):
    return delete_head_common(db, head_id, "maxttr")


def _seed_maxttr_sr_defaults(db: Session):
    existing = {m.sr_type.lower() for m in db.query(PmsMaxttrSrTypeMap).all()}
    added = 0
    for sr, head in DEFAULT_MAXTTR_SR_HEADS.items():
        if sr.lower() not in existing:
            db.add(PmsMaxttrSrTypeMap(sr_type=sr, head=head, created_by="system"))
            added += 1
    if added:
        db.commit()
    return added


def list_maxttr_sr_types(db: Session):
    if db.query(PmsMaxttrSrTypeMap).count() == 0:
        _seed_maxttr_sr_defaults(db)
    rows = db.query(PmsMaxttrSrTypeMap).order_by(PmsMaxttrSrTypeMap.sr_type).all()
    return [{"id": m.id, "sr_type": m.sr_type, "head": m.head} for m in rows]


def save_maxttr_sr_types(db: Session, items: list, user_id: str):
    for it in items:
        sr = _clean_str(it.get("sr_type"), 200)
        if not sr:
            continue
        row = (db.query(PmsMaxttrSrTypeMap)
               .filter(PmsMaxttrSrTypeMap.sr_type == sr).first())
        if not row:
            row = PmsMaxttrSrTypeMap(sr_type=sr, created_by=user_id)
            db.add(row)
        row.head = _clean_str(it.get("head"), 60)
        row.updated_by = user_id
    db.commit()
    return {"success": True, "items": list_maxttr_sr_types(db)}


def sync_maxttr_sr_types(db: Session, user_id: str):
    """Pull the distinct SR Type values out of the uploaded MaxTTR file."""
    from app.models.customer_model import ResponseTimeMaxTTR
    _seed_maxttr_sr_defaults(db)
    known = {m.sr_type.lower() for m in db.query(PmsMaxttrSrTypeMap).all()}
    defaults = {k.lower(): v for k, v in DEFAULT_MAXTTR_SR_HEADS.items()}
    rows = (db.query(ResponseTimeMaxTTR.sr_type)
            .filter(ResponseTimeMaxTTR.sr_type.isnot(None),
                    ResponseTimeMaxTTR.sr_type != "")
            .distinct().all())
    added = 0
    for (sr,) in rows:
        sr = re.sub(r"\s+", " ", (sr or "").strip())[:200]
        if sr and sr.lower() not in known:
            db.add(PmsMaxttrSrTypeMap(sr_type=sr, head=defaults.get(sr.lower()),
                                      created_by=user_id))
            known.add(sr.lower())
            added += 1
    db.commit()
    return {"success": True, "added": added, "items": list_maxttr_sr_types(db)}


def reset_maxttr_sr_types(db: Session, user_id: str):
    for sr, head in DEFAULT_MAXTTR_SR_HEADS.items():
        row = (db.query(PmsMaxttrSrTypeMap)
               .filter(PmsMaxttrSrTypeMap.sr_type == sr).first())
        if row:
            row.head = head
            row.updated_by = user_id
        else:
            db.add(PmsMaxttrSrTypeMap(sr_type=sr, head=head, created_by=user_id))
    db.commit()
    return {"success": True, "items": list_maxttr_sr_types(db)}


# ---------------- SR TYPE MASTER (EFSR) ------------------------------------- #
# Drives the 'Allocate SR' SR Type split of the Employee Productivity report.

def list_efsr_heads(db: Session):
    """The shared head list, in the order the EFSR / Allocate SR columns print."""
    return list_heads_for(db, "efsr")


def add_efsr_head(db: Session, name: str, user_id: str):
    return add_head_common(db, name, user_id, "efsr")


def delete_efsr_head(db: Session, head_id: int):
    return delete_head_common(db, head_id, "efsr")


def _seed_efsr_sr_defaults(db: Session):
    existing = {m.sr_type.lower() for m in db.query(PmsEfsrSrTypeMap).all()}
    added = 0
    for sr, head in DEFAULT_EFSR_SR_HEADS.items():
        if sr.lower() not in existing:
            db.add(PmsEfsrSrTypeMap(sr_type=sr, head=head, created_by="system"))
            added += 1
    if added:
        db.commit()
    return added


def list_efsr_sr_types(db: Session):
    if db.query(PmsEfsrSrTypeMap).count() == 0:
        _seed_efsr_sr_defaults(db)
    rows = db.query(PmsEfsrSrTypeMap).order_by(PmsEfsrSrTypeMap.sr_type).all()
    return [{"id": m.id, "sr_type": m.sr_type, "head": m.head} for m in rows]


def save_efsr_sr_types(db: Session, items: list, user_id: str):
    for it in items:
        sr = _clean_str(it.get("sr_type"), 200)
        if not sr:
            continue
        row = (db.query(PmsEfsrSrTypeMap)
               .filter(PmsEfsrSrTypeMap.sr_type == sr).first())
        if not row:
            row = PmsEfsrSrTypeMap(sr_type=sr, created_by=user_id)
            db.add(row)
        row.head = _clean_str(it.get("head"), 60)
        row.updated_by = user_id
    db.commit()
    return {"success": True, "items": list_efsr_sr_types(db)}


def sync_efsr_sr_types(db: Session, user_id: str):
    """Pull the distinct SR Type values out of the uploaded EFSR Report."""
    from app.models.customer_model import EFSRReport
    _seed_efsr_sr_defaults(db)
    known = {m.sr_type.lower() for m in db.query(PmsEfsrSrTypeMap).all()}
    defaults = {k.lower(): v for k, v in DEFAULT_EFSR_SR_HEADS.items()}
    rows = (db.query(EFSRReport.sr_type)
            .filter(EFSRReport.sr_type.isnot(None), EFSRReport.sr_type != "")
            .distinct().all())
    added = 0
    for (sr,) in rows:
        sr = re.sub(r"\s+", " ", (sr or "").strip())[:200]
        if sr and sr.lower() not in known:
            db.add(PmsEfsrSrTypeMap(sr_type=sr, head=defaults.get(sr.lower()),
                                    created_by=user_id))
            known.add(sr.lower())
            added += 1
    db.commit()
    return {"success": True, "added": added, "items": list_efsr_sr_types(db)}


def reset_efsr_sr_types(db: Session, user_id: str):
    for sr, head in DEFAULT_EFSR_SR_HEADS.items():
        row = (db.query(PmsEfsrSrTypeMap)
               .filter(PmsEfsrSrTypeMap.sr_type == sr).first())
        if row:
            row.head = head
            row.updated_by = user_id
        else:
            db.add(PmsEfsrSrTypeMap(sr_type=sr, head=head, created_by=user_id))
    db.commit()
    return {"success": True, "items": list_efsr_sr_types(db)}


# ---------------- LEAD CATEGORY MASTER -------------------------------------- #
# Exactly the SR Type Master pattern, for the LMS 'Lead Raised For' column:
# a category master (the report's Product Wise Lead Count columns) plus a
# per-value mapping synced out of the uploaded LMS file.

def list_lead_categories(db: Session):
    """Category master rows (seeded with the business defaults on first use)."""
    if db.query(PmsLeadCategory).count() == 0:
        for c in LEAD_CATEGORY_CHOICES:
            db.add(PmsLeadCategory(name=c, created_by="system"))
        db.commit()
    return [{"id": c.id, "name": c.name}
            for c in db.query(PmsLeadCategory).order_by(PmsLeadCategory.id).all()]


def add_lead_category(db: Session, name: str, user_id: str):
    name = (_clean_str(name, 60) or "").strip()
    if not name:
        return {"success": False, "message": "Category name is required"}
    exists = db.query(PmsLeadCategory).filter(PmsLeadCategory.name.ilike(name)).first()
    if exists:
        return {"success": False, "message": f"Category “{exists.name}” already exists"}
    db.add(PmsLeadCategory(name=name, created_by=user_id))
    db.commit()
    return {"success": True, "items": list_lead_categories(db)}


def delete_lead_category(db: Session, cat_id: int):
    row = db.query(PmsLeadCategory).filter(PmsLeadCategory.id == cat_id).first()
    if not row:
        return {"success": False, "message": "Category not found"}
    used = (db.query(func.count(PmsLeadRaisedForMap.id))
            .filter(PmsLeadRaisedForMap.category == row.name).scalar()) or 0
    if used:
        return {"success": False,
                "message": f"“{row.name}” is mapped to {used} lead type(s) — clear those first"}
    db.delete(row)
    db.commit()
    return {"success": True, "items": list_lead_categories(db)}


def _seed_lead_defaults(db: Session):
    existing = {m.lead_raised_for.lower() for m in db.query(PmsLeadRaisedForMap).all()}
    added = 0
    for raw, cat in DEFAULT_LEAD_CATEGORIES.items():
        if raw.lower() not in existing:
            db.add(PmsLeadRaisedForMap(lead_raised_for=raw, category=cat,
                                       created_by="system"))
            added += 1
    if added:
        db.commit()
    return added


def list_lead_map(db: Session):
    if db.query(PmsLeadRaisedForMap).count() == 0:
        _seed_lead_defaults(db)
    rows = (db.query(PmsLeadRaisedForMap)
            .order_by(PmsLeadRaisedForMap.lead_raised_for).all())
    return [{"id": m.id, "lead_raised_for": m.lead_raised_for,
             "category": m.category} for m in rows]


def save_lead_map(db: Session, items: list, user_id: str):
    for it in items:
        raw = _clean_str(it.get("lead_raised_for"), 200)
        if not raw:
            continue
        row = (db.query(PmsLeadRaisedForMap)
               .filter(PmsLeadRaisedForMap.lead_raised_for == raw).first())
        if not row:
            row = PmsLeadRaisedForMap(lead_raised_for=raw, created_by=user_id)
            db.add(row)
        row.category = _clean_str(it.get("category"), 60)
        row.updated_by = user_id
    db.commit()
    return {"success": True, "items": list_lead_map(db)}


def sync_lead_map(db: Session, user_id: str):
    """Pull the distinct 'Lead Raised For' values out of the uploaded LMS file
    (new ones arrive with the default category if known, else blank)."""
    from app.models.customer_model import LMSData
    _seed_lead_defaults(db)
    known = {m.lead_raised_for.lower() for m in db.query(PmsLeadRaisedForMap).all()}
    defaults = {k.lower(): v for k, v in DEFAULT_LEAD_CATEGORIES.items()}
    rows = (db.query(LMSData.lead_raised_for)
            .filter(LMSData.lead_raised_for.isnot(None),
                    LMSData.lead_raised_for != "")
            .distinct().all())
    added = 0
    for (raw,) in rows:
        raw = re.sub(r"\s+", " ", (raw or "").strip())[:200]
        if raw and raw.lower() not in known:
            db.add(PmsLeadRaisedForMap(lead_raised_for=raw,
                                       category=defaults.get(raw.lower()),
                                       created_by=user_id))
            known.add(raw.lower())
            added += 1
    db.commit()
    return {"success": True, "added": added, "items": list_lead_map(db)}


def reset_lead_map(db: Session, user_id: str):
    """Restore every default mapping to its given category (values synced from
    the file that are not in the defaults are left untouched)."""
    for raw, cat in DEFAULT_LEAD_CATEGORIES.items():
        row = (db.query(PmsLeadRaisedForMap)
               .filter(PmsLeadRaisedForMap.lead_raised_for == raw).first())
        if row:
            row.category = cat
            row.updated_by = user_id
        else:
            db.add(PmsLeadRaisedForMap(lead_raised_for=raw, category=cat,
                                       created_by=user_id))
    db.commit()
    return {"success": True, "items": list_lead_map(db)}


# ---------------- SE UID MASTER --------------------------------------------- #
# Maintained from the Profile page. Bridges the two files the Employee
# Productivity report joins: 'Response Time & MaxTTR Details' knows the
# engineer only by SE NAME, the LMS file only by SERVICE ENGINEER UID.

def _name_key(name) -> str:
    """Squashed upper-case SE name — 'Karan  Ganesh SONARE' and
    'karan ganesh sonare' are the same engineer.

    Trims the ends, collapses every run of whitespace (including the non-break
    spaces Excel exports love) to one, and drops zero-width characters that
    would otherwise survive a plain strip()."""
    s = re.sub(r"[​-‏﻿]", "", str(name or ""))
    return re.sub(r"\s+", " ", s.strip()).upper()[:200]


def _uid_list(value):
    """A master row's UID cell holds one OR MORE UIDs (comma separated).

    Two real cases need it: the same engineer carrying two UIDs in the LMS
    file, and two different engineers sharing a name — either way every UID
    must resolve to the row, or its leads would go unattributed."""
    return [u for u in re.split(r"[,;/|]+|\s+", str(value or "").strip()) if u]


def _uid_owner_map(db: Session, exclude_id=None):
    """{UID (upper) -> the PmsSeUid row that already holds it}.

    A UID must belong to exactly ONE engineer: the report resolves an LMS lead
    by UID, so the same UID on two rows makes the attribution ambiguous (the
    branch would silently break the tie and one engineer would lose the leads).
    """
    owners = {}
    for r in db.query(PmsSeUid).all():
        if exclude_id is not None and r.id == exclude_id:
            continue
        for u in _uid_list(r.se_uid):
            owners.setdefault(u.upper(), r)
    return owners


def _file_se_names(db: Session):
    """Every Service Engineer the uploaded data knows, keyed on the LETTERS-ONLY
    form of the name: {tight key: {name, maxttr, lms, efsr, file_uids}}.

    THREE files are read — 'Response Time & MaxTTR Details' (SE NAME only), LMS
    and the EFSR Report (both carry SERVICE ENGINEER NAME + UID, so the sync
    learns UIDs from either). The letters-only key merges the files' spellings
    ('VijaykumarJadhav' / 'Vijaykumar Jadhav') into ONE engineer, and the
    spelling with the most words wins as the display name.

    Each file's BRANCH is tallied per engineer too (branch_hits), so the sync can
    fill the master's Branch column with the branch the engineer actually works
    in. Only real KALA branches are counted — the EFSR file carries another
    dealer's SD BRANCH CODE on a few rows, and that says nothing about where the
    engineer belongs."""
    from app.models.customer_model import ResponseTimeMaxTTR, LMSData, EFSRReport
    out = {}
    known = {b["branch_id"] for b in se_uid_branches(db)}

    def _put(name, src, uid=None, branch=None, hits=1):
        key = _name_key(name)
        tight = _tight(key)
        if not tight:
            return
        rec = out.setdefault(tight, {"name": key.title(), "maxttr": False,
                                     "lms": False, "efsr": False,
                                     "file_uids": [], "branch_hits": {}})
        rec[src] = True
        b = _norm_branch_id(branch)
        if b in known:
            rec["branch_hits"][b] = rec["branch_hits"].get(b, 0) + int(hits or 0)
        if uid and uid.upper() not in {u.upper() for u in rec["file_uids"]}:
            rec["file_uids"].append(uid)
        clean = (name or "").strip()
        if len(clean.split()) > len(rec["name"].split()):
            rec["name"] = clean          # prefer the properly spaced spelling

    # Grouped in SQL (name + branch + row count) rather than DISTINCT: the count
    # is what decides the branch when a file shows an engineer in more than one,
    # and it is the same single round trip.
    for n, b, c in (db.query(ResponseTimeMaxTTR.se_name, ResponseTimeMaxTTR.branch_id,
                             func.count(ResponseTimeMaxTTR.id))
                    .filter(ResponseTimeMaxTTR.se_name.isnot(None),
                            ResponseTimeMaxTTR.se_name != "")
                    .group_by(ResponseTimeMaxTTR.se_name,
                              ResponseTimeMaxTTR.branch_id).all()):
        _put(n, "maxttr", None, b, c)
    for n, u, b, c in (db.query(LMSData.service_engineer_name,
                                LMSData.service_engineer_uid, LMSData.branch_id,
                                func.count(LMSData.id))
                       .filter(LMSData.service_engineer_name.isnot(None),
                               LMSData.service_engineer_name != "")
                       .group_by(LMSData.service_engineer_name,
                                 LMSData.service_engineer_uid, LMSData.branch_id).all()):
        _put(n, "lms", (u or "").strip() or None, b, c)
    for n, u, b, c in (db.query(EFSRReport.service_engineer_name,
                                EFSRReport.service_engineer_uid,
                                EFSRReport.sd_branch_code, func.count(EFSRReport.id))
                       .filter(EFSRReport.service_engineer_name.isnot(None),
                               EFSRReport.service_engineer_name != "")
                       .group_by(EFSRReport.service_engineer_name,
                                 EFSRReport.service_engineer_uid,
                                 EFSRReport.sd_branch_code).all()):
        _put(n, "efsr", (u or "").strip() or None, b, c)
    return out


def sync_se_uids(db: Session, user_id: str, found=None):
    """Pull every engineer in the uploaded data into the master and add the UIDs
    the LMS and EFSR files carry, plus the BRANCH the files show them working in.

    Nothing is ever rewritten: a UID is only added, and a Branch is only filled
    when the row has none — so hand edits survive every reload. An engineer the
    files place in no KALA branch keeps an empty Branch, which the Profile page
    shows as a dash."""
    found = _file_se_names(db) if found is None else found
    rows = db.query(PmsSeUid).all()
    by_tight = {}
    used_keys = set()
    for r in rows:
        by_tight.setdefault(_tight(r.name_key), r)
        used_keys.add(r.name_key)

    owners = _uid_owner_map(db)          # UID -> engineer that already holds it

    def _free(uids, row):
        """Only the UIDs no OTHER engineer owns."""
        out = []
        for u in uids:
            other = owners.get(u.upper())
            if other is None or (row is not None and other.id == row.id):
                out.append(u)
        return out

    def _file_branch(rec):
        """The branch the files put this engineer in — the KALA branch with the
        most rows across MaxTTR / LMS / EFSR. None when they show no KALA branch
        at all, which is exactly the case the Branch column is there to fix."""
        hits = rec.get("branch_hits") or {}
        return max(hits.items(), key=lambda kv: (kv[1], kv[0]))[0] if hits else None

    added = filled = branched = skipped_uids = 0
    for tight, rec in found.items():
        row = by_tight.get(tight)
        if row is None:
            key = _name_key(rec["name"])
            if not key or key in used_keys:
                continue
            free = _free(rec["file_uids"], None)
            skipped_uids += len(rec["file_uids"]) - len(free)
            fb = _file_branch(rec)
            if fb:
                branched += 1
            row = PmsSeUid(se_name=rec["name"][:200], name_key=key,
                           se_uid=", ".join(free)[:100] or None,
                           branch_id=fb,
                           src_maxttr=rec["maxttr"], src_lms=rec["lms"],
                           src_efsr=rec["efsr"],
                           created_by=user_id, updated_by=user_id)
            db.add(row)
            db.flush()                   # so the row can claim its UIDs below
            by_tight[tight] = row
            used_keys.add(key)
            added += 1
            if free:
                filled += 1
            for u in free:
                owners.setdefault(u.upper(), row)
        else:
            if rec["file_uids"]:
                cur = _uid_list(row.se_uid)
                have = {u.upper() for u in cur}
                free = _free([u for u in rec["file_uids"] if u.upper() not in have], row)
                skipped_uids += (len([u for u in rec["file_uids"]
                                      if u.upper() not in have]) - len(free))
                if free:
                    row.se_uid = ", ".join(cur + free)[:100]
                    row.updated_by = user_id
                    filled += 1
                    for u in free:
                        owners.setdefault(u.upper(), row)
            # Branch: fill an EMPTY one from the files; never overwrite a value
            # already on the row (it may have been set by hand for exactly the
            # engineer the files cannot place).
            if not row.branch_id:
                fb = _file_branch(rec)
                if fb:
                    row.branch_id, row.updated_by = fb, user_id
                    branched += 1
            if (bool(row.src_maxttr) != rec["maxttr"]
                    or bool(row.src_lms) != rec["lms"]
                    or bool(row.src_efsr) != rec["efsr"]):
                row.src_maxttr = rec["maxttr"]
                row.src_lms = rec["lms"]
                row.src_efsr = rec["efsr"]
    db.commit()
    return {"added": added, "filled": filled, "branched": branched,
            "skipped_uids": skipped_uids}


def se_uid_branches(db: Session):
    """The KALA branches an engineer can be pinned to in the SE UID Master —
    the AOP Master's branches plus the static ERP list, id + name, in branch
    order. The reports only ever accept one of these as a branch."""
    names = {b: n for _r, b, n in ERP_BRANCHES}
    for bid, bname in (db.query(PmsBranchTarget.branch_id, PmsBranchTarget.branch_name)
                       .distinct().all()):
        b = _norm_branch_id(bid)
        if b and (bname or "").strip():
            names[b] = bname.strip()
    return [{"branch_id": b, "branch_name": names[b]}
            for b in sorted(names, key=_branch_sort_key)]


def list_se_uids(db: Session, branch_names=None):
    """Master rows straight from the table — no file scanning, so the Profile
    page renders instantly."""
    names = branch_names or {}
    return [{"id": r.id, "se_name": r.se_name, "se_uid": r.se_uid or "",
             "uids": _uid_list(r.se_uid),
             "branch_id": r.branch_id or "",
             "branch_name": names.get(r.branch_id or "", ""),
             "in_maxttr": bool(r.src_maxttr), "in_lms": bool(r.src_lms),
             "in_efsr": bool(r.src_efsr)}
            for r in db.query(PmsSeUid).order_by(PmsSeUid.se_name).all()]


def se_performance_roster(db: Session):
    """The SE Performance report's roster — REAL branches and REAL engineers.

    Branches are the AOP master's plus the static ERP list (the same set the SE
    UID Master pins an engineer to), each carrying its region so the report can
    split MH from KA. Engineers come from the SE UID MASTER itself, because that
    is where the business maintains the roster; a row with no branch pinned is
    skipped, since every row of the report has to sit under a branch.

    Alongside each engineer this also returns what the TRAINING REPORT already
    knows about him — employee ticket number, hire date, and the skills he has
    been through with their dates. That is master data the business has
    uploaded, not a counted figure, so the report shows it as it stands.

    EVERY OTHER FIGURE ON THE PAGE IS GENERATED CLIENT-SIDE FOR NOW. The
    counting rules for the twelve commitments are not agreed yet, so nothing
    here touches an import table; when they are, this is the function that grows
    them and the front end stops generating.
    """
    from app.models.pms_model import PmsTrainingRecord

    regions = {b: r for r, b, _n in ERP_BRANCHES}
    for bid, reg in (db.query(PmsBranchTarget.branch_id, PmsBranchTarget.region)
                     .distinct().all()):
        b = _norm_branch_id(bid)
        if b and (reg or "").strip():
            regions[b] = reg.strip().upper()

    branches = [dict(b, region=regions.get(b["branch_id"], "MH"))
                for b in se_uid_branches(db)]
    known = {b["branch_id"] for b in branches}

    # ---- what the Training Report knows, keyed STRICTLY BY UID ------------
    # NOTE: the EMPLOYEE CODE is deliberately NOT taken from here. The Training
    # Report's EMPLOYEE TICKET NUMBER is that file's own reference and the
    # business does not recognise it as the engineer's employee code, so
    # printing it on a performance report put a number on the page that reads
    # as an id but is not the one anybody uses. The report shows a dash instead.
    # When the SE UID Master gains an employee-code column, read it there and
    # set `code` from it — that is the only change needed.
    # It was also matching on letters-only name, to fill in engineers whose SE
    # UID Master row has no UID yet. That is how one man's employee ticket
    # number lands on another man's report: two engineers share a name, or a
    # name is spelled the same in two files, and the report then shows a real
    # number that belongs to somebody else. A UID is the identity here; where
    # there is none, the report shows a dash and the SE UID Master is the place
    # to fix it.
    hired, trainings = {}, {}

    for r in db.query(PmsTrainingRecord).all():
        uid = (r.uid_no or "").strip()
        if not uid:
            continue
        if r.hire_date and uid not in hired:
            hired[uid] = r.hire_date.isoformat()
        skill = (r.skill or "").strip()
        if not skill:
            continue
        extra = {}
        if r.extra_data:
            try:
                extra = json.loads(r.extra_data) or {}
            except Exception:
                extra = {}
        cat = date = ""
        for k, v in extra.items():
            kk = _tight(k)
            if kk == "category" and not cat:
                cat = str(v or "").strip()
            elif kk == "trainingdate" and not date:
                date = str(v or "").strip()[:10]
        trainings.setdefault(uid, {})
        cur = trainings[uid].get(skill)
        if cur is None:
            trainings[uid][skill] = {"cats": [cat] if cat else [], "date": date}
        else:
            if cat and cat not in cur["cats"]:
                cur["cats"].append(cat)
            if date > (cur["date"] or ""):
                cur["date"] = date

    engineers = []
    for r in db.query(PmsSeUid).order_by(PmsSeUid.se_name).all():
        bid = _norm_branch_id(r.branch_id or "")
        if bid not in known:
            continue
        uids = _uid_list(r.se_uid)
        uid = uids[0] if uids else ""
        name = (r.se_name or "").strip()

        # Nothing here is invented and nothing is guessed. The hire date and the
        # training hang off the engineer's own UID; no UID means no claim, and
        # the report prints a dash. The employee code has no source at all yet
        # (see the note above). `key` is the report's own internal handle,
        # never shown.
        tr = trainings.get(uid, {}) if uid else {}
        engineers.append({
            "key": "row%d" % r.id,
            "id": r.id,
            "uid": uid,
            "name": name,
            "branch_id": bid,
            "code": "",          # see the note above — no source for it yet
            "hired": (hired.get(uid) or "") if uid else "",
            "trainings": sorted(
                ([sk, " · ".join(v["cats"]), v["date"]] for sk, v in tr.items()),
                key=lambda t: t[2], reverse=True),
        })
    return {"success": True, "branches": branches, "engineers": engineers}


def se_uid_payload(db: Session, user_id: str = None, sync: bool = False):
    """What the Profile page's SE UID Master shows.

    Reads the MASTER TABLE by default — the roster is already stored, so no
    file scan is needed. sync=True (the 'Reload from data' button, and the very
    first load while the master is still empty) pulls new engineers out of the
    uploaded files and saves them before listing."""
    empty = db.query(PmsSeUid).count() == 0
    synced = (sync_se_uids(db, user_id) if (sync or empty)
              else {"added": 0, "filled": 0})
    branches = se_uid_branches(db)
    items = list_se_uids(db, {b["branch_id"]: b["branch_name"] for b in branches})
    # Any UID sitting on more than one row (only possible from data saved before
    # this validation existed) is reported so the UI can flag it.
    seen, dup = {}, {}
    for it in items:
        for u in it["uids"]:
            k = u.upper()
            if k in seen:
                dup.setdefault(u, [seen[k]]).append(it["se_name"])
            else:
                seen[k] = it["se_name"]
    return {"success": True, "items": items, "synced": synced,
            "branches": branches,
            "duplicate_uids": [{"uid": u, "names": n} for u, n in dup.items()],
            "stats": {
                "total": len(items),
                "with_uid": sum(1 for i in items if i["se_uid"]),
                "missing": sum(1 for i in items if not i["se_uid"]),
                "with_branch": sum(1 for i in items if i["branch_id"]),
                "in_maxttr": sum(1 for i in items if i["in_maxttr"]),
                "in_lms": sum(1 for i in items if i["in_lms"]),
                "in_efsr": sum(1 for i in items if i["in_efsr"]),
            }}


def save_se_uid(db: Session, row_id, se_name, se_uid, user_id: str, branch_id=None):
    """Insert or update ONE master row. The name is the identity: saving a
    name that already exists updates that row's UID rather than duplicating."""
    name = re.sub(r"\s+", " ", _clean_str(se_name, 200) or "").strip()
    if not name:
        return {"success": False, "message": "SE Name is required"}
    key = _name_key(name)
    uid = ", ".join(_uid_list(se_uid))[:100] or None
    # Only a real KALA branch may be pinned — a free-text code would put the
    # engineer somewhere the reports cannot group.
    branch = _norm_branch_id(branch_id) or None
    if branch and branch not in {b["branch_id"] for b in se_uid_branches(db)}:
        return {"success": False,
                "message": f"“{branch}” is not a KALA branch — pick one from the list"}

    row = db.query(PmsSeUid).filter(PmsSeUid.id == row_id).first() if row_id else None
    # The identity is the letters-only name, so 'Vijaykumar Jadhav' can never be
    # added a second time next to 'VijaykumarJadhav'.
    clash = next((r for r in db.query(PmsSeUid).all()
                  if _tight(r.name_key) == _tight(key)), None)
    if clash and (not row or clash.id != row.id):
        if row:
            return {"success": False,
                    "message": f"“{clash.se_name}” is already in the master"}
        row = clash                      # same name re-added -> update in place

    # One UID, one engineer — reject a UID another row already holds.
    owners = _uid_owner_map(db, exclude_id=row.id if row else None)
    taken = [(u, owners[u.upper()].se_name) for u in _uid_list(se_uid)
             if u.upper() in owners]
    if taken:
        first = taken[0]
        more = f" (and {len(taken) - 1} more)" if len(taken) > 1 else ""
        return {"success": False,
                "message": f"UID {first[0]} is already assigned to “{first[1]}”{more}. "
                           "One UID can belong to only one engineer — remove it "
                           "there first, or correct the UID here."}
    if not row:
        row = PmsSeUid(created_by=user_id)
        db.add(row)
    row.se_name, row.name_key, row.se_uid = name, key, uid
    row.branch_id = branch
    row.updated_by = user_id
    db.commit()
    return se_uid_payload(db, user_id, sync=False)


def delete_se_uid(db: Session, row_id: int):
    row = db.query(PmsSeUid).filter(PmsSeUid.id == row_id).first()
    if not row:
        return {"success": False, "message": "Row not found"}
    db.delete(row)
    db.commit()
    # No re-sync: the row would come straight back from the uploaded data.
    return se_uid_payload(db, None, sync=False)


# Header spellings accepted by the SE UID import (matched on the alphanumeric
# skeleton, so 'SE  Name.' / 'se name' also work).
_SE_NAME_HEADERS = ["SENAME", "SERVICEENGINEERNAME", "ENGINEERNAME",
                    "EMPLOYEENAME", "NAME"]
_SE_UID_HEADERS = ["SEUID", "SERVICEENGINEERUID", "ENGINEERUID", "UID",
                   "EMPLOYEEUID", "SEID"]
# Optional third column — the engineer's branch. Ignored when absent, so an
# older two-column file still imports exactly as before.
_SE_BRANCH_HEADERS = ["BRANCHCODE", "BRANCHID", "BRANCH", "SDBRANCHCODE"]


def import_se_uids(db: Session, contents: bytes, user_id: str):
    """Bulk-load the master from an Excel file (SE Name, SE UID, and optionally
    Branch Code). Existing names are updated in place, new ones inserted."""
    try:
        df = _read_excel(contents)
    except Exception as e:
        return {"success": False, "message": f"Could not read Excel file: {e}"}

    cols = {_tight(c): c for c in df.columns}
    name_col = next((cols[h] for h in _SE_NAME_HEADERS if h in cols), None)
    uid_col = next((cols[h] for h in _SE_UID_HEADERS if h in cols), None)
    branch_col = next((cols[h] for h in _SE_BRANCH_HEADERS if h in cols), None)
    valid_branches = {b["branch_id"] for b in se_uid_branches(db)}
    if not name_col or not uid_col:
        return {"success": False,
                "message": "The file needs an 'SE Name' and an 'SE UID' column"}

    existing = {}
    used_keys = set()
    for r in db.query(PmsSeUid).all():
        existing.setdefault(_tight(r.name_key), r)
        used_keys.add(r.name_key)
    owners = _uid_owner_map(db)          # UID -> engineer that already holds it
    inserted = updated = skipped = 0
    conflicts = []
    for _, r in df.iterrows():
        name = _clean_str(r.get(name_col), 200)
        key = _name_key(name)
        if not key:
            skipped += 1
            continue
        row = existing.get(_tight(key))   # letters-only identity, as everywhere
        # drop any UID that belongs to a DIFFERENT engineer; keep the rest
        keep = []
        for u in _uid_list(_clean_str(r.get(uid_col), 100)):
            other = owners.get(u.upper())
            if other is not None and (row is None or other.id != row.id):
                conflicts.append(f"{name}: UID {u} already belongs to “{other.se_name}”")
            else:
                keep.append(u)
        uid = ", ".join(keep)[:100] or None
        # A branch is only taken when the file names a REAL KALA branch; a blank
        # cell leaves whatever is already on the row untouched.
        branch = _norm_branch_id(_clean_str(r.get(branch_col), 100)) if branch_col else None
        if branch and branch not in valid_branches:
            conflicts.append(f"{name}: “{branch}” is not a KALA branch — branch left unchanged")
            branch = None
        if row:
            if row.se_uid != uid:
                row.se_uid, row.updated_by = uid, user_id
                updated += 1
            if branch and row.branch_id != branch:
                row.branch_id, row.updated_by = branch, user_id
                updated += 1
        elif key not in used_keys:
            row = PmsSeUid(se_name=name, name_key=key, se_uid=uid,
                           branch_id=branch,
                           created_by=user_id, updated_by=user_id)
            db.add(row)
            existing[_tight(key)] = row
            used_keys.add(key)
            inserted += 1
        else:
            skipped += 1
        for u in keep:                   # claim the UIDs this row just took
            owners.setdefault(u.upper(), row)
    db.commit()
    return {"inserted": inserted, "updated": updated, "skipped": skipped,
            "conflicts": conflicts,
            **se_uid_payload(db, user_id, sync=False)}


# ---------------- REPORT GENERATION ---------------------------------------- #

def _region_of(zone_name):
    z = (zone_name or "").strip().upper()
    if z.startswith("MH") or "MAHARASHTRA" in z:
        return "MH"
    if z.startswith("KA") or "KARNATAK" in z:
        return "KA"
    return z or "Other"


def generate_report(db: Session, as_on: date, from_date: date = None,
                    part_as_on: date = None, labour_as_on: date = None):
    """Cached wrapper — see _generate_report for the report itself."""
    return _cached(db, ("report", as_on, from_date, part_as_on, labour_as_on),
                   lambda: _generate_report(db, as_on, from_date, part_as_on, labour_as_on))


def _generate_report(db: Session, as_on: date, from_date: date = None,
                     part_as_on: date = None, labour_as_on: date = None):
    """The full report payload for the period [from_date .. as_on].

    Without from_date the period is month-to-date (classic view). Weekly /
    quarterly / yearly periods just pass a wider window. Targets come from
    the AOP Master rows of every month the period touches:

      Target (period)     -> Σ full monthly targets of the touched months
      Daily Target        -> Target / total days of those months
      Target till <to>    -> Σ monthly target × (days of month inside period / days in month)
      Achi. on <to>       -> Σ NET TAXABLE AMOUNT on the period's last day
      Achi. till <to>     -> Σ amount inside the period
      Invoice Count till  -> distinct CLAIM INVOICE NO in the period
      % Achieved          -> Achi. till / Target × 100

    part_as_on / labour_as_on optionally give EACH record type its own
    period end (used by the default all-data report, where the Part Sale and
    Labour files end on different dates — each side is then measured against
    targets only up to its own last data date). Omitted -> both use as_on.
    """
    to_by = {"part": part_as_on or as_on, "labour": labour_as_on or as_on}
    to_date = max(to_by.values())
    if from_date is None:
        from_date = to_date.replace(day=1)
    if from_date > to_date:
        from_date, to_date = to_date, from_date
    for rt in to_by:                       # keep each end inside the period
        to_by[rt] = min(max(to_by[rt], from_date), to_date)

    # Months each type's window overlaps. Targets spread over WORKING days —
    # never Sundays, and never a date ticked in the AOP Master's holiday
    # calendar. MH and KA keep their own calendars, so a region's branches are
    # measured on their own working days, and a PART month (01–17 Aug, say)
    # counts the days that were actually worked inside it instead of a
    # proportion of the month.
    holidays = _holiday_sets(db, from_date.replace(day=1), to_date)

    def _months_till(to_d):
        info = {}
        cur = from_date.replace(day=1)
        while cur <= to_d:
            dim = calendar.monthrange(cur.year, cur.month)[1]
            m_end = cur.replace(day=dim)
            ov_start, ov_end = max(cur, from_date), min(m_end, to_d)
            info[cur.strftime("%Y-%m")] = {
                # elapsed inside the period, and the whole month, per region
                "ov_mh": _count_workdays(ov_start, ov_end, holidays["MH"]),
                "ov_ka": _count_workdays(ov_start, ov_end, holidays["KA"]),
                "wd_mh": _count_workdays(cur, m_end, holidays["MH"]),
                "wd_ka": _count_workdays(cur, m_end, holidays["KA"]),
                # Does THIS month have dates ticked for that region? A holiday
                # in April must not make August ignore its own typed count.
                "cal_mh": any(cur <= d <= m_end for d in holidays["MH"]),
                "cal_ka": any(cur <= d <= m_end for d in holidays["KA"]),
            }
            cur = m_end + timedelta(days=1)
        return info

    month_by_rt = {rt: _months_till(d) for rt, d in to_by.items()}
    all_months = sorted(set(month_by_rt["part"]) | set(month_by_rt["labour"]))

    # The typed-in count still applies where the calendar has NOTHING ticked
    # for that region: the month's own saved row ('2026-04') first, then the
    # universal 'ALL-MM' master. With holidays ticked, the calendar wins —
    # it knows which days, not just how many.
    year_rows = {s.target_month: s for s in
                 db.query(PmsMonthSettings)
                 .filter(PmsMonthSettings.target_month.in_(all_months)).all()}
    all_wd = _all_wd_map(db)
    for month in all_months:
        s = year_rows.get(month) or all_wd.get(month[5:7])
        if s is None:
            continue
        typed = {"mh": s.working_days_mh or s.working_days,
                 "ka": s.working_days_ka or s.working_days}
        for m in month_by_rt.values():
            if month not in m:
                continue
            for reg in ("mh", "ka"):
                if typed[reg] and not m[month][f"cal_{reg}"]:
                    wd = max(1, typed[reg])
                    # keep the elapsed share inside the typed count
                    m[month][f"ov_{reg}"] = min(m[month][f"ov_{reg}"], wd)
                    m[month][f"wd_{reg}"] = wd

    def _wd_of(info, region):
        return info["wd_ka"] if (region or "").upper() == "KA" else info["wd_mh"]

    def _ov_of(info, region):
        return info["ov_ka"] if (region or "").upper() == "KA" else info["ov_mh"]

    # Period working days per record type AND region (drives Daily Target)
    total_days_reg = {rt: {
        "MH": max(1, sum(i["wd_mh"] for i in m.values())),
        "KA": max(1, sum(i["wd_ka"] for i in m.values())),
    } for rt, m in month_by_rt.items()}
    total_days_rt = {rt: max(v.values()) for rt, v in total_days_reg.items()}

    target_rows = db.query(PmsBranchTarget).filter(
        PmsBranchTarget.target_month.in_(all_months)).all()

    # Per-branch target sums (full + prorated-till) and display info from the
    # latest touched month's target row. Each record type only counts the
    # months inside ITS window.
    full_target, till_target, info_by_branch = {}, {}, {}
    for t in target_rows:
        f = full_target.setdefault(t.branch_id, {"part": 0.0, "labour": 0.0})
        p = till_target.setdefault(t.branch_id, {"part": 0.0, "labour": 0.0})
        for rt in ("part", "labour"):
            info = month_by_rt[rt].get(t.target_month)
            if info is None:
                continue                   # month beyond this type's as-on
            wd = _wd_of(info, t.region)    # region-wise working days
            ratio = min(_ov_of(info, t.region), wd) / wd if wd else 0
            val = (t.spare_target if rt == "part" else t.labour_target) or 0
            f[rt] += val
            p[rt] += val * ratio
        prev = info_by_branch.get(t.branch_id)
        if prev is None or t.target_month > prev.target_month:
            info_by_branch[t.branch_id] = t

    # Built-in defaults first, then DB rows on top — so the report groups
    # correctly even before the SR Type Master has ever been opened/saved.
    sr_head = {k.lower(): v for k, v in DEFAULT_SR_HEADS.items()}
    sr_head.update({m.sr_type.lower(): (m.head or "Unmapped")
                    for m in db.query(PmsSrTypeMapping).all()})

    # ---- aggregation ------------------------------------------------------
    # Everything below is summed IN SQL and only the grouped rows travel back
    # (a few dozen), instead of pulling every sales row into Python. The
    # buckets are the same ones the old row loop built, and the invoice counts
    # still count DISTINCT invoices: an invoice never spans two branches, SR
    # types or segments, so a bucket's count is the sum of its groups' counts.
    def _blank():
        return {"achieved_on": 0.0, "achieved_till": 0.0, "invoices": 0}

    branch_agg = {"part": {}, "labour": {}}
    region_agg = {}          # region -> {part, labour, invoices}
    segment_agg = {}         # segment -> {part, labour, invoices}
    head_agg = {}            # head -> {part, labour, invoices}
    category_agg = {}        # CATEGORY (Part Sale file only) -> {part, invoices, qty, lines}
    branch_info = {}         # branch_id -> {branch_name, region} discovered from data

    AMT = func.sum(func.coalesce(PmsSalesRecord.net_taxable_amount, 0.0))
    # Invoice identity — same rule as before: the invoice no, or the row id
    # when the file left it blank.
    INV = func.coalesce(func.nullif(PmsSalesRecord.claim_invoice_no, ""),
                        "row-" + cast(PmsSalesRecord.id, String(20)))
    # Segment bucket: SEGMENT, else PRODUCT SEGMENT, else OTC. The constants are
    # literal_column, not bound parameters — SQL Server cannot GROUP BY an
    # expression that carries parameters.
    _EMPTY, _OTC = literal_column("''"), literal_column(f"'{SEGMENT_OTC}'")
    SEG = func.coalesce(func.nullif(func.ltrim(func.rtrim(PmsSalesRecord.segment)), _EMPTY),
                        func.nullif(func.ltrim(func.rtrim(PmsSalesRecord.product_segment)), _EMPTY),
                        _OTC)

    # Both record types in ONE pass: each carries its own as-on end date, so the
    # window is an OR of the two. Fewer round trips matters more than anything
    # else here — the database usually sits on the other side of the network.
    window = sa_or(*[sa_and(PmsSalesRecord.record_type == rt,
                            PmsSalesRecord.claim_invoice_date <= to_by.get(rt, to_date))
                     for rt in ("part", "labour")])

    def _scoped(rt=None):
        q = (db.query(PmsSalesRecord)
             .filter(PmsSalesRecord.claim_invoice_date >= from_date,
                     # cancelled invoices stay stored but never count
                     PmsSalesRecord.is_cancelled == False))          # noqa: E712
        return q.filter(PmsSalesRecord.record_type == rt,
                        PmsSalesRecord.claim_invoice_date <= to_by.get(rt, to_date)) \
            if rt else q.filter(window)

    # -- branch: total till date, the as-on day's own sale, invoice count --
    on_amt = func.sum(sa_case(
        *[(sa_and(PmsSalesRecord.record_type == rt,
                  PmsSalesRecord.claim_invoice_date == to_by.get(rt, to_date)),
           func.coalesce(PmsSalesRecord.net_taxable_amount, 0.0))
          for rt in ("part", "labour")], else_=0.0))
    for rt, b_id, zone, b_name, till, on_v, inv_n in (
            _scoped()
            .with_entities(PmsSalesRecord.record_type, PmsSalesRecord.branch_id,
                           PmsSalesRecord.zone_name,
                           func.max(PmsSalesRecord.branch_name), AMT, on_amt,
                           func.count(distinct(INV)))
            .group_by(PmsSalesRecord.record_type, PmsSalesRecord.branch_id,
                      PmsSalesRecord.zone_name).all()):
        b = b_id or "UNKNOWN"
        t = info_by_branch.get(b)
        region = (t.region if t and t.region else _region_of(zone))

        info = branch_info.setdefault(b, {"branch_name": None, "region": region})
        if b_name and not info["branch_name"]:
            info["branch_name"] = b_name

        agg = branch_agg[rt].setdefault(b, _blank())
        agg["achieved_till"] += float(till or 0)
        agg["achieved_on"] += float(on_v or 0)
        agg["invoices"] += int(inv_n or 0)

        reg = region_agg.setdefault(region, {"part": 0.0, "labour": 0.0, "invoices": 0})
        reg[rt] += float(till or 0)
        reg["invoices"] += int(inv_n or 0)

    # -- segment (blank SEGMENT = OTC business) --
    for rt, seg_key, amt, inv_n in (
            _scoped()
            .with_entities(PmsSalesRecord.record_type, SEG, AMT, func.count(distinct(INV)))
            .group_by(PmsSalesRecord.record_type, SEG).all()):
        key = (seg_key or SEGMENT_OTC).strip() or SEGMENT_OTC
        seg = segment_agg.setdefault(key, {"part": 0.0, "labour": 0.0, "invoices": 0})
        seg[rt] += float(amt or 0)
        seg["invoices"] += int(inv_n or 0)

    # -- SR type -> Head (mapping lives in the SR Type Master) --
    for rt, sr_type, amt, inv_n in (
            _scoped()
            .with_entities(PmsSalesRecord.record_type, PmsSalesRecord.sr_type, AMT,
                           func.count(distinct(INV)))
            .group_by(PmsSalesRecord.record_type, PmsSalesRecord.sr_type).all()):
        head_key = sr_head.get((sr_type or "").strip().lower(),
                               "Unmapped" if sr_type else "Unspecified")
        hd = head_agg.setdefault(head_key, {"part": 0.0, "labour": 0.0, "invoices": 0})
        hd[rt] += float(amt or 0)
        hd["invoices"] += int(inv_n or 0)

    # -- CATEGORY / QUANTITY come only in the Part Sale file — real columns.
    #    Spare-only breakdown; blanks grouped like Excel's "(Blanks)".
    for cat, amt, qty, lines, inv_n in (
            _scoped("part")
            .with_entities(PmsSalesRecord.category, AMT,
                           func.sum(func.coalesce(PmsSalesRecord.quantity, 0.0)),
                           func.count(), func.count(distinct(INV)))
            .group_by(PmsSalesRecord.category).all()):
        c = category_agg.setdefault((cat or "").strip() or "(Blanks)",
                                    {"part": 0.0, "invoices": 0, "qty": 0.0, "lines": 0})
        c["part"] += float(amt or 0)
        c["qty"] += float(qty or 0)
        c["lines"] += int(lines or 0)   # one stored row = one part line of an invoice
        c["invoices"] += int(inv_n or 0)

    # ---- branch tables (one per record type, same shape as the mockup) ----
    def _branch_rows(rt):
        rows = []
        branch_ids = set(full_target) | set(branch_agg[rt])
        for b in sorted(branch_ids, key=_branch_sort_key):
            t = info_by_branch.get(b)
            agg = branch_agg[rt].get(b) or _blank()
            info = branch_info.get(b, {})
            region = (t.region if t and t.region else info.get("region")) or "Other"
            period_target = (full_target.get(b) or {}).get(rt, 0.0)
            # Daily Target spreads the target over the branch's OWN region's
            # working days (MH and KA can differ)
            reg_days = total_days_reg[rt]["KA" if region.upper() == "KA" else "MH"]
            daily = period_target / reg_days if period_target else 0.0
            target_till = (till_target.get(b) or {}).get(rt, 0.0)
            achieved_till = round(agg["achieved_till"], 2)
            rows.append({
                "responsible_person": (t.responsible_person if t else None) or "—",
                "branch_id": b,
                "branch_name": (t.branch_name if t and t.branch_name else info.get("branch_name")) or b,
                "region": region,
                "monthly_target": round(period_target, 2),   # period target (key kept for compat)
                "daily_target": round(daily, 2),
                "achieved_on": round(agg["achieved_on"], 2),
                "target_till": round(target_till, 2),
                "achieved_till": achieved_till,
                "invoice_count_till": agg["invoices"],
                # Same formulas as the business's Result report:
                #   % Achieved     = Achi. Till / Target Till
                #   Short-Fall     = Target Till - Achi. Till   (negative = ahead)
                #   Balance/Month  = Monthly Target - Achi. Till
                "pct_achieved": round(achieved_till / target_till * 100, 1) if target_till else None,
                "short_fall_till": round(target_till - achieved_till, 2),
                "balance_month": round(period_target - achieved_till, 2),
            })
        return rows

    part_rows = _branch_rows("part")
    labour_rows = _branch_rows("labour")

    total_spare = round(sum(r["achieved_till"] for r in part_rows), 2)
    total_labour = round(sum(r["achieved_till"] for r in labour_rows), 2)
    total_spare_target = round(sum(f["part"] for f in full_target.values()), 2)
    total_labour_target = round(sum(f["labour"] for f in full_target.values()), 2)
    total_target = total_spare_target + total_labour_target
    # An invoice no never appears under both record types, so the two sides'
    # distinct counts simply add up.
    total_invoices = sum(a["invoices"] for a in branch_agg["part"].values()) +         sum(a["invoices"] for a in branch_agg["labour"].values())

    def _dictrows(d, targets=None):
        rows = [{
            "name": k, "part": round(v["part"], 2), "labour": round(v["labour"], 2),
            "total": round(v["part"] + v["labour"], 2), "invoices": v["invoices"],
        } for k, v in sorted(d.items(), key=lambda kv: -(kv[1]["part"] + kv[1]["labour"]))]
        if targets is None:
            return rows
        # A region can hold an AOP target with no sales in the period yet — it
        # still belongs in the table, with dashes on the sale side.
        for name in targets:
            if not any(r["name"] == name for r in rows):
                rows.append({"name": name, "part": 0.0, "labour": 0.0,
                             "total": 0.0, "invoices": 0})
        for r in rows:
            t = targets.get(r["name"]) or {}
            r["spare_target"] = round(t.get("part", 0.0), 2)
            r["labour_target"] = round(t.get("labour", 0.0), 2)
            r["total_target"] = round(r["spare_target"] + r["labour_target"], 2)
            # prorated to the period (the "till date" share of the AOP target)
            r["spare_target_till"] = round(t.get("part_till", 0.0), 2)
            r["labour_target_till"] = round(t.get("labour_till", 0.0), 2)
            r["total_target_till"] = round(r["spare_target_till"] + r["labour_target_till"], 2)
        # Regions read in a FIXED order — Maharashtra first, then Karnataka,
        # then anything else — not by whichever sold more this period.
        order = {"MH": 0, "KA": 1}
        rows.sort(key=lambda r: (order.get(r["name"], 2), r["name"]))
        return rows

    # ---- Region-wise AOP target -------------------------------------------
    # Targets are set per BRANCH in the AOP Master, and every target row carries
    # that branch's region (MH / KA), so a region target is just the sum of its
    # branches' targets — the same figures the branch tables show, grouped the
    # same way the region breakdown groups sales.
    region_target = {}
    for b in set(full_target) | set(till_target):
        t = info_by_branch.get(b)
        region = (t.region if t and t.region else (branch_info.get(b) or {}).get("region")) or "Other"
        rt_ = region_target.setdefault(region, {"part": 0.0, "labour": 0.0,
                                                "part_till": 0.0, "labour_till": 0.0})
        for rt in ("part", "labour"):
            rt_[rt] += (full_target.get(b) or {}).get(rt, 0.0)
            rt_[f"{rt}_till"] += (till_target.get(b) or {}).get(rt, 0.0)

    return {
        "success": True,
        "as_on": to_date.isoformat(),
        "as_on_part": to_by["part"].isoformat(),
        "as_on_labour": to_by["labour"].isoformat(),
        "from_date": from_date.isoformat(),
        "month": to_date.strftime("%Y-%m"),
        "days_in_month": max(total_days_rt.values()),
        "day_number": (to_date - from_date).days + 1,
        "generated_at": datetime.now().isoformat(),
        "summary": {
            "total_spare_sale": total_spare,
            "total_labour_sale": total_labour,
            "total_spare_target": total_spare_target,
            "total_labour_target": total_labour_target,
            "overall_pct_achieved": round((total_spare + total_labour) / total_target * 100, 1)
                                     if total_target else None,
            "total_invoices": total_invoices,
        },
        "spare_rows": part_rows,
        "labour_rows": labour_rows,
        # Region-wise carries the AOP target too (targets exist per branch, and
        # every branch belongs to exactly one region) — Segment / Service Head
        # have no target dimension in the AOP Master, so they stay sales-only.
        "regional": _dictrows(region_agg, region_target),
        "segment": _dictrows(segment_agg),
        "service_head": _dictrows(head_agg),
        # Spare-only (the Labour file has no CATEGORY column)
        "category": [{
            "name": k, "part": round(v["part"], 2),
            "invoices": v["invoices"],
            "qty": round(v["qty"], 2),
            "lines": v["lines"],
        } for k, v in sorted(category_agg.items(), key=lambda kv: -kv[1]["part"])],
    }


def fy_summary_report(db: Session, fy_start: int):
    """Cached wrapper — see _fy_summary_report."""
    return _cached(db, ("fy", fy_start), lambda: _fy_summary_report(db, fy_start))


def _fy_summary_report(db: Session, fy_start: int):
    """Target vs achievement for a WHOLE financial year (Apr..Mar), per branch
    and per month — the source of the three FY panels on the report page
    (FY totals, quarter-wise, month-wise). Independent of the report period
    picker: it always covers the full FY that is asked for.

    Targets come from the AOP Master (pms_branch_targets, full monthly value —
    never prorated here) and achievement from the uploaded sales rows,
    cancelled rows excluded, aggregated in SQL by branch / month / type."""
    months = _fy_months(fy_start)
    fy_from, _ = _month_bounds(months[0])
    _, fy_to = _month_bounds(months[-1])

    # Branch list, names, region and the FY's targets — same source (and the
    # same Profile-synced branch list) the AOP Master grid shows.
    tgt = get_targets_year_payload(db, fy_start)

    rows = {}
    for r in tgt["items"]:
        rows[r["branch_id"]] = {
            "branch_id": r["branch_id"],
            "branch_name": r["branch_name"] or r["branch_id"],
            "region": (r["region"] or "").upper() or None,
            "responsible_person": r["responsible_person"],
            "spare_target": {m: float(r["spare"].get(m) or 0) for m in months},
            "labour_target": {m: float(r["labour"].get(m) or 0) for m in months},
            "spare_sale": {m: 0.0 for m in months},
            "labour_sale": {m: 0.0 for m in months},
        }

    # One grouped query for the whole year instead of pulling every row.
    agg = (db.query(PmsSalesRecord.branch_id,
                    PmsSalesRecord.record_type,
                    func.year(PmsSalesRecord.claim_invoice_date).label("y"),
                    func.month(PmsSalesRecord.claim_invoice_date).label("m"),
                    func.sum(PmsSalesRecord.net_taxable_amount).label("amt"))
           .filter(PmsSalesRecord.claim_invoice_date >= fy_from,
                   PmsSalesRecord.claim_invoice_date <= fy_to,
                   PmsSalesRecord.is_cancelled == False)  # noqa: E712
           .group_by(PmsSalesRecord.branch_id, PmsSalesRecord.record_type,
                     func.year(PmsSalesRecord.claim_invoice_date),
                     func.month(PmsSalesRecord.claim_invoice_date))
           .all())

    month_set = set(months)
    for branch_id, rt, y, m, amt in agg:
        key = f"{int(y)}-{int(m):02d}"
        if key not in month_set:
            continue
        b = _norm_branch_id(branch_id) or "UNKNOWN"
        row = rows.get(b)
        if row is None:
            # A branch with sales but no AOP row still belongs in the table.
            row = rows[b] = {
                "branch_id": b, "branch_name": b, "region": None,
                "responsible_person": None,
                "spare_target": {mm: 0.0 for mm in months},
                "labour_target": {mm: 0.0 for mm in months},
                "spare_sale": {mm: 0.0 for mm in months},
                "labour_sale": {mm: 0.0 for mm in months},
            }
        field = "spare_sale" if rt == "part" else "labour_sale"
        row[field][key] += float(amt or 0)

    # How far into the year the sales data reaches — the run-rate columns need
    # a cut-off to split the FY's working days into elapsed and remaining.
    last_dt = (db.query(func.max(PmsSalesRecord.claim_invoice_date))
               .filter(PmsSalesRecord.claim_invoice_date >= fy_from,
                       PmsSalesRecord.claim_invoice_date <= fy_to,
                       PmsSalesRecord.is_cancelled == False)  # noqa: E712
               .scalar())
    if hasattr(last_dt, "date"):
        last_dt = last_dt.date()

    # Working days of the FY, split at the last sales date — Sundays and the
    # AOP Master's ticked holidays removed, per region. Done here rather than on
    # the page so the run-rate columns rest on the same calendar as the targets.
    hol = _holiday_sets(db, fy_from, fy_to)
    typed = {}
    for st in (db.query(PmsMonthSettings)
               .filter(sa_or(PmsMonthSettings.target_month.in_(months),
                             PmsMonthSettings.target_month.like(f"{_ALL_WD_PREFIX}%")))
               .all()):
        typed[st.target_month] = st
    wd_split = {}
    for reg in ("MH", "KA"):
        off = hol[reg]
        total = elapsed = 0
        for m in months:
            m_start, m_end = _month_bounds(m)
            wd = _count_workdays(m_start, m_end, off)
            # this month's own ticks decide; a month with none keeps its count
            if not any(m_start <= d <= m_end for d in off):
                st = typed.get(m) or typed.get(f"{_ALL_WD_PREFIX}{m[5:7]}")
                v = st and ((st.working_days_ka if reg == "KA" else st.working_days_mh)
                            or st.working_days)
                if v:
                    wd = max(1, v)
            total += wd
            if last_dt and last_dt >= m_start:
                done = (wd if last_dt >= m_end
                        else _count_workdays(m_start, min(last_dt, m_end), off))
                elapsed += min(wd, done)
        wd_split[reg] = {"total": total, "elapsed": elapsed,
                         "left": max(0, total - elapsed)}

    return {
        "success": True,
        "fy": fy_start,
        "months": months,
        # Q1 = Apr-Jun … Q4 = Jan-Mar
        "quarters": [{"label": f"Q{i + 1}", "months": months[i * 3:i * 3 + 3]}
                     for i in range(4)],
        # Region-wise working days per month (AOP Master) + the last sales date,
        # so the page can work out each branch's run-rate.
        "working_days": tgt["working_days"],
        "wd_split": wd_split,
        "as_on": last_dt.isoformat() if last_dt else None,
        "rows": sorted(rows.values(), key=lambda r: _branch_sort_key(r["branch_id"])),
    }


def branch_detail_report(db: Session, as_on: date, from_date: date,
                         branch_ids: list):
    """Cached wrapper — see _branch_detail_report."""
    key = ("bdetail", as_on, from_date,
           tuple(sorted({_norm_branch_id(b) for b in (branch_ids or []) if str(b).strip()})))
    return _cached(db, key, lambda: _branch_detail_report(db, as_on, from_date, branch_ids))


def _branch_detail_report(db: Session, as_on: date, from_date: date,
                          branch_ids: list):
    """Detail for the SELECTED branches of the branch-filter report:

      weeks         -> the period split into 7-day chunks (Week 1..N), each
                       with Spare + Labour sale and invoice count
      segment /     -> the breakdown tables recomputed from ONLY the selected
      service_head     branches' rows (both record types)
      category      -> Spare-only (the Labour file has no CATEGORY column)

    Cancelled rows are excluded, same as the main report."""
    ids = sorted({_norm_branch_id(b) for b in (branch_ids or []) if str(b).strip()})
    if not ids:
        return {"success": False, "message": "No branches selected"}
    if from_date is None:
        from_date = as_on.replace(day=1)
    if from_date > as_on:
        from_date, as_on = as_on, from_date

    # Week buckets: 7-day chunks starting at from_date, last one clamped.
    weeks = []
    ws, idx = from_date, 1
    while ws <= as_on:
        we = min(ws + timedelta(days=6), as_on)
        weeks.append({"idx": idx, "start": ws, "end": we, "part": 0.0,
                      "labour": 0.0, "invoices": 0})
        ws, idx = we + timedelta(days=1), idx + 1

    # AOP target of the SELECTED branches for every month the period touches —
    # the detail tables measure their sales against these, month by month and
    # for the period as a whole. Full monthly values, like "Monthly Target" in
    # the branch table (not prorated).
    months_touched, cur = [], from_date.replace(day=1)
    while cur <= as_on:
        months_touched.append(cur.strftime("%Y-%m"))
        cur = (cur.replace(day=28) + timedelta(days=4)).replace(day=1)
    target_by_month = {m: {"spare": 0.0, "labour": 0.0} for m in months_touched}
    for m, sp, lb in (db.query(PmsBranchTarget.target_month,
                               func.sum(PmsBranchTarget.spare_target),
                               func.sum(PmsBranchTarget.labour_target))
                      .filter(PmsBranchTarget.target_month.in_(months_touched),
                              PmsBranchTarget.branch_id.in_(ids))
                      .group_by(PmsBranchTarget.target_month).all()):
        target_by_month[m] = {"spare": float(sp or 0), "labour": float(lb or 0)}
    tgt_spare = round(sum(t["spare"] for t in target_by_month.values()), 2)
    tgt_labour = round(sum(t["labour"] for t in target_by_month.values()), 2)

    # Each WEEK's slice of that target: a month's target spread over its
    # working days, then the days of the week added up — same calendar as the
    # main report, so Sundays AND the ticked holidays carry no target. The
    # selected branches can span both regions, so a day counts as off only when
    # it is off for every region in the selection.
    hol = _holiday_sets(db, from_date.replace(day=1), as_on)
    sel_regions = {(r.region or "MH").upper() for r in
                   db.query(PmsBranchTarget.region)
                   .filter(PmsBranchTarget.branch_id.in_(ids)).distinct().all()} or {"MH"}
    off = set.intersection(*[hol.get(r, set()) for r in sel_regions])         if sel_regions else set()
    _wd_share = {}
    for m, t in target_by_month.items():
        m_start, m_end = _month_bounds(m)
        wd = max(1, _count_workdays(m_start, m_end, off))
        _wd_share[m] = (t["spare"] / wd, t["labour"] / wd)
    for w in weeks:
        sp = lb = 0.0
        cur = w["start"]
        while cur <= w["end"]:
            if cur.weekday() != 6 and cur not in off:   # Sunday / holiday = none
                per_day = _wd_share.get(cur.strftime("%Y-%m"))
                if per_day:
                    sp += per_day[0]
                    lb += per_day[1]
            cur += timedelta(days=1)
        w["spare_target"], w["labour_target"] = sp, lb

    sr_head = {k.lower(): v for k, v in DEFAULT_SR_HEADS.items()}
    sr_head.update({m.sr_type.lower(): (m.head or "Unmapped")
                    for m in db.query(PmsSrTypeMapping).all()})

    # Summed IN SQL, like the main report: only the grouped rows travel back
    # (one per date / segment / SR type), not every sales row. An invoice sits
    # on ONE date, in ONE segment and under ONE SR type, so adding a bucket's
    # groups' DISTINCT invoice counts gives the bucket's own distinct count.
    segment_agg, head_agg, category_agg = {}, {}, {}
    month_agg = {}          # 'YYYY-MM' -> {part, labour, invoices}
    AMT = func.sum(func.coalesce(PmsSalesRecord.net_taxable_amount, 0.0))
    INV = func.coalesce(func.nullif(PmsSalesRecord.claim_invoice_no, ""),
                        "row-" + cast(PmsSalesRecord.id, String(20)))
    _EMPTY, _OTC = literal_column("''"), literal_column(f"'{SEGMENT_OTC}'")
    SEG = func.coalesce(func.nullif(func.ltrim(func.rtrim(PmsSalesRecord.segment)), _EMPTY),
                        func.nullif(func.ltrim(func.rtrim(PmsSalesRecord.product_segment)), _EMPTY),
                        _OTC)

    def _scoped():
        # Served by IX_pms_records_branch_date — a seek on the selected
        # branches + date range with no base-table lookups.
        return (db.query(PmsSalesRecord)
                .filter(PmsSalesRecord.claim_invoice_date >= from_date,
                        PmsSalesRecord.claim_invoice_date <= as_on,
                        PmsSalesRecord.is_cancelled == False,   # noqa: E712
                        PmsSalesRecord.branch_id.in_(ids)))

    # -- one row per (type, invoice date): feeds BOTH the weeks and the months --
    for rt, d, amt, inv_n in (
            _scoped()
            .with_entities(PmsSalesRecord.record_type, PmsSalesRecord.claim_invoice_date,
                           AMT, func.count(distinct(INV)))
            .group_by(PmsSalesRecord.record_type, PmsSalesRecord.claim_invoice_date).all()):
        d = d.date() if hasattr(d, "date") else d
        amt, inv_n = float(amt or 0), int(inv_n or 0)
        wk = weeks[min((d - from_date).days // 7, len(weeks) - 1)]
        wk[rt] += amt
        wk["invoices"] += inv_n
        mo = month_agg.setdefault(d.strftime("%Y-%m"),
                                  {"part": 0.0, "labour": 0.0, "invoices": 0})
        mo[rt] += amt
        mo["invoices"] += inv_n

    # -- segment (blank SEGMENT = OTC business) --
    for rt, seg_key, amt, inv_n in (
            _scoped()
            .with_entities(PmsSalesRecord.record_type, SEG, AMT, func.count(distinct(INV)))
            .group_by(PmsSalesRecord.record_type, SEG).all()):
        seg = segment_agg.setdefault((seg_key or SEGMENT_OTC).strip() or SEGMENT_OTC,
                                     {"part": 0.0, "labour": 0.0, "invoices": 0})
        seg[rt] += float(amt or 0)
        seg["invoices"] += int(inv_n or 0)

    # -- SR type -> Head --
    for rt, sr_type, amt, inv_n in (
            _scoped()
            .with_entities(PmsSalesRecord.record_type, PmsSalesRecord.sr_type, AMT,
                           func.count(distinct(INV)))
            .group_by(PmsSalesRecord.record_type, PmsSalesRecord.sr_type).all()):
        head_key = sr_head.get((sr_type or "").strip().lower(),
                               "Unmapped" if sr_type else "Unspecified")
        hd = head_agg.setdefault(head_key, {"part": 0.0, "labour": 0.0, "invoices": 0})
        hd[rt] += float(amt or 0)
        hd["invoices"] += int(inv_n or 0)

    # -- CATEGORY / QUANTITY — Part Sale file only --
    for cat, amt, qty, lines, inv_n in (
            _scoped().filter(PmsSalesRecord.record_type == "part")
            .with_entities(PmsSalesRecord.category, AMT,
                           func.sum(func.coalesce(PmsSalesRecord.quantity, 0.0)),
                           func.count(), func.count(distinct(INV)))
            .group_by(PmsSalesRecord.category).all()):
        c = category_agg.setdefault((cat or "").strip() or "(Blanks)",
                                    {"part": 0.0, "invoices": 0, "qty": 0.0, "lines": 0})
        c["part"] += float(amt or 0)
        c["qty"] += float(qty or 0)
        c["lines"] += int(lines or 0)
        c["invoices"] += int(inv_n or 0)

    def _dictrows(dct):
        return [{
            "name": k, "part": round(v["part"], 2), "labour": round(v["labour"], 2),
            "total": round(v["part"] + v["labour"], 2), "invoices": v["invoices"],
        } for k, v in sorted(dct.items(), key=lambda kv: -(kv[1]["part"] + kv[1]["labour"]))]

    return {
        "success": True,
        "from_date": from_date.isoformat(),
        "as_on": as_on.isoformat(),
        "branches": ids,
        "weeks": [{
            "week": w["idx"],
            "start": w["start"].isoformat(),
            "end": w["end"].isoformat(),
            "part": round(w["part"], 2),
            "labour": round(w["labour"], 2),
            "total": round(w["part"] + w["labour"], 2),
            "invoices": w["invoices"],
            "spare_target": round(w.get("spare_target", 0.0), 2),
            "labour_target": round(w.get("labour_target", 0.0), 2),
        } for w in weeks],
        # The selected branches' AOP target for the period, and per month, so
        # every detail table can show achievement against target.
        "targets": {"spare": tgt_spare, "labour": tgt_labour,
                    "total": round(tgt_spare + tgt_labour, 2)},
        "months": [{
            "month": m,
            "part": round(v["part"], 2),
            "labour": round(v["labour"], 2),
            "total": round(v["part"] + v["labour"], 2),
            "invoices": v["invoices"],
            "spare_target": round((target_by_month.get(m) or {}).get("spare", 0.0), 2),
            "labour_target": round((target_by_month.get(m) or {}).get("labour", 0.0), 2),
        } for m, v in sorted(month_agg.items())],
        "segment": _dictrows(segment_agg),
        "service_head": _dictrows(head_agg),
        "category": [{
            "name": k, "part": round(v["part"], 2), "invoices": v["invoices"],
            "qty": round(v["qty"], 2), "lines": v["lines"],
        } for k, v in sorted(category_agg.items(), key=lambda kv: -kv[1]["part"])],
    }


# ---------------- EMPLOYEE PRODUCTIVITY (SE-wise) ---------------- #

def _lead_category_resolver(db: Session):
    """(categories, resolve) built from the LEAD CATEGORY MASTER.

    `categories` is the report's column list (master order); `resolve(raw)`
    returns a column index, appending an 'Unmapped' bucket the first time a
    'Lead Raised For' value has no category in the master — so the split always
    adds up to the lead count and the gap is visible."""
    categories = [c["name"] for c in list_lead_categories(db)]
    idx = {c: i for i, c in enumerate(categories)}
    by_tight = {}
    for m in db.query(PmsLeadRaisedForMap).all():
        cat = (m.category or "").strip()
        if m.lead_raised_for and cat:
            by_tight[_tight(m.lead_raised_for)] = cat

    def resolve(raised_for):
        cat = by_tight.get(_tight(raised_for or ""))
        if not cat:
            cat = LEAD_UNMAPPED
        if cat not in idx:
            idx[cat] = len(categories)
            categories.append(cat)
        return idx[cat]

    return categories, resolve


def _working_days_master(db: Session):
    """Everything needed to resolve any month's working days client-side:
    the FY-specific saved rows ('2026-07') and the universal per-calendar-month
    master ('ALL-07'). A month with neither falls back to its non-Sunday day
    count — the same precedence generate_report() uses."""
    months, universal = {}, {}
    for s in db.query(PmsMonthSettings).all():
        base = s.working_days or 0
        pair = {"mh": s.working_days_mh or base or None,
                "ka": s.working_days_ka or base or None}
        if not pair["mh"] and not pair["ka"]:
            continue
        if s.target_month.startswith(_ALL_WD_PREFIX):
            universal[s.target_month[len(_ALL_WD_PREFIX):]] = pair
        else:
            months[s.target_month] = pair
    return {"months": months, "universal": universal}


# ---------------- BRANCH SCOPE (who sees which branches) ------------------- #
# Employee Productivity and SR Allocation are branch-wise reports, and a user
# only gets the branches they belong to: the branch on their Profile plus every
# branch ticked in their branch access list (a Branch Admin often has several).
# The Master Admin, and ANY user carrying the HO branch, see the whole report —
# HO is the head office, so its people read every branch. Resolved from the DB
# in the routes (never from the client-supplied role header) and applied HERE,
# on the payload, so a scoped user cannot reach another branch's figures by
# calling the endpoint directly.
#
# Both payloads share one shape — branches / branch_ids / branch_regions /
# groups, employees[{n,u,b}] carrying a branch index, and record rows whose
# FIRST element is an employee (or, for a few, a branch) index — so one filter
# serves both: drop the branches that are out of scope, drop the employees and
# rows that hang off them, and renumber what is left.

def _scope_report_to_branches(data, allowed, emp_keys=(), branch_keys=()):
    """The report payload cut down to `allowed` branch ids (None = everything)."""
    if allowed is None or not data or not data.get("success"):
        return data
    ok = {_norm_branch_id(b) for b in allowed if str(b or "").strip()}
    branch_ids = data.get("branch_ids") or []
    keep = [i for i, b in enumerate(branch_ids) if b in ok]
    if len(keep) == len(branch_ids):
        return data                      # nothing to hide — the cached payload
    b_map = {old: new for new, old in enumerate(keep)}
    regions = data.get("branch_regions") or []
    out = dict(data)
    out["branches"] = [(data.get("branches") or [])[i] for i in keep]
    out["branch_ids"] = [branch_ids[i] for i in keep]
    out["branch_regions"] = [regions[i] for i in keep] if regions else []
    # A group keeps only its visible branches; a group left with none goes.
    out["groups"] = [m for m in ([b_map[b] for b in g if b in b_map]
                                 for g in (data.get("groups") or [])) if m]
    emps = data.get("employees") or []
    keep_e = [i for i, e in enumerate(emps) if e.get("b") in b_map]
    e_map = {old: new for new, old in enumerate(keep_e)}
    out["employees"] = [dict(emps[i], b=b_map[emps[i]["b"]]) for i in keep_e]
    for k in emp_keys:
        rows = data.get(k)
        if rows is not None:
            out[k] = [[e_map[r[0]]] + list(r[1:]) for r in rows if r[0] in e_map]
    for k in branch_keys:                # rows keyed on a BRANCH, not a person
        rows = data.get(k)
        if rows is not None:
            out[k] = [[b_map[r[0]]] + list(r[1:]) for r in rows if r[0] in b_map]
    return out


# The record arrays of each report, by what their first element indexes.
EP_EMP_RECORDS = ("sr_records", "lead_records", "conv_records",
                  "present_records", "allocate_records", "cdi_records")
EP_BRANCH_RECORDS = ("other_conv_records",)
SRAR_EMP_RECORDS = ("alloc_records", "close_records")
SRAR_BRANCH_RECORDS = ("open_records",)


def employee_productivity_data(db: Session, allowed_branches=None):
    """Cached wrapper — see _employee_productivity_data. `allowed_branches`
    (None = every branch) scopes the payload to the caller's branches."""
    data = _cached(db, ("emp_prod",), lambda: _employee_productivity_data(db))
    return _scope_report_to_branches(data, allowed_branches,
                                     EP_EMP_RECORDS, EP_BRANCH_RECORDS)


def _employee_productivity_data(db: Session):
    """'Employee Productivity' report source data.

    THE MAXTTR FILE IS THE SOURCE. Every SR in the 'Response Time & MaxTTR
    Details' import (response_time_maxttr, where SR NUMBER is unique) that has
    a SR CLOSE DATE and an SE NAME counts once for that engineer on that date.
    The labour file is NOT involved any more — an SR is counted because the
    engineer closed it, not because it was billed.

    Branches come from the MaxTTR row's own BRANCH ID (already in the
    normalised '420435_9' form). Never the branch name: files spell the same
    branch differently ('… - Aurangabad' vs 'Ch.Sambhaji Nagar') and the
    spelling changes between imports, while the id does not. The name is only a
    LABEL — the AOP master's spelling when the id is known.

    Per Service Engineer the report then adds:

      SR Type split   -> the MaxTTR row's SR TYPE mapped through the
                         'SR Type Master (MaxTTR)' (AOP Master) to its head
      Allocate SR     -> SRs ASSIGNED to the engineer, from the EFSR Report
                         (efsr_report) matched on SERVICE ENGINEER UID via the
                         SE UID Master, counted on TASK ASSIGNED DATE and split
                         by the 'SR Type Master (EFSR)'. Independent of Close
                         SR: an SR can be allocated in one period and closed in
                         another, and 'assigned but not closed' SRs count here
                         only.
      Working Days    -> the month-wise working-days master (AOP Master),
                         per region (MH / KA), prorated to the picked period
      Days present on
      Task end        -> distinct SR TASK END DATEs the engineer has. NOT the
                         close date: the SR is closed in the office, often in a
                         later batch, while the task end date is when the
                         engineer finished the job in the field.
      Productivity    -> Total SR / Working Days (NOT / Days Present: the days
                         present figure is attendance, the target is the
                         available man-days from the AOP master)
      CDI             -> the engineer's feedback from the CDI Detail Report,
                         matched on X TECHNICIAN NAME and counted on ACTIVITY
                         END DATE: Promotor and Detractor counts, and
                         % = (Promotor - Detractor) / all feedback x 100
      Leads           -> distinct LMS LEAD NUMBERs whose SERVICE ENGINEER UID
                         is the engineer's UID **in the SE UID Master** (the
                         master is the only place a UID comes from — LMS rows
                         are never matched against the MaxTTR names), counted
                         on LEAD CREATED DATE, split by 'Lead Raised For'
                         through the Lead Category Master
      Conv. Amounts   -> those leads' PART INVOICE AMOUNT (Spare) and LABOUR
                         INVOICE AMOUNT (Labour), dated on the ORDER's own
                         creation date, NOT the lead's. The date lives only in
                         'LMS Data from Insia' (lms_insia), looked up per LEAD
                         NUMBER: a lead with no order there, or whose ORDER
                         CREATION DATE is blank / '0' / 'N/A', contributes no
                         amount at all. Spare additionally EXCLUDES rows whose
                         LMS QUOTATION TYPE is 'OTC Quotation'. The lead COUNTS
                         above are untouched by any of this - they stay on LEAD
                         CREATED DATE and stay engineer-attributed.
      Other Conv.     -> its own PAIR of columns holding the conversions that
                         belong to NO engineer: the lead carries no Service
                         Engineer UID, or a UID the SE UID Master does not know.
                         Those amounts used to be dropped, which is most of the
                         money (61 of 75 matched leads in a real August window).
                         Kept per BRANCH, never as an engineer row - an 'Other'
                         pseudo-engineer would be counted in every branch's SE
                         headcount and hand it a phantom engineer's working
                         days. Prints on branch / total rows only, and is summed
                         into the Grand Total.

    The payload stays RAW per-day records — sr_records[[empIdx, isoDate,
    headIdx, count]], allocate_records[[empIdx, isoDate, efsrHeadIdx, count]],
    lead_records[[empIdx, isoLeadCreatedDate, catIdx, count]],
    conv_records[[empIdx, isoOrderCreationDate, spare, labour]],
    other_conv_records[[BRANCHIdx, isoOrderCreationDate, spare, labour]] and
    present_records[[empIdx, isoTaskEndDate]] — so the period / week
    windowing, branch rollups and every derived figure are recomputed
    client-side without a refetch."""
    from app.models.customer_model import (ResponseTimeMaxTTR, LMSData,
                                           EFSRReport, CDIDetailReport,
                                           LMSInsia)

    usable = (ResponseTimeMaxTTR.sr_close_date.isnot(None),
              ResponseTimeMaxTTR.se_name.isnot(None),
              ResponseTimeMaxTTR.se_name != "")

    rows = (db.query(ResponseTimeMaxTTR.se_name,
                     ResponseTimeMaxTTR.branch_id,
                     ResponseTimeMaxTTR.branch_name,
                     ResponseTimeMaxTTR.sr_close_date,
                     ResponseTimeMaxTTR.sr_type)
            .filter(*usable).all())


    # ---- SR TYPE -> head (SR TYPE MASTER (MAXTTR)) ------------------------
    heads = _report_heads(db, "maxttr")
    head_idx = {h: i for i, h in enumerate(heads)}
    sr_head = {}
    for m in db.query(PmsMaxttrSrTypeMap).all():
        if m.sr_type:
            sr_head[_tight(m.sr_type)] = (m.head or "").strip()

    def _head_of(sr_type):
        h = sr_head.get(_tight(sr_type or ""))
        if not h:
            h = HEAD_UNMAPPED            # visible gap, never silently merged
        if h not in head_idx:
            head_idx[h] = len(heads)
            heads.append(h)
        return head_idx[h]

    # ---- EFSR SR TYPE -> head ('SR Type Master (EFSR)') --------------------
    efsr_heads = _report_heads(db, "efsr")
    efsr_idx = {h: i for i, h in enumerate(efsr_heads)}
    efsr_map = {}
    for m in db.query(PmsEfsrSrTypeMap).all():
        if m.sr_type:
            efsr_map[_tight(m.sr_type)] = (m.head or "").strip()

    def _efsr_head_of(sr_type):
        h = efsr_map.get(_tight(sr_type or "")) or HEAD_UNMAPPED
        if h not in efsr_idx:
            efsr_idx[h] = len(efsr_heads)
            efsr_heads.append(h)
        return efsr_idx[h]

    # ---- LEAD CATEGORY MASTER ('Lead Raised For' -> report column) --------
    lead_cats, lead_cat_of = _lead_category_resolver(db)

    # ---- SE UID MASTER (the ONLY source of an engineer's UID) --------------
    # Leads are attributed strictly through this master: an LMS row's SERVICE
    # ENGINEER UID is looked up here to find the engineer, never matched against
    # the MaxTTR names directly. Keys are letters-only so the master row and the
    # MaxTTR spelling of the same name always meet.
    master = db.query(PmsSeUid).all()
    uid_of_tight, tights_of_uid, name_of_uid = {}, {}, {}
    master_branch = {}                   # letters-only name -> pinned branch id
    for m in master:
        t = _tight(m.name_key)
        uids = _uid_list(m.se_uid)
        if uids or t not in uid_of_tight:
            uid_of_tight[t] = ", ".join(uids)
        for u in uids:                   # a row may carry more than one UID
            tights_of_uid.setdefault(u.upper(), []).append(t)
            name_of_uid.setdefault(u.upper(), m.se_name)
        if m.branch_id:                  # hand-set on the Profile page
            master_branch[t] = _norm_branch_id(m.branch_id)

    # Display label per branch id — the AOP master's name is canonical so this
    # report and the Sales/Labour report label the same branch identically.
    aop_name, aop_region = {}, {}
    for t in db.query(PmsBranchTarget.branch_id, PmsBranchTarget.branch_name,
                      PmsBranchTarget.region).distinct():
        bid = _norm_branch_id(t[0])
        if not bid:
            continue
        if t[1] and bid not in aop_name:
            aop_name[bid] = t[1].strip()
        if t[2] and bid not in aop_region:
            aop_region[bid] = t[2].strip().upper()
    erp_region = {b: r for r, b, _n in ERP_BRANCHES}
    erp_name = {b: n for _r, b, n in ERP_BRANCHES}

    branch_idx, branches, branch_ids = {}, [], []

    def _branch(bid, fallback_name=None):
        """Index of a branch id, registering it on first sight.

        A code no KALA master knows is NOT a branch: the EFSR file puts another
        dealer's SD BRANCH CODE on a few rows, and one row was enough to grow a
        ghost branch in the report. Such a code folds into the single Unmapped
        Branch bucket, and it is only ever reached for an engineer this report
        has no other branch for at all (the caller resolves the engineer's own
        branch first). MaxTTR and LMS only ever carry real KALA codes."""
        bid = _norm_branch_id(bid) or ""
        if bid not in aop_name and bid not in erp_name:
            bid = UNMAPPED_BRANCH_ID
        if bid not in branch_idx:
            branch_idx[bid] = len(branches)
            branches.append(aop_name.get(bid) or erp_name.get(bid)
                            or (UNMAPPED_BRANCH_NAME if bid == UNMAPPED_BRANCH_ID
                                else (fallback_name or "").strip() or bid))
            branch_ids.append(bid)
        return branch_idx[bid]

    # Employee identity is the LETTERS-ONLY name + branch. Matching on that
    # rather than the spaced name means 'Vijaykumar Jadhav', 'VijaykumarJadhav'
    # and 'VIJAYKUMAR  JADHAV' are always ONE engineer, however the files spell
    # them; the nicest spelling seen is kept for display.
    emp_idx, employees = {}, []
    by_tight_key = {}                    # letters-only key -> [employee indices]

    def _employee(name, bi):
        key = _name_key(name)
        tkey = _tight(key)
        ekey = (tkey, bi)
        clean = (name or "").strip()
        if ekey not in emp_idx:
            emp_idx[ekey] = len(employees)
            employees.append({"n": clean or key,
                              "u": uid_of_tight.get(tkey, ""), "b": bi})
            by_tight_key.setdefault(tkey, []).append(emp_idx[ekey])
        else:
            # a properly spaced spelling wins over a squashed one
            row = employees[emp_idx[ekey]]
            if len(clean.split()) > len(row["n"].split()):
                row["n"] = clean
        return emp_idx[ekey]

    def _by_name(name):
        """The engineer's row(s) for a name, letters-only so spacing never
        matters (MaxTTR 'VijaykumarJadhav' == LMS 'Vijaykumar Jadhav')."""
        return by_tight_key.get(_tight(_name_key(name))) or []

    counts = {}                          # (emp, iso close date, head) -> SR count
    min_d = max_d = None
    for se_name, branch_id, branch_name, close_dt, sr_type in rows:
        bi = _branch(branch_id, branch_name)
        ei = _employee(se_name, bi)
        d = close_dt.date() if isinstance(close_dt, datetime) else close_dt
        ck = (ei, d.isoformat(), _head_of(sr_type))
        counts[ck] = counts.get(ck, 0) + 1
        if min_d is None or d < min_d:
            min_d = d
        if max_d is None or d > max_d:
            max_d = d

    def _place(name, bid):
        """The branch an engineer with NO row in any other file goes to: the
        file's own branch code when it is a real KALA branch, else the branch
        pinned on their SE UID Master row (Profile page), else Unmapped Branch.
        _branch() folds any code no master knows into that one bucket."""
        b = _norm_branch_id(bid)
        if b in aop_name or b in erp_name:
            return _branch(b)
        pinned = master_branch.get(_tight(_name_key(name)))
        return _branch(pinned if (pinned in aop_name or pinned in erp_name) else b)

    def _pick(cands, bid):
        """The engineer's row for a branch — exact branch first, else the only
        (or first) row they have."""
        if not cands:
            return None
        bid = _norm_branch_id(bid)
        if bid and bid in branch_idx:
            want = branch_idx[bid]
            hit = next((c for c in cands if employees[c]["b"] == want), None)
            if hit is not None:
                return hit
        return cands[0]

    # ---- 'Other' — conversions that belong to no engineer -------------------
    # A lead with NO Service Engineer UID (61 of the 75 matched leads in a real
    # August window) still converted, and the money still belongs to its BRANCH.
    # Dropping it made the two amount columns read a fraction of the truth.
    #
    # It is kept per BRANCH, NOT as an engineer row: an 'Other' pseudo-engineer
    # (the first cut, 2026-08-25) landed in the roster, so every branch header
    # counted one SE too many and the branch gained a phantom engineer's working
    # days. As its own record stream it stays out of the roster entirely and
    # prints in its own pair of columns, on branch and total rows only.
    other_convs = {}                     # (branch, iso ORDER date) -> [spare, labour]

    # ---- ORDER CREATION DATE ('LMS Data from Insia', keyed on LEAD NUMBER) -
    # The two Conv. Amount columns are dated on the ORDER, not on the lead: an
    # order raised in August against a July lead is August conversion. That date
    # exists only in the second LMS file, so it is looked up per LEAD NUMBER.
    # A blank / '0' / 'N/A' ORDER CREATION DATE parses to NULL at import time,
    # so those rows are filtered out here and the lead simply has no order date.
    order_date_of = {}
    for lead_no, ordered in (db.query(LMSInsia.lead_number,
                                      LMSInsia.order_creation_date)
                             .filter(LMSInsia.lead_number.isnot(None),
                                     LMSInsia.order_creation_date.isnot(None))
                             .all()):
        okey = (lead_no or "").strip().upper()
        if okey and okey not in order_date_of:
            order_date_of[okey] = (ordered.date() if isinstance(ordered, datetime)
                                   else ordered)

    # ---- LEADS (LMS file, keyed on SERVICE ENGINEER UID) -------------------
    # The UID / created-date filters are gone from the QUERY on purpose: a lead
    # with neither still carries a conversion that belongs to its branch. The
    # lead COUNTS below are still gated on a UID the SE UID Master resolves, so
    # the count columns hold exactly the population they always did — only the
    # two amount columns see the wider set, through their 'Other' sub-column.
    lead_rows = (db.query(LMSData.lead_number, LMSData.service_engineer_uid,
                          LMSData.service_engineer_name, LMSData.branch_id,
                          LMSData.branch_name, LMSData.lead_created_date,
                          LMSData.lead_raised_for, LMSData.part_invoice_amount,
                          LMSData.labour_invoice_amount, LMSData.quotation_type)
                 .all())

    leads = {}                           # (emp, iso created date, cat) -> lead count
    convs = {}                           # (emp, iso ORDER creation date) -> [spare, labour]
    seen_leads = set()                   # lead numbers already counted (unique)
    unlinked_leads = 0
    for i, (lead_no, uid, se_name, l_bid, l_bname, created, raised_for,
            part_amt, lab_amt, qtype) in enumerate(lead_rows):
        lkey = (lead_no or "").strip().upper() or f"#row{i}"
        if lkey in seen_leads:
            continue
        seen_leads.add(lkey)

        ukey = (uid or "").strip().upper()
        bi_lms = _norm_branch_id(l_bid)
        # SE UID Master ONLY: UID -> the master's engineer -> their row(s).
        cands = []
        for t in tights_of_uid.get(ukey, []):
            cands.extend(by_tight_key.get(t, []))
        ei = _pick(cands, bi_lms)
        if ei is None and ukey:
            label = name_of_uid.get(ukey)
            if label:
                # Known engineer with no SRs of their own — give them a row.
                ei = _employee(label, _place(label, l_bid))
            else:
                # This UID is in no master row — the lead cannot be attributed
                # to an engineer. Surfaced as meta.unlinked_leads so the master
                # can be fixed; its MONEY still reaches the branch, below.
                unlinked_leads += 1

        # COUNTS stay on LEAD CREATED DATE, and stay engineer-attributed: this
        # is the same population the count columns always had.
        if ei is not None and created is not None:
            d = created.date() if isinstance(created, datetime) else created
            ci = lead_cat_of(raised_for)
            lk = (ei, d.isoformat(), ci)
            leads[lk] = leads.get(lk, 0) + 1
            if min_d is None or d < min_d:
                min_d = d
            if max_d is None or d > max_d:
                max_d = d

        # AMOUNTS are dated on the ORDER instead — a lead with no order in
        # 'LMS Data from Insia' converts to nothing and is skipped entirely.
        od = order_date_of.get(lkey)
        if od is None:
            continue
        # An OTC quote is an over-the-counter sale, not this engineer's
        # conversion, so it is out of the SPARE column. Labour is unaffected.
        spare = 0.0 if _tight(qtype) == "OTCQUOTATION" else _parse_amount(part_amt)
        labour = _parse_amount(lab_amt)
        if spare or labour:
            if ei is not None:
                slot = convs.setdefault((ei, od.isoformat()), [0.0, 0.0])
            else:
                # No engineer -> the BRANCH's 'Other' pair of columns, never the bin.
                bi_other = _branch(_norm_branch_id(l_bid), l_bname)
                slot = other_convs.setdefault((bi_other, od.isoformat()), [0.0, 0.0])
            slot[0] += spare
            slot[1] += labour
            # The order can fall outside every other file's window, so the
            # page's calendar has to stretch to cover it — otherwise the
            # conversion would be clipped out of every selectable period.
            if min_d is None or od < min_d:
                min_d = od
            if max_d is None or od > max_d:
                max_d = od

    # ---- ALLOCATE SR (EFSR Report, matched on SERVICE ENGINEER UID) --------
    # Counted on TASK ASSIGNED DATE — the date the SR was given to the
    # engineer. SR CLOSED DATE would be wrong here: it is null for every SR
    # that is assigned but not finished, which is exactly what this column is
    # meant to show.
    alloc_rows = (db.query(EFSRReport.service_engineer_uid,
                           EFSRReport.service_engineer_name,
                           EFSRReport.sd_branch_code,
                           EFSRReport.task_assigned_date,
                           EFSRReport.sr_type)
                  .filter(EFSRReport.service_engineer_uid.isnot(None),
                          EFSRReport.service_engineer_uid != "",
                          EFSRReport.task_assigned_date.isnot(None))
                  .all())

    allocs = {}                          # (emp, iso assigned date, head) -> count
    for uid, se_name, e_bid, assigned, sr_type in alloc_rows:
        ukey = (uid or "").strip().upper()
        cands = []
        for t in tights_of_uid.get(ukey, []):
            cands.extend(by_tight_key.get(t, []))
        ei = _pick(cands, e_bid)
        if ei is None:
            label = name_of_uid.get(ukey)
            if not label:
                continue                 # UID in no master row
            ei = _employee(label, _place(label, e_bid))
        d = assigned.date() if isinstance(assigned, datetime) else assigned
        ak = (ei, d.isoformat(), _efsr_head_of(sr_type))
        allocs[ak] = allocs.get(ak, 0) + 1
        if min_d is None or d < min_d:
            min_d = d
        if max_d is None or d > max_d:
            max_d = d

    # ---- CDI (CDI Detail Report, matched on X TECHNICIAN NAME) -------------
    # That file has no UID, only the technician's name, so this joins the same
    # way the SR side does — on the letters-only name. Counted on ACTIVITY END
    # DATE. Three buckets per row; the report's % is computed from them.
    cdi_rows = (db.query(CDIDetailReport.x_technician_name,
                         CDIDetailReport.activity_end_date,
                         CDIDetailReport.cdi_category)
                .filter(CDIDetailReport.x_technician_name.isnot(None),
                        CDIDetailReport.x_technician_name != "",
                        CDIDetailReport.activity_end_date.isnot(None))
                .all())

    cdis = {}                            # (emp, iso activity end date, bucket) -> count
    for tech_name, ended, cat in cdi_rows:
        ei = _pick(_by_name(tech_name), None)
        if ei is None:
            continue                     # technician is not one of our engineers
        d = ended.date() if isinstance(ended, datetime) else ended
        ck = (ei, d.isoformat(), _cdi_bucket(cat))
        cdis[ck] = cdis.get(ck, 0) + 1
        if min_d is None or d < min_d:
            min_d = d
        if max_d is None or d > max_d:
            max_d = d

    # Nothing anywhere -> an empty payload the client renders as "no data".
    if not rows and not leads and not convs and not other_convs and not allocs and not cdis:
        return {"success": True,
                "meta": {"min_date": None, "max_date": None,
                         "unlinked_leads": unlinked_leads},
                "branches": [], "branch_ids": [], "branch_regions": [],
                "groups": [], "employees": [], "heads": heads,
                "lead_categories": lead_cats, "efsr_heads": efsr_heads,
                "sr_records": [], "lead_records": [], "conv_records": [],
                "other_conv_records": [], "present_records": [],
                "allocate_records": [], "cdi_records": [],
                "working_days": _working_days_master(db)}

    # ---- DAYS PRESENT ON TASK END (SR TASK END DATE in the MaxTTR file) ----
    # 2026-08-19: attendance moved off SR CLOSE DATE onto SR TASK END DATE. The
    # close date is an OFFICE event (the SR is closed in the system, sometimes
    # days later and in a batch); the task end date is when the engineer actually
    # finished the job in the field, so it is the honest attendance marker. A day
    # the engineer ended at least one task is a day present, collapsed to
    # DISTINCT dates. Dates attach to the engineer's existing row(s); attendance
    # alone never creates a row, so the roster stays exactly the
    # branches/engineers built above.
    present_rows = (db.query(ResponseTimeMaxTTR.se_name,
                             ResponseTimeMaxTTR.branch_id,
                             ResponseTimeMaxTTR.sr_task_end_date)
                    .filter(ResponseTimeMaxTTR.sr_task_end_date.isnot(None),
                            ResponseTimeMaxTTR.se_name.isnot(None),
                            ResponseTimeMaxTTR.se_name != "")
                    .distinct().all())
    present = set()                      # (emp index, iso task end date)
    for se_name, r_bid, end_dt in present_rows:
        ei = _pick(_by_name(se_name), r_bid)
        if ei is None:
            continue
        d = end_dt.date() if isinstance(end_dt, datetime) else end_dt
        present.add((ei, d.isoformat()))
        # A task can end BEFORE its SR is closed (and outside every other
        # file's window), so the reporting range has to stretch to cover it —
        # otherwise the page's calendar clips days the report should count.
        if min_d is None or d < min_d:
            min_d = d
        if max_d is None or d > max_d:
            max_d = d

    # ---- branch groups (first column) --------------------------------------
    # The configured groups first (only their branches that actually have
    # data), then any branch the configuration does not mention, on its own.
    groups, grouped = [], set()
    for g in EPR_BRANCH_GROUPS:
        members = [branch_idx[b] for b in g if b in branch_idx]
        if members:
            groups.append(members)
            grouped.update(members)
    for bi in range(len(branches)):
        if bi not in grouped:
            groups.append([bi])

    branch_regions = [aop_region.get(b) or erp_region.get(b) or "MH"
                      for b in branch_ids]

    sr_records = sorted([ei, ds, hi, n] for (ei, ds, hi), n in counts.items())
    lead_records = sorted([ei, ds, ci, n] for (ei, ds, ci), n in leads.items())
    conv_records = sorted([ei, ds, round(v[0], 2), round(v[1], 2)]
                          for (ei, ds), v in convs.items())
    # Keyed on the BRANCH index, not an employee index — see other_convs.
    other_conv_records = sorted([bi, ds, round(v[0], 2), round(v[1], 2)]
                                for (bi, ds), v in other_convs.items())
    present_records = sorted([ei, ds] for ei, ds in present)
    allocate_records = sorted([ei, ds, hi, n] for (ei, ds, hi), n in allocs.items())
    cdi_records = sorted([ei, ds, b, n] for (ei, ds, b), n in cdis.items())
    return {"success": True,
            # meta stays minimal: the page needs the date range to bound its
            # calendar, and the report warns when an LMS UID is unmastered. The
            # file-coverage counters were dropped with the report's footer.
            "meta": {"min_date": min_d.isoformat() if min_d else None,
                     "max_date": max_d.isoformat() if max_d else None,
                     "unlinked_leads": unlinked_leads},
            "branches": branches, "branch_ids": branch_ids,
            "branch_regions": branch_regions, "groups": groups,
            "employees": employees, "heads": heads,
            "lead_categories": lead_cats, "efsr_heads": efsr_heads,
            "sr_records": sr_records, "lead_records": lead_records,
            "conv_records": conv_records,
            "other_conv_records": other_conv_records,
            "present_records": present_records,
            "allocate_records": allocate_records,
            "cdi_records": cdi_records,
            "working_days": _working_days_master(db)}


def sr_allocation_data(db: Session, allowed_branches=None):
    """Cached wrapper — see _sr_allocation_data. `allowed_branches`
    (None = every branch) scopes the payload to the caller's branches."""
    data = _cached(db, ("sr_alloc",), lambda: _sr_allocation_data(db))
    return _scope_report_to_branches(data, allowed_branches,
                                     SRAR_EMP_RECORDS, SRAR_BRANCH_RECORDS)


def _sr_allocation_data(db: Session):
    """'SR Allocation' report source data — the EFSR Report, date by date.

    THE EFSR REPORT IS THE ONLY SOURCE, and it carries BOTH measures:

      ALLOCATED   every row with a SERVICE ENGINEER UID and a TASK ASSIGNED
                  DATE, counted on that date. A closed date is NOT required, so
                  an SR still open counts the day it was given to the engineer —
                  this is the same figure, from the same column, as the
                  'Allocated SR' of the Employee Productivity report.
      CLOSED      every row with a SERVICE ENGINEER UID and a TASK END DATE,
                  counted on that date — the day the ENGINEER finished the job.
                  NOT the SR CLOSED DATE: that is the back-office closure, which
                  lands days later and never arrives at all for a third of the
                  tasks the engineer has actually completed.

    Both are per-date records, so the report's date columns can show either or
    both (bucketed day / week / month client-side from the picked period). A row
    normally counts once in each — on its assigned date and again on its closed
    date; the two totals differ by the SRs assigned in the period but closed
    outside it (or not yet closed at all).

    Rows are attributed through the SE UID Master (UID -> engineer), so SE NAME
    and SE UID read exactly the same here as in Employee Productivity. A UID the
    master does not know still counts, under the file's own SERVICE ENGINEER
    NAME, so the report always adds up to the file — meta.unmastered says how
    many rows those are.

    Branch is the row's SD BRANCH CODE, grouped with the same branch groups the
    Employee Productivity report uses. Each SR is also mapped through the
    'SR Type Master (EFSR)' (AOP Master), which drives the per-engineer
    ROW-WISE SR Type bifurcation.

    Payload: alloc_records[[empIdx, isoAssignedDate, headIdx, count]] and
    close_records[[empIdx, isoTaskEndDate, headIdx, count]] — raw per-day, so the
    period, the column granularity and every rollup are recomputed client-side
    without a refetch."""
    from app.models.customer_model import (EFSRReport, ResponseTimeMaxTTR,
                                           OpenSRLoadReport, Customer)

    # ---- SR TYPE -> head ('SR Type Master (EFSR)') -------------------------
    heads = _report_heads(db, "efsr")
    head_idx = {h: i for i, h in enumerate(heads)}
    head_map = {}
    for m in db.query(PmsEfsrSrTypeMap).all():
        if m.sr_type:
            head_map[_tight(m.sr_type)] = (m.head or "").strip()

    def _head_of(sr_type):
        h = head_map.get(_tight(sr_type or "")) or HEAD_UNMAPPED
        if h not in head_idx:
            head_idx[h] = len(heads)
            heads.append(h)
        return head_idx[h]

    # ---- SE UID MASTER (UID -> the engineer's canonical name) --------------
    uid_of_tight, name_of_uid = {}, {}
    master_branch = {}                   # letters-only name -> pinned branch id
    for m in db.query(PmsSeUid).all():
        t = _tight(m.name_key)
        uids = _uid_list(m.se_uid)
        if uids or t not in uid_of_tight:
            uid_of_tight[t] = ", ".join(uids)
        for u in uids:                       # a row may carry more than one UID
            name_of_uid.setdefault(u.upper(), m.se_name)
        if m.branch_id:                      # hand-set on the Profile page
            master_branch[t] = _norm_branch_id(m.branch_id)

    # ---- branch labels (AOP master spelling is canonical) ------------------
    aop_name, aop_region = {}, {}
    for t in db.query(PmsBranchTarget.branch_id, PmsBranchTarget.branch_name,
                      PmsBranchTarget.region).distinct():
        bid = _norm_branch_id(t[0])
        if not bid:
            continue
        if t[1] and bid not in aop_name:
            aop_name[bid] = t[1].strip()
        if t[2] and bid not in aop_region:
            aop_region[bid] = t[2].strip().upper()
    erp_region = {b: r for r, b, _n in ERP_BRANCHES}
    erp_name = {b: n for _r, b, n in ERP_BRANCHES}

    branch_idx, branches, branch_ids = {}, [], []

    def _branch(bid):
        bid = _norm_branch_id(bid) or ""
        if bid not in aop_name and bid not in erp_name:
            bid = UNMAPPED_BRANCH_ID            # never a ghost branch — see _home
        if bid not in branch_idx:
            branch_idx[bid] = len(branches)
            branches.append(aop_name.get(bid) or erp_name.get(bid)
                            or UNMAPPED_BRANCH_NAME)
            branch_ids.append(bid)
        return branch_idx[bid]

    # A row is of interest when it has EITHER date: assigned-only rows are the
    # open SRs (allocated, not yet closed), closed-only rows are the ones the
    # file carries without an assignment date.
    rows = (db.query(EFSRReport.service_engineer_uid,
                     EFSRReport.service_engineer_name,
                     EFSRReport.sd_branch_code,
                     EFSRReport.task_assigned_date,
                     EFSRReport.task_end_date,
                     EFSRReport.sr_type)
            .filter(EFSRReport.service_engineer_uid.isnot(None),
                    EFSRReport.service_engineer_uid != "",
                    sa_or(EFSRReport.task_assigned_date.isnot(None),
                          EFSRReport.task_end_date.isnot(None)))
            .all())

    def _as_date(v):
        return v.date() if isinstance(v, datetime) else v

    # ---- pass 1: normalise every row, and tally each engineer's branches ---
    # Engineer identity is the LETTERS-ONLY name (the SE UID Master is itself
    # name-unique), so spacing variants never split a row.
    raw = []            # (tight, label, uid, branch id, assigned, closed, sr type)
    tally = {}                           # tight -> {branch id: rows}
    unmastered = 0
    for uid, se_name, bid, assigned, ended, sr_type in rows:
        ukey = (uid or "").strip().upper()
        label = name_of_uid.get(ukey)
        if not label:
            unmastered += 1              # UID not in the master: keep the row,
            label = (se_name or "").strip() or ukey      # under the file's name
        tkey = _tight(_name_key(label))
        b = _norm_branch_id(bid) or "UNKNOWN"
        raw.append((tkey, (label or "").strip(), uid, b,
                    _as_date(assigned), _as_date(ended), sr_type))
        tally.setdefault(tkey, {})
        tally[tkey][b] = tally[tkey].get(b, 0) + 1

    # ---- home branch: the branch the ENGINEER belongs to -------------------
    # EFSR carries the SD BRANCH CODE of the SR, and on ~1% of rows that is
    # ANOTHER DEALER's code, which no KALA master knows. Grouping straight on it
    # would scatter one engineer across ghost branches, so the report groups by
    # the engineer instead: EVERY SR of theirs counts in the branch they belong
    # to, resolved in this order —
    #   1. the KALA branch they have the most EFSR rows in;
    #   2. failing that, the branch the MaxTTR file puts them in (matched on the
    #      letters-only SE NAME — that file only ever carries real KALA codes);
    #   3. failing that, the BRANCH pinned on their SE UID Master row (Profile
    #      page) — the manual answer for an engineer no file can place;
    #   4. failing that too, the single Unmapped Branch bucket, so the report
    #      still adds up to the file and the gap is visible instead of wearing
    #      another dealer's code as if it were a KALA branch.
    known = set(aop_name) | set(erp_name)

    mt_home = {}                         # letters-only SE name -> (branch id, rows)
    for se_nm, b_id, n in (db.query(ResponseTimeMaxTTR.se_name,
                                    ResponseTimeMaxTTR.branch_id,
                                    func.count(ResponseTimeMaxTTR.id))
                           .filter(ResponseTimeMaxTTR.se_name.isnot(None),
                                   ResponseTimeMaxTTR.se_name != "")
                           .group_by(ResponseTimeMaxTTR.se_name,
                                     ResponseTimeMaxTTR.branch_id).all()):
        b = _norm_branch_id(b_id)
        if b not in known:
            continue
        k = _tight(_name_key(se_nm))
        if k not in mt_home or n > mt_home[k][1]:
            mt_home[k] = (b, n)

    home = {}
    for tkey, c in tally.items():
        pref = {b: n for b, n in c.items() if b in known}
        if pref:
            home[tkey] = max(pref.items(), key=lambda kv: (kv[1], kv[0]))[0]
        elif tkey in mt_home:
            home[tkey] = mt_home[tkey][0]
        elif master_branch.get(tkey) in known:
            home[tkey] = master_branch[tkey]      # pinned by hand in the master
        else:
            home[tkey] = UNMAPPED_BRANCH_ID

    emp_idx, employees = {}, []

    def _employee(tkey, label, uid):
        if tkey not in emp_idx:
            emp_idx[tkey] = len(employees)
            employees.append({"n": label or tkey,
                              "u": uid_of_tight.get(tkey) or (uid or "").strip(),
                              "b": _branch(home[tkey])})
        else:
            row = employees[emp_idx[tkey]]
            if len(label.split()) > len(row["n"].split()):
                row["n"] = label      # a properly spaced spelling wins
        return emp_idx[tkey]

    # ---- pass 2: count both measures ---------------------------------------
    # One row counts in BOTH: on its task assigned date (allocated) and on its
    # task END date (closed). The date range spans the two together, so the
    # page's calendar covers an SR whichever end of it falls in the period.
    allocs, closes = {}, {}              # (emp, iso date, head) -> count
    min_d = max_d = None
    for tkey, label, uid, _b, assigned, ended, sr_type in raw:
        ei = _employee(tkey, label, uid)
        hi = _head_of(sr_type)
        for d, bucket in ((assigned, allocs), (ended, closes)):
            if d is None:
                continue
            ck = (ei, d.isoformat(), hi)
            bucket[ck] = bucket.get(ck, 0) + 1
            if min_d is None or d < min_d:
                min_d = d
            if max_d is None or d > max_d:
                max_d = d

    # meta stays minimal: the page needs the date range to bound its calendar,
    # and the report warns when an EFSR UID is not in the SE UID Master. The
    # file-coverage counters were dropped with the report's footer.
    # Engineers with no KALA branch anywhere land in the Unmapped Branch bucket
    # (see _home above). No meta counter for them: the page names them from the
    # rows of the SELECTED period, so it never warns about an SR off screen.
    meta = {"min_date": min_d.isoformat() if min_d else None,
            "max_date": max_d.isoformat() if max_d else None,
            "unmastered": unmastered}

    if not allocs and not closes:
        return {"success": True, "meta": meta, "branches": [], "branch_ids": [],
                "branch_regions": [], "groups": [], "employees": [],
                "heads": heads, "alloc_records": [], "close_records": [],
                "open_records": []}

    # ---- OPEN SR (Open SR Load Report) — BRANCH WISE ONLY ------------------
    # Exactly two columns of that file are used, as specified:
    #   INSTANCE ID [Asset #]  -> the customer, whose BRANCH ID is the branch the
    #                             open SR is counted in (the file's own branch id
    #                             is blank on some rows, the customer's is not)
    #   SR CREATED DATE        -> the day it counts on, so the column follows the
    #                             report period and its date ticks
    # EVERY row of the file counts — the whole accumulated table, exactly as
    # before: the count is 'SRs open in this branch', not 'in today's upload'.
    # This grid deliberately does NOT apply the MaxTTR closed-SR check that the
    # customer SR Details box uses; its numbers must not change.
    # Grouped in SQL — one small result set instead of 11k rows over the network.
    open_counts = {}                     # (branch idx, iso created date) -> count
    for c_bid, created, n in (db.query(Customer.branch_id,
                                      cast(OpenSRLoadReport.sr_created_date, Date),
                                      func.count(OpenSRLoadReport.id))
                              .join(Customer,
                                    Customer.instance_id == OpenSRLoadReport.instance_id)
                              .filter(OpenSRLoadReport.sr_created_date.isnot(None))
                              .group_by(Customer.branch_id,
                                        cast(OpenSRLoadReport.sr_created_date, Date))
                              .all()):
        d = created.date() if isinstance(created, datetime) else created
        if d is None:
            continue
        ok_ = (_branch(c_bid), d.isoformat())
        open_counts[ok_] = open_counts.get(ok_, 0) + int(n or 0)

    # ---- branch groups (first column), same layout as EP -------------------
    groups, grouped = [], set()
    for g in EPR_BRANCH_GROUPS:
        members = [branch_idx[b] for b in g if b in branch_idx]
        if members:
            groups.append(members)
            grouped.update(members)
    for bi in range(len(branches)):
        if bi not in grouped:
            groups.append([bi])

    branch_regions = [aop_region.get(b) or erp_region.get(b) or "MH"
                      for b in branch_ids]
    alloc_records = sorted([ei, ds, hi, n] for (ei, ds, hi), n in allocs.items())
    close_records = sorted([ei, ds, hi, n] for (ei, ds, hi), n in closes.items())
    # [branchIdx, isoCreatedDate, count] — branch wise, no engineer dimension
    open_records = sorted([bi, ds, n] for (bi, ds), n in open_counts.items())

    return {"success": True, "meta": meta,
            "branches": branches, "branch_ids": branch_ids,
            "branch_regions": branch_regions, "groups": groups,
            "employees": employees, "heads": heads,
            "alloc_records": alloc_records, "close_records": close_records,
            "open_records": open_records}



# ---------------- SE DRILL-DOWN: the rows behind ONE engineer's figures ----- #
# Both reports print COUNTS per engineer; clicking the SE name opens the rows
# those counts were made of. Neither function is cached: the payload is one
# engineer over one period, it is only ever fetched on a click, and it must
# reflect the table the moment it is opened.
#
# The engineer is addressed exactly the way each report groups its rows, so a
# popup can never show a different population than the cell that opened it:
#   Employee Productivity  letters-only SE NAME **+ branch** (an engineer with
#                          rows in two branches is two report rows)
#   SR Allocation          letters-only engineer name alone (the report resolves
#                          every UID through the SE UID Master first, then keeps
#                          ONE row per person across their branches)

def _period_bounds(d_from, d_to):
    """The two ISO strings as dates, either side optional."""
    def _p(v):
        if not v:
            return None
        try:
            return datetime.strptime(str(v)[:10], "%Y-%m-%d").date()
        except ValueError:
            return None
    return _p(d_from), _p(d_to)


def _as_day(v):
    return v.date() if isinstance(v, datetime) else v


def _iso_dt(v):
    return v.isoformat() if v is not None else None


def _extra_of(raw):
    """An import row's DYNAMIC columns - every column of the source file that
    has no field of its own, kept as {original header: value} JSON. The popup
    prints them after the fixed ones, so the drill-down shows the whole row as
    the file delivered it and not only the part the report reads."""
    if not raw:
        return {}
    try:
        d = json.loads(raw)
    except (ValueError, TypeError):
        return {}
    return d if isinstance(d, dict) else {}


def ep_se_records(db: Session, name: str, branch_id: str = "",
                  d_from: str = "", d_to: str = "", allowed_branches=None):
    """Employee Productivity -> the CLOSE SR rows behind one engineer.

    Every 'Response Time & MaxTTR Details' row (response_time_maxttr, one row
    per SR NUMBER) that the report counted for this engineer in this period:
    it has a SR CLOSE DATE inside the period, an SE NAME that squashes to the
    engineer's, and a BRANCH ID that folds to the report row's branch.

    That is the same rule as _employee_productivity_data, so len(records) is
    the engineer's 'Total SR' for the period and the per-head tallies are its
    SR Type split. The SR Type head comes from the 'SR Type Master (MaxTTR)' —
    the master this report uses, NOT the EFSR one."""
    from app.models.customer_model import ResponseTimeMaxTTR

    lo, hi = _period_bounds(d_from, d_to)
    want_name = _tight(_name_key(name or ""))
    want_branch = _norm_branch_id(branch_id) or ""
    # The caller's branch scope (None = every branch, see
    # _scope_report_to_branches): the popup must never be a way to read an SR
    # of a branch the report itself would not have shown this user.
    scope = (None if allowed_branches is None
             else {_norm_branch_id(b) for b in allowed_branches
                   if str(b or "").strip()})

    # ---- SR TYPE -> head, the MaxTTR master ---------------------------------
    sr_head = {}
    for m in db.query(PmsMaxttrSrTypeMap).all():
        if m.sr_type:
            sr_head[_tight(m.sr_type)] = (m.head or "").strip()

    # ---- branch labels, and the same 'unknown code -> one bucket' fold ------
    aop_name = {}
    for t in db.query(PmsBranchTarget.branch_id, PmsBranchTarget.branch_name).distinct():
        bid = _norm_branch_id(t[0])
        if bid and t[1] and bid not in aop_name:
            aop_name[bid] = t[1].strip()
    erp_name = {b: n for _r, b, n in ERP_BRANCHES}
    known = set(aop_name) | set(erp_name)

    def _fold(bid):
        bid = _norm_branch_id(bid) or ""
        return bid if bid in known else UNMAPPED_BRANCH_ID

    # The engineer is a LETTERS-ONLY name, which SQL cannot match — but the
    # file's distinct spellings of it can be resolved first (114 names in a
    # 45k-row table) and handed to an IN(), so the popup reads a handful of
    # indexed rows instead of the whole period. Over the remote link that is
    # the difference between a click and a wait.
    spellings = [n for (n,) in db.query(distinct(ResponseTimeMaxTTR.se_name))
                 .filter(ResponseTimeMaxTTR.se_name.isnot(None),
                         ResponseTimeMaxTTR.se_name != "").all()
                 if _tight(_name_key(n)) == want_name]
    if not spellings:
        return {"success": True, "name": name, "branch_id": want_branch,
                "period": {"from": d_from, "to": d_to},
                "total": 0, "heads": [], "extra_columns": [], "records": []}

    q = db.query(ResponseTimeMaxTTR).filter(
        ResponseTimeMaxTTR.sr_close_date.isnot(None),
        ResponseTimeMaxTTR.se_name.in_(spellings))
    if lo:
        q = q.filter(ResponseTimeMaxTTR.sr_close_date >= datetime.combine(lo, datetime.min.time()))
    if hi:
        q = q.filter(ResponseTimeMaxTTR.sr_close_date < datetime.combine(hi + timedelta(days=1),
                                                                         datetime.min.time()))

    records, heads, extra_cols = [], {}, []
    for r in q.all():
        if _tight(_name_key(r.se_name)) != want_name:
            continue
        if want_branch and _fold(r.branch_id) != _fold(want_branch):
            continue
        if scope is not None and _fold(r.branch_id) not in scope:
            continue
        head = sr_head.get(_tight(r.sr_type or "")) or HEAD_UNMAPPED
        heads[head] = heads.get(head, 0) + 1
        bid = _norm_branch_id(r.branch_id)
        extra = _extra_of(r.extra_data)
        for k in extra:
            if k not in extra_cols:
                extra_cols.append(k)
        records.append({
            "sr_number": r.sr_number,
            "instance_id": r.instance_id,
            "account": r.account_name,
            "branch": (aop_name.get(bid) or erp_name.get(bid)
                       or (r.branch_name or "").strip() or bid or UNMAPPED_BRANCH_NAME),
            "branch_id": bid,
            "zone": r.zone_name,
            "asm_name": r.asm_name,
            "sd_id": r.sd_id,
            "sd_name": r.sd_name,
            "sr_type": r.sr_type,
            "sr_subtype": r.sr_subtype,
            "head": head,
            "segment": r.segment,
            "product_segment": r.product_segment,
            "goem_oem": r.goem_oem,
            "application_code": r.application_code,
            "engine_no": r.engine_serial_no,
            "sr_open_date": _iso_dt(r.sr_open_date),
            "task_start_date": _iso_dt(r.sr_task_start_date),
            "task_end_date": _iso_dt(r.sr_task_end_date),
            "close_date": _iso_dt(r.sr_close_date),
            "response_range": r.response_time_range_in_hrs,
            "response_time": r.response_time,
            "maxttr_task_hrs": r.maxttr_on_task_closed_in_hrs,
            "maxttr_sr_hrs": r.maxttr_on_sr_closed_in_hrs,
            "remarks": r.engineer_remarks,
            "se_name": r.se_name,
            "se_ticket": r.se_ticket_num,
            "extra": extra,
        })

    records.sort(key=lambda x: (x["close_date"] or "", x["sr_number"] or ""))
    return {"success": True, "name": name, "branch_id": want_branch,
            "period": {"from": d_from, "to": d_to},
            "total": len(records),
            "heads": sorted(heads.items(), key=lambda kv: (-kv[1], kv[0])),
            "extra_columns": extra_cols, "records": records}


def srar_engineer_in_branches(db: Session, name: str, allowed_branches) -> bool:
    """May a caller scoped to `allowed_branches` open this engineer's SR
    Allocation drill-down? (None = every branch, so always yes.)

    SR Allocation keeps ONE row per person across their branches, so the popup
    carries no branch of its own — the answer is the branch the report itself
    put the engineer in, read straight off the (cached) report payload so the
    popup can never disagree with the table that opened it."""
    if allowed_branches is None:
        return True
    data = sr_allocation_data(db)
    ids = data.get("branch_ids") or []
    ok = {_norm_branch_id(b) for b in allowed_branches if str(b or "").strip()}
    want = _tight(_name_key(name or ""))
    for e in data.get("employees") or []:
        if _tight(_name_key(e.get("n") or "")) != want:
            continue
        bi = e.get("b")
        return isinstance(bi, int) and 0 <= bi < len(ids) and ids[bi] in ok
    return False


def srar_se_records(db: Session, name: str, d_from: str = "", d_to: str = ""):
    """SR Allocation -> the ALLOCATED and CLOSED rows behind one engineer.

    Every EFSR appointment row (one row per dispatch — Appointment Number + SE
    UID + Task Assigned Date) of this engineer that touches the period on
    EITHER of its two dates, each one TAGGED with which of the report's two
    counts it fell into and why:

      both        assigned AND finished inside the period — counts once in
                  Allocated and once in Closed
      carry_in    finished inside the period but assigned BEFORE it — counts in
                  CLOSED ONLY. This is what makes Closed exceed Allocated.
      carry_out   assigned inside the period, finished AFTER it — counts in
                  ALLOCATED ONLY
      open        assigned inside the period, never finished — ALLOCATED ONLY

    so  Allocated = both + carry_out + open,  Closed = both + carry_in,  and
    Closed - Allocated = carry_in - (carry_out + open) is visible row by row.

    The engineer is resolved the way _sr_allocation_data resolves them: the SE
    UID Master turns the row's SERVICE ENGINEER UID into the canonical name, and
    a UID the master does not know keeps the file's own SE NAME. So this popup
    covers every UID the report folded into that one engineer row."""
    from app.models.customer_model import EFSRReport

    lo, hi = _period_bounds(d_from, d_to)
    want_name = _tight(_name_key(name or ""))

    # ---- SE UID MASTER (UID -> canonical name), same as the report ----------
    name_of_uid = {}
    for m in db.query(PmsSeUid).all():
        for u in _uid_list(m.se_uid):
            name_of_uid.setdefault(u.upper(), m.se_name)

    # ---- SR TYPE -> head, the EFSR master -----------------------------------
    head_map = {}
    for m in db.query(PmsEfsrSrTypeMap).all():
        if m.sr_type:
            head_map[_tight(m.sr_type)] = (m.head or "").strip()

    # Which UIDs the report folded into this ONE engineer row. Resolved from the
    # file's own (UID, SE NAME) pairs — a few dozen — exactly the way the report
    # resolves them, so a mastered engineer with two UIDs and an unmastered one
    # carrying only a file name both come out right. The UIDs then go into an
    # IN() with the date window, so the popup reads a handful of indexed rows
    # rather than the whole EFSR table.
    uids = []
    for uid, se_nm in (db.query(EFSRReport.service_engineer_uid,
                                EFSRReport.service_engineer_name)
                       .filter(EFSRReport.service_engineer_uid.isnot(None),
                               EFSRReport.service_engineer_uid != "")
                       .distinct().all()):
        ukey = (uid or "").strip().upper()
        label = name_of_uid.get(ukey) or (se_nm or "").strip() or ukey
        if _tight(_name_key(label)) == want_name and uid not in uids:
            uids.append(uid)
    if not uids:
        return {"success": True, "name": name,
                "period": {"from": d_from, "to": d_to},
                "allocated": 0, "closed": 0, "difference": 0,
                "tally": {"both": 0, "carry_in": 0, "carry_out": 0, "open": 0},
                "heads_allocated": [], "heads_closed": [],
                "extra_columns": [], "records": []}

    q = db.query(EFSRReport).filter(
        EFSRReport.service_engineer_uid.in_(uids),
        sa_or(EFSRReport.task_assigned_date.isnot(None),
              EFSRReport.task_end_date.isnot(None)))
    # A row is of interest when EITHER date lands in the window — that is what
    # makes carry-in (closed here, assigned earlier) and carry-out (assigned
    # here, closed later) both reachable from one query.
    if lo or hi:
        a_c = [EFSRReport.task_assigned_date.isnot(None)]
        c_c = [EFSRReport.task_end_date.isnot(None)]
        if lo:
            lo_dt = datetime.combine(lo, datetime.min.time())
            a_c.append(EFSRReport.task_assigned_date >= lo_dt)
            c_c.append(EFSRReport.task_end_date >= lo_dt)
        if hi:
            hi_dt = datetime.combine(hi + timedelta(days=1), datetime.min.time())
            a_c.append(EFSRReport.task_assigned_date < hi_dt)
            c_c.append(EFSRReport.task_end_date < hi_dt)
        q = q.filter(sa_or(sa_and(*a_c), sa_and(*c_c)))
    rows = q.all()

    def _in(d):
        if d is None:
            return False
        return (lo is None or d >= lo) and (hi is None or d <= hi)

    records, extra_cols = [], []
    tally = {"both": 0, "carry_in": 0, "carry_out": 0, "open": 0}
    heads_a, heads_c = {}, {}
    for r in rows:
        ukey = (r.service_engineer_uid or "").strip().upper()
        label = name_of_uid.get(ukey) or (r.service_engineer_name or "").strip() or ukey
        if _tight(_name_key(label)) != want_name:
            continue
        ad, ed = _as_day(r.task_assigned_date), _as_day(r.task_end_date)
        a_in, c_in = _in(ad), _in(ed)
        if not a_in and not c_in:
            continue                     # this row is outside the period entirely
        if a_in and c_in:
            tag = "both"
        elif c_in:
            tag = "carry_in"             # closed here, allocated in an earlier period
        elif ed is None:
            tag = "open"                 # allocated here, still not finished
        else:
            tag = "carry_out"            # allocated here, finished after the period
        tally[tag] += 1
        head = head_map.get(_tight(r.sr_type or "")) or HEAD_UNMAPPED
        if a_in:
            heads_a[head] = heads_a.get(head, 0) + 1
        if c_in:
            heads_c[head] = heads_c.get(head, 0) + 1
        extra = _extra_of(r.extra_data)
        for k in extra:
            if k not in extra_cols:
                extra_cols.append(k)
        records.append({
            "appointment_no": r.appointment_number,
            "sr_number": r.service_request_no,
            "instance_id": r.instance_id,
            "account": r.account,
            "customer_name": r.customer_name,
            "customer_contact": r.customer_contact_number,
            "site": r.installation_site_address,
            "branch_code": r.sd_branch_code,
            "sr_type": r.sr_type,
            "head": head,
            "sr_status": r.sr_status,
            "se_uid": r.service_engineer_uid,
            "se_name": r.service_engineer_name,
            "assigned_date": _iso_dt(r.task_assigned_date),
            "end_date": _iso_dt(r.task_end_date),
            "sr_closed_date": _iso_dt(r.sr_closed_date),
            "days": (ed - ad).days if (ad and ed) else None,
            "allocated_in": a_in,
            "closed_in": c_in,
            "tag": tag,
            "extra": extra,
        })

    records.sort(key=lambda x: (x["assigned_date"] or x["end_date"] or "",
                                x["appointment_no"] or ""))
    allocated = tally["both"] + tally["carry_out"] + tally["open"]
    closed = tally["both"] + tally["carry_in"]
    return {"success": True, "name": name,
            "period": {"from": d_from, "to": d_to},
            "allocated": allocated, "closed": closed,
            "difference": closed - allocated,
            "tally": tally,
            "heads_allocated": sorted(heads_a.items(), key=lambda kv: (-kv[1], kv[0])),
            "heads_closed": sorted(heads_c.items(), key=lambda kv: (-kv[1], kv[0])),
            "extra_columns": extra_cols, "records": records}


# ---------------- ANNUAL REPORTS ------------------------------------------- #
# One page, many yearly views (Service Penetration, AMC & Bandhan Projection,
# ...). Each gets its own data function; the page picks one from a dropdown and
# owns the reporting period, exactly like Employee Productivity.

# The asset master's SEGMENT column, in the order the report shows them. A
# segment outside this set (the file also carries a stray 'OWS') is not part of
# the population and is counted in meta.other_segment_rows instead. The Response
# Time file carries the SAME two values, so one list drives both halves.
SVC_PEN_SEGMENTS = ["IND", "PG"]

# An asset the ERP has RETIRED is not part of the installed base the sheet
# measures: reproducing the source workbook branch by branch needs the
# asset_detailed rows whose ASSET OPERATIONAL STATUS is 'Inactive' dropped and
# every other status ('Active', 'Reactive', blank) kept.
SVC_PEN_DEAD_STATUS = "INACTIVE"


def annual_service_penetration_data(db: Session):
    """Cached wrapper - see _annual_service_penetration_data."""
    return _cached(db, ("annual_svc_pen",),
                   lambda: _annual_service_penetration_data(db))


def _annual_service_penetration_data(db: Session):
    """'Service Penetration' (Annual Reports) - how much of the installed base
    was actually touched by a closed service call.

    POPULATION, the left half, is the ASSET DETAILED master:
      Ind Population   assets whose SEGMENT is IND
      PG Population    assets whose SEGMENT is PG
      Grand Total      the two added up
    Each asset counts once, in its own BRANCH ID, on its COMMISSIONING DATE, and
    the sheet reads the figure CUMULATIVELY - the installed base AS ON the end of
    the period, not what was commissioned inside it. Assets the ERP has retired
    (asset_operational_status 'Inactive') are out of it; an asset with no
    commissioning date cannot be placed on the calendar and is reported in
    meta.no_date_rows.

    UNQ AST SR CLOSED, the middle, is the RESPONSE TIME & MaxTTR file: the
    number of DISTINCT ASSETS that had at least one SR CLOSED inside the period,
    per branch and segment. Unique means unique - an asset with five closed SRs
    counts ONCE. An asset is identified by its INSTANCE ID (its ENGINE SERIAL NO
    when the row carries no instance id) and counted under the branch and
    segment ITS OWN SR ROW names, so nothing is lost when the asset master has
    not caught up with the asset yet.

    PEN %, the right half, is closed / population x 100 - per segment and for
    the two together. It is not stored: the page divides the two halves it
    already holds.

    A distinct-asset count cannot be added up day by day the way a population
    can, so the SR half ships ONE ROW PER ASSET carrying the days it was
    serviced on - sr_records[[branchIdx, segmentIdx, day, day, ...]], each day an
    offset in days from meta.sr_day0. The page counts the rows with at least one
    day inside the period, so every period is exact and still needs no refetch.

    Branch rows are the KALA branches in master order (MH block, then KA), so
    the report can close each block with its own total; a branch id no master
    knows folds into the Unmapped Branch bucket rather than growing a ghost row.

    Payload: records[[branchIdx, isoCommissioningDate, segmentIdx, count]] for
    the population and sr_records as above for the serviced assets - both raw,
    so any period re-aggregates client-side without a refetch."""
    from app.models.customer_model import AssetDetailed, ResponseTimeMaxTTR

    aop_name, aop_region = {}, {}
    for t in db.query(PmsBranchTarget.branch_id, PmsBranchTarget.branch_name,
                      PmsBranchTarget.region).distinct():
        bid = _norm_branch_id(t[0])
        if not bid:
            continue
        if t[1] and bid not in aop_name:
            aop_name[bid] = t[1].strip()
        if t[2] and bid not in aop_region:
            aop_region[bid] = t[2].strip().upper()
    erp_region = {b: r for r, b, _n in ERP_BRANCHES}
    erp_name = {b: n for _r, b, n in ERP_BRANCHES}

    # Every KALA branch gets a row even with no assets in the period, in the
    # master's own order - the sheet lists all of them, MH first.
    branch_idx, branches, branch_ids = {}, [], []

    def _branch(bid):
        bid = _norm_branch_id(bid) or ""
        if bid not in aop_name and bid not in erp_name:
            bid = UNMAPPED_BRANCH_ID
        if bid not in branch_idx:
            branch_idx[bid] = len(branches)
            branches.append(aop_name.get(bid) or erp_name.get(bid)
                            or UNMAPPED_BRANCH_NAME)
            branch_ids.append(bid)
        return branch_idx[bid]

    for _r, b, _n in ERP_BRANCHES:
        _branch(b)
    # Parbhani (420435_7) is not in the ERP list but IS an AOP master branch -
    # every other master branch gets its row too, in natural order.
    for b in sorted(set(aop_name) - set(branch_idx), key=_branch_sort_key):
        _branch(b)

    seg_idx = {s: i for i, s in enumerate(SVC_PEN_SEGMENTS)}

    # ---- population: the live installed base, per commissioning day ---------
    _status = func.upper(func.ltrim(func.rtrim(
        AssetDetailed.asset_operational_status)))
    rows = (db.query(AssetDetailed.branch_id, AssetDetailed.segment,
                     cast(AssetDetailed.commissioning_date, Date),
                     func.count(AssetDetailed.id))
            .filter(sa_or(AssetDetailed.asset_operational_status.is_(None),
                          _status != SVC_PEN_DEAD_STATUS))
            .group_by(AssetDetailed.branch_id, AssetDetailed.segment,
                      cast(AssetDetailed.commissioning_date, Date))
            .all())
    retired_rows = int(db.query(func.count(AssetDetailed.id))
                       .filter(AssetDetailed.asset_operational_status.isnot(None),
                               _status == SVC_PEN_DEAD_STATUS)
                       .scalar() or 0)

    counts = {}                          # (branch, iso date, segment) -> count
    min_d = max_d = None
    no_date_rows = other_seg_rows = 0
    for bid, seg, comm, n in rows:
        n = int(n or 0)
        si = seg_idx.get((seg or "").strip().upper())
        if si is None:
            other_seg_rows += n          # 'OWS' and friends: not the population
            continue
        d = comm.date() if isinstance(comm, datetime) else comm
        if d is None:
            no_date_rows += n            # no commissioning date -> no period
            continue
        key = (_branch(bid), d.isoformat(), si)
        counts[key] = counts.get(key, 0) + n
        if min_d is None or d < min_d:
            min_d = d
        if max_d is None or d > max_d:
            max_d = d

    # ---- serviced assets: one row per asset, the days it was closed on ------
    sr_rows = (db.query(ResponseTimeMaxTTR.branch_id, ResponseTimeMaxTTR.segment,
                        ResponseTimeMaxTTR.instance_id,
                        ResponseTimeMaxTTR.engine_serial_no,
                        cast(ResponseTimeMaxTTR.sr_close_date, Date),
                        func.count(ResponseTimeMaxTTR.id))
               .filter(ResponseTimeMaxTTR.sr_close_date.isnot(None))
               .group_by(ResponseTimeMaxTTR.branch_id, ResponseTimeMaxTTR.segment,
                         ResponseTimeMaxTTR.instance_id,
                         ResponseTimeMaxTTR.engine_serial_no,
                         cast(ResponseTimeMaxTTR.sr_close_date, Date))
               .all())

    asset_days = {}                      # (branch, segment, asset) -> {dates}
    sr_min = sr_max = None
    sr_other_seg = sr_no_asset = sr_closed_rows = 0
    for bid, seg, inst, esn, closed, n in sr_rows:
        n = int(n or 0)
        si = seg_idx.get((seg or "").strip().upper())
        if si is None:
            sr_other_seg += n            # a segment the population does not have
            continue
        d = closed.date() if isinstance(closed, datetime) else closed
        if d is None:
            continue
        asset = (inst or "").strip() or (esn or "").strip()
        if not asset:
            sr_no_asset += n             # nothing to count the asset BY
            continue
        asset_days.setdefault((_branch(bid), si, asset), set()).add(d)
        sr_closed_rows += n
        if sr_min is None or d < sr_min:
            sr_min = d
        if sr_max is None or d > sr_max:
            sr_max = d

    # Days as offsets from the first close date - one small int per service call
    # instead of a 10-character date, and the page compares ints.
    sr_records = (sorted([bi, si] + sorted((d - sr_min).days for d in days)
                         for (bi, si, _a), days in asset_days.items())
                  if sr_min else [])

    # SRs the file has not closed yet sit outside every period.
    sr_open_rows = int(db.query(func.count(ResponseTimeMaxTTR.id))
                       .filter(ResponseTimeMaxTTR.sr_close_date.is_(None))
                       .scalar() or 0)

    branch_regions = [aop_region.get(b) or erp_region.get(b) or "MH"
                      for b in branch_ids]
    records = sorted([bi, ds, si, n] for (bi, ds, si), n in counts.items())

    # The period picker clamps to min_date / max_date, and the sheet reads TWO
    # files: an SR closed after the last commissioning date (the usual case -
    # the asset master is a snapshot, the SR file is a month) must stay
    # reachable, so the reported range spans both.
    span = [d for d in (min_d, max_d, sr_min, sr_max) if d]

    return {"success": True,
            "meta": {"min_date": min(span).isoformat() if span else None,
                     "max_date": max(span).isoformat() if span else None,
                     "asset_min_date": min_d.isoformat() if min_d else None,
                     "asset_max_date": max_d.isoformat() if max_d else None,
                     "no_date_rows": no_date_rows,
                     "other_segment_rows": other_seg_rows,
                     "retired_rows": retired_rows,
                     "counted_rows": sum(counts.values()),
                     "sr_day0": sr_min.isoformat() if sr_min else None,
                     "sr_min_date": sr_min.isoformat() if sr_min else None,
                     "sr_max_date": sr_max.isoformat() if sr_max else None,
                     "sr_open_rows": sr_open_rows,
                     "sr_other_segment_rows": sr_other_seg,
                     "sr_no_asset_rows": sr_no_asset,
                     "sr_closed_rows": sr_closed_rows,
                     "sr_assets": len(asset_days)},
            "segments": SVC_PEN_SEGMENTS,
            "branches": branches, "branch_ids": branch_ids,
            "branch_regions": branch_regions, "records": records,
            "sr_records": sr_records}


# ============================================================================
# ANNUAL REPORTS -> CUSTOMER DELIGHT INDEX (CDI)
# ============================================================================
# The CDI Detail Report is the ONLY PMS import that carries no BRANCH ID - it
# names its branch ('KALA Care Global LLP - Ahmednagar') and nothing else. The
# rest of the ERP files carry BOTH the id and that same name, so the name ->
# id map is built FROM THEM rather than from a hardcoded alias list: when the
# ERP renames a branch the map follows on the next upload, with no code change.
# The AOP master's own spelling ('Ahilyanagar') is registered against the same
# id as well, so either wording resolves.

_CDI_NAME_PREFIX = re.compile(r"^\s*KALA\s*CARE\s*GLOBAL\s*LLP\s*[-–]\s*", re.I)


def _branch_name_key(name) -> str:
    """Branch NAME -> lookup key: the dealer prefix dropped, letters and digits
    only. 'KALA Care Global LLP - Ahmednagar' and 'ahmednagar' both key to
    'AHMEDNAGAR'."""
    s = _CDI_NAME_PREFIX.sub("", str(name or "").strip())
    return re.sub(r"[^A-Z0-9]+", "", s.upper())


def _branch_by_name(db: Session) -> dict:
    """{branch name key -> branch id} from every table that carries the pair.

    A branch two files spell differently keeps BOTH spellings pointing at the
    one id; the AOP master and the ERP list are added last as the fallback for
    a branch no upload has mentioned yet."""
    from app.models.customer_model import AssetDetailed, ResponseTimeMaxTTR

    out = {}

    def _put(name, bid):
        key = _branch_name_key(name)
        bid = _norm_branch_id(bid)
        if key and bid:
            out.setdefault(key, bid)

    pairs = []
    for model in (ResponseTimeMaxTTR, AssetDetailed):
        pairs += (db.query(model.branch_name, model.branch_id)
                  .filter(model.branch_id.isnot(None),
                          model.branch_name.isnot(None))
                  .distinct().all())
    pairs += (db.query(PmsSalesRecord.branch_name, PmsSalesRecord.branch_id)
              .filter(PmsSalesRecord.branch_id.isnot(None),
                      PmsSalesRecord.branch_name.isnot(None))
              .distinct().all())
    for name, bid in pairs:
        _put(name, bid)

    for bid, name in db.query(PmsBranchTarget.branch_id,
                              PmsBranchTarget.branch_name).distinct():
        _put(name, bid)
    for _r, bid, name in ERP_BRANCHES:
        _put(name, bid)
    return out


def _cdi_targets_map(db: Session) -> dict:
    """Every saved CDI AOP target as {'fy|scope|key': pct} - the flat shape the
    report reads, so one payload covers whichever FY the page lands on."""
    return {"{}|{}|{}".format(t.fy, t.scope, t.scope_key): t.target_pct
            for t in db.query(PmsCdiTarget).all()
            if t.target_pct is not None}


def annual_cdi_data(db: Session):
    """Cached wrapper - see _annual_cdi_data."""
    return _cached(db, ("annual_cdi",), lambda: _annual_cdi_data(db))


def _annual_cdi_data(db: Session):
    """'Customer Delight Index (CDI)' (Annual Reports) - the CDI DETAIL REPORT.

    Every feedback row falls in one of three buckets, read off its
    'CDI CATEGORY': Promotor(09-10), Detractor(00 - 06), everything else
    Passive. The score of any set of rows is then

        CDI % = (Promotor - Detractor) / (Promotor + Passive + Detractor) x 100

    counted on ACTIVITY END DATE and grouped by the file's BRANCH NAME, which
    is resolved to a branch id through _branch_by_name(). Feedback whose branch
    no master knows folds into the Unmapped Branch bucket instead of growing a
    ghost row, and rows with no activity end date cannot be placed on the
    calendar at all - both are reported in meta.

    The payload stays RAW per-day - records[[branchIdx, isoActivityEndDate,
    bucketIdx, count]] - so the page recomputes the FY cumulatives, the month
    columns and the working month's weeks client-side without a refetch. The
    AOP percentages of every saved FY ride along in `targets`."""
    from app.models.customer_model import CDIDetailReport

    aop_name, aop_region = {}, {}
    for t in db.query(PmsBranchTarget.branch_id, PmsBranchTarget.branch_name,
                      PmsBranchTarget.region).distinct():
        bid = _norm_branch_id(t[0])
        if not bid:
            continue
        if t[1] and bid not in aop_name:
            aop_name[bid] = t[1].strip()
        if t[2] and bid not in aop_region:
            aop_region[bid] = t[2].strip().upper()
    erp_region = {b: r for r, b, _n in ERP_BRANCHES}
    erp_name = {b: n for _r, b, n in ERP_BRANCHES}

    # Every KALA branch gets a row even with no feedback in the period, in the
    # master's own order - the sheet lists all of them, MH first.
    branch_idx, branches, branch_ids = {}, [], []

    def _branch(bid):
        bid = _norm_branch_id(bid) or ""
        if bid not in aop_name and bid not in erp_name:
            bid = UNMAPPED_BRANCH_ID
        if bid not in branch_idx:
            branch_idx[bid] = len(branches)
            branches.append(aop_name.get(bid) or erp_name.get(bid)
                            or UNMAPPED_BRANCH_NAME)
            branch_ids.append(bid)
        return branch_idx[bid]

    for _r, b, _n in ERP_BRANCHES:
        _branch(b)
    # Parbhani (420435_7) is not in the ERP list but IS an AOP master branch -
    # every other master branch gets its row too, in natural order.
    for b in sorted(set(aop_name) - set(branch_idx), key=_branch_sort_key):
        _branch(b)

    by_name = _branch_by_name(db)
    rows = (db.query(CDIDetailReport.branch_name,
                     cast(CDIDetailReport.activity_end_date, Date),
                     CDIDetailReport.cdi_category,
                     func.count(CDIDetailReport.id))
            .filter(CDIDetailReport.activity_end_date.isnot(None))
            .group_by(CDIDetailReport.branch_name,
                      cast(CDIDetailReport.activity_end_date, Date),
                      CDIDetailReport.cdi_category)
            .all())

    counts = {}                          # (branch, iso date, bucket) -> count
    min_d = max_d = None
    unmapped_rows = 0
    for name, ended, cat, n in rows:
        n = int(n or 0)
        d = ended.date() if isinstance(ended, datetime) else ended
        if d is None:
            continue
        bid = by_name.get(_branch_name_key(name))
        if not bid:
            unmapped_rows += n           # a branch no master knows - visible gap
        key = (_branch(bid), d.isoformat(), _cdi_bucket(cat))
        counts[key] = counts.get(key, 0) + n
        if min_d is None or d < min_d:
            min_d = d
        if max_d is None or d > max_d:
            max_d = d

    # Feedback with no ACTIVITY END DATE sits outside every period.
    no_date_rows = int(db.query(func.count(CDIDetailReport.id))
                       .filter(CDIDetailReport.activity_end_date.is_(None))
                       .scalar() or 0)

    branch_regions = [aop_region.get(b) or erp_region.get(b) or "MH"
                      for b in branch_ids]
    records = sorted([bi, ds, ci, n] for (bi, ds, ci), n in counts.items())

    return {"success": True,
            "meta": {"min_date": min_d.isoformat() if min_d else None,
                     "max_date": max_d.isoformat() if max_d else None,
                     "no_date_rows": no_date_rows,
                     "unmapped_branch_rows": unmapped_rows,
                     "counted_rows": sum(counts.values())},
            "categories": CDI_BUCKETS,
            "branches": branches, "branch_ids": branch_ids,
            "branch_regions": branch_regions, "records": records,
            "targets": _cdi_targets_map(db)}


# ---------------- AOP MASTER: CDI TARGETS ---------------- #

CDI_TARGET_SCOPES = {"branch", "region", "overall"}


def list_cdi_targets(db: Session, fy_start: int):
    """The CDI Target tab of the AOP Master: one row per branch of the Customer
    Delight Index report, plus its MH / KA region rows and the overall row.
    Branch rows come from the same branch list the Target Master tab uses, so
    the two tabs can never show different branches - the Target Master's own
    saved name and region win, since those are the ones a user has edited."""
    branches = {b: dict(info) for b, info in _profile_branches(db).items()}
    for bid, name, region in db.query(PmsBranchTarget.branch_id,
                                      PmsBranchTarget.branch_name,
                                      PmsBranchTarget.region).distinct():
        bid = _norm_branch_id(bid)
        if not bid or bid == "HO":
            continue
        info = branches.setdefault(bid, {"region": None, "name": None})
        if name:
            info["name"] = name.strip()
        if region:
            info["region"] = region.strip().upper()

    rows = [{"scope": "branch", "key": b,
             "name": info.get("name") or b,
             "region": (info.get("region") or "MH").upper(),
             "target_pct": None}
            for b, info in sorted(branches.items(),
                                  key=lambda kv: _branch_sort_key(kv[0]))]

    saved = {(t.scope, t.scope_key): t.target_pct
             for t in db.query(PmsCdiTarget).filter(PmsCdiTarget.fy == fy_start).all()}
    for r in rows:
        r["target_pct"] = saved.get(("branch", r["key"]))

    return {
        "fy": fy_start,
        "items": rows,
        "regions": [{"scope": "region", "key": rg,
                     "target_pct": saved.get(("region", rg))}
                    for rg in ("MH", "KA")],
        "overall": {"scope": "overall", "key": "ALL",
                    "target_pct": saved.get(("overall", "ALL"))},
    }


def save_cdi_targets(db: Session, fy_start: int, items: list, user_id: str):
    """Upsert the FY's CDI targets. A blank / non-numeric value DELETES the row
    - the report then shows no AOP for it rather than a target of 0%."""
    existing = {(t.scope, t.scope_key): t
                for t in db.query(PmsCdiTarget).filter(PmsCdiTarget.fy == fy_start).all()}
    saved = removed = 0
    for it in items or []:
        scope = str(it.get("scope") or "").strip().lower()
        if scope not in CDI_TARGET_SCOPES:
            continue
        key = str(it.get("key") or "").strip()[:60]
        if scope == "branch":
            key = _norm_branch_id(key)
        elif scope == "region":
            key = key.upper()
        else:
            key = "ALL"
        if not key:
            continue

        raw = it.get("target_pct")
        try:
            pct = None if raw in (None, "") else round(float(raw), 2)
        except (TypeError, ValueError):
            pct = None
        row = existing.get((scope, key))

        if pct is None:
            if row:
                db.delete(row)
                del existing[(scope, key)]
                removed += 1
            continue
        pct = max(0.0, min(100.0, pct))
        if not row:
            row = PmsCdiTarget(fy=fy_start, scope=scope, scope_key=key,
                               created_by=user_id)
            db.add(row)
            existing[(scope, key)] = row
        row.target_pct = pct
        row.updated_by = user_id
        saved += 1

    db.commit()
    return {"success": True, "saved": saved, "removed": removed,
            **list_cdi_targets(db, fy_start)}


# ============================================================================
# ANNUAL REPORTS -> AMC & BANDHAN PROJECTION
# ============================================================================
# D/BAMC = DEALER AMC + BANDHAN AMC. The AMC Population Report carries seven
# AGREEMENT TYPEs and only some of them are this report's business:
#
#   counted    KOEL Bandhan / KOEL Bandhan Plus / Bandhan Premium   (BAMC)
#              KOEL Anubandhan Plus / KOEL Anubandhan IV+           (BAMC too -
#                                     added 2026-08-20 on the business's word)
#              Dealer Agreement                                     (DAMC)
#   left out   KOEL Agreement        - KOEL's own agreement, not the dealer's
#
# Only ACTIVE agreements count (AGREEMENT STATUS) - a cancelled or lapsed row is
# not business done. Every row in the file carries 'Active' today, so this
# changes no number now; it stops a future file from quietly adding one.
#
# The type split is not a guess. Counted this way on AGREEMENT START DATE, Apr-Jun
# 2026 comes to 357 against the 358 the business's own sheet prints; counting
# every type gives 543, and dropping Dealer Agreement gives 355. The Anubandhan
# pair is 14 rows and none fall in that window, so the tie-up is unaffected.
#
# WHAT THIS CAN AND CANNOT COUNT. amc_agreements is a SNAPSHOT keyed on INSTANCE
# ID: one row per genset, always its LATEST agreement, upserted on every upload.
# So a renewal OVERWRITES the agreement it replaced and a closed year's sales
# leak away month by month - FY26 counts 937 from today's file against the 1,353
# the business closed it with, and reading last_agreement_* (one step back) only
# recovers 1,086. The CURRENT year's actuals are sound; a CLOSED year's are not,
# which is exactly why 'F26 ACT' is typed into the AOP master (PmsAmcTarget)
# rather than counted here.
DBAMC_TYPES = ["KOEL Bandhan", "KOEL Bandhan Plus", "Bandhan Premium",
               "KOEL Anubandhan Plus", "KOEL Anubandhan IV+",
               "Dealer Agreement"]
# Matched on letters and digits only, so spacing or case in the file cannot drop
# an agreement out of the count.
_DBAMC_KEYS = {re.sub(r"[^A-Z0-9]+", "", t.upper()) for t in DBAMC_TYPES}


def _dbamc_key(agreement_type) -> str:
    return re.sub(r"[^A-Z0-9]+", "", str(agreement_type or "").upper())


def _is_active(status) -> bool:
    """AGREEMENT STATUS is 'Active'. Read loosely (case and spacing), so only a
    genuinely different status - Cancelled, Expired - is left out."""
    return re.sub(r"[^A-Z]+", "", str(status or "").upper()) == "ACTIVE"


def _amc_targets_map(db: Session) -> dict:
    """Every saved AMC AOP row as {'fy|branch': {proj, prior}} - flat, so one
    payload covers whichever financial year the report lands on."""
    out = {}
    for t in db.query(PmsAmcTarget).all():
        bid = _norm_branch_id(t.branch_id)
        if not bid:
            continue
        out["{}|{}".format(t.fy, bid)] = {
            "proj": t.proj_nos,
            # The ONLY figure the last-FY column prints. Empty until set - the
            # counted one below is offered in the master, never printed by itself.
            "prior": t.prior_nos,
            "prior_by": t.prior_by,
            "prior_at": t.prior_at.isoformat() if t.prior_at else None,
            "best": t.best_nos,
        }
    return out


def annual_amc_bandhan_data(db: Session):
    """Cached wrapper - see _annual_amc_bandhan_data."""
    return _cached(db, ("annual_amc_bandhan",),
                   lambda: _annual_amc_bandhan_data(db))


def _annual_amc_bandhan_data(db: Session):
    """'AMC & Bandhan Projection' (Annual Reports).

    TWO SOURCES, because the sheet asks two different questions, and one file
    cannot answer both.

    1. LIVE AMC - 'F27 YTD ACT AMC NOS'. From the AMC Population Report: every
       agreement stamped Active, of every type EXCEPT 'KOEL Agreement', which is
       KOEL's own cover and gets a row of its own under the total. A POPULATION,
       so NO date filter of any kind applies - not the financial year, not the
       month picked, and not the agreement's own end date. That last one is
       deliberate: filtering on it read 2,077 against the 2,088 Active rows the
       business counts in the file itself.

    2. THE MONTH'S BUSINESS - the last column. From the four Bandhan QUOTE
       files (Anubandhan Plus, Anubandhan, Bandhan Plus, Regular Bandhan), on
       PAYMENT UPDATE DATE AND TIME, one row per quote, branch wise. A month's
       business is money received, not cover starting - and this is the source
       that ties up: Mar-26 145, Apr-26 105, Jun-26 104 against the business's
       own 144 / 108 / 106, where the agreements' start months are 15-30 out.
       This is the ONLY column the month picker moves.

    The two ship differently, because they answer differently. The population is
    ONE NUMBER per branch (active_nos) - it has no month, so there is no series
    to ship. The payments ship as RAW MONTHLY COUNTS, pay_records
    [[branchIdx, 'YYYY-MM', count]], so the report re-reads any month without a
    refetch. A quote never paid has no month to sit in and is reported in meta
    rather than dropped silently.

    THE OTHER THREE COLUMNS CANNOT BE COUNTED AT ALL. Last year's actual, the AOP
    projection and the year's best month all ride along in `targets`, from the
    AOP master - every one of them a figure the business asserts. Nothing here
    seeds, raises or back-fills any of them.

    Branch rows are the KALA branches in master order (MH block, then KA), the
    same list the Service Penetration sheet builds, so a branch with nothing in
    the period still gets its row."""
    from app.models.customer_model import (AMCAgreement, AnubandhanPlusQuote,
                                            AnubandhanQuote, BandhanPlusQuote,
                                            RegularBandhan)

    # ---- branch rows: the master list, MH then KA --------------------------
    aop_name, aop_region = {}, {}
    for t in db.query(PmsBranchTarget.branch_id, PmsBranchTarget.branch_name,
                      PmsBranchTarget.region).distinct():
        bid = _norm_branch_id(t[0])
        if not bid or bid == "HO":
            continue
        if t[1] and bid not in aop_name:
            aop_name[bid] = t[1].strip()
        if t[2] and bid not in aop_region:
            aop_region[bid] = t[2].strip().upper()
    erp_region = {b: r for r, b, _n in ERP_BRANCHES}
    erp_name = {b: n for _r, b, n in ERP_BRANCHES}

    branch_idx, branches, branch_ids = {}, [], []

    def _branch(bid):
        bid = _norm_branch_id(bid) or ""
        if bid not in aop_name and bid not in erp_name:
            bid = UNMAPPED_BRANCH_ID
        if bid not in branch_idx:
            branch_idx[bid] = len(branches)
            branches.append(aop_name.get(bid) or erp_name.get(bid)
                            or UNMAPPED_BRANCH_NAME)
            branch_ids.append(bid)
        return branch_idx[bid]

    for _r, b, _n in ERP_BRANCHES:
        _branch(b)
    for b in sorted(set(aop_name) - set(branch_idx), key=_branch_sort_key):
        _branch(b)

    # ---- the agreements ----------------------------------------------------
    # ~2,400 rows today, so the type filter and the month bucketing are done in
    # Python: SQL Server would have to be told how to fold 'KOEL  Bandhan' onto
    # 'KOEL Bandhan', which is exactly what _dbamc_key already does.
    rows = db.query(AMCAgreement.branch_id, AMCAgreement.agreement_type,
                    AMCAgreement.agreement_end_date,
                    AMCAgreement.agreement_status).all()

    # THE AMC COLUMN IS A POPULATION, NOT A PERIOD: how many agreements is this
    # branch actually covering. ONE test, and no date filter of ANY kind - not
    # the financial year, not the month picked above, and not the agreement's own
    # end date:
    #
    #   AGREEMENT STATUS is Active     the ERP has not cancelled it
    #
    # An earlier version also required AGREEMENT END DATE >= today, which read
    # 2,077 against the 2,088 Active rows the business counts in the file itself.
    # Those 11 are stamped Active with an end date already past, and the business
    # counts them: ACTIVE is the ERP's own word for it, and second-guessing it
    # here made the column disagree with the file anyone would check it against.
    # The tally rides along in meta.active_past_end so the disagreement inside
    # the file is still visible - it is just no longer acted on.
    #
    # Every agreement TYPE counts - the column is AMC, not D/BAMC - EXCEPT
    # 'KOEL Agreement', which gets a row of its own under the total. It is KOEL's
    # own corporate cover, sold by KOEL rather than by any branch of this
    # dealership, so putting it on a branch would credit that branch with
    # business it did not do. It is counted OVERALL instead, and the GRAND TOTAL
    # under it adds the two back together - so the sheet still ends on the whole
    # live population, with the part the branches own shown separately.
    # The type mix rides along in meta.by_type so the total can still be broken
    # down whichever way.
    today = now_ist().date()
    active = {}                        # branchIdx -> live agreements
    by_type = {}                       # agreement type -> rows counted
    not_active = 0
    expired = 0
    counted = 0
    koel_active = 0                    # 'KOEL Agreement' rows, company-wide
    for bid, atype, end, status in rows:
        if not _is_active(status):
            not_active += 1            # cancelled by the ERP
            continue
        e = end.date() if isinstance(end, datetime) else end
        if e is not None and e < today:
            expired += 1               # Active, but its end date has passed:
                                       # COUNTED, only tallied - see above
        label = str(atype or "").strip() or "(blank)"
        by_type[label] = by_type.get(label, 0) + 1
        if _dbamc_key(atype) == _dbamc_key(KOEL_AGREEMENT_TYPE):
            koel_active += 1           # its own row, not any branch's
            continue
        bi = _branch(bid)
        active[bi] = active.get(bi, 0) + 1
        counted += 1

    # ---- the MONTH column: the four Bandhan quote files -------------------
    # A month's business is a PAYMENT, not an agreement start, and the payment
    # lives in the quote files - Anubandhan Plus, Anubandhan, Bandhan Plus and
    # Regular Bandhan - on their PAYMENT UPDATE DATE AND TIME. One row per
    # quote, counted branch wise.
    #
    # A different source from the agreements above ON PURPOSE, and it is the one
    # that ties up: on payment-update month these four files give Mar-26 145,
    # Apr-26 105, Jun-26 104 against the business's own 144 / 108 / 106, while
    # the agreements' start-date months are 15-30 out. It also does not decay -
    # a quote row is history, one per quote, where amc_agreements keeps only
    # each genset's LATEST agreement.
    #
    # NO STATUS FILTER: payment_update_date_time is only ever stamped when a
    # payment is processed, so the column IS the filter. Narrowing it to
    # 'Payment Success' drops the refunds and short payments the business still
    # counts, and fits its numbers worse (139 / 100 / 100).
    #
    # THE BRANCH COMES FROM THE CITY, not from the row's branch_id: these files
    # are KOEL's, and their branch column knows KOEL's structure rather than this
    # dealership's. The city -> branch list is TYPED by the business in the AOP
    # master's City Master; a city nobody has mapped yet goes to the Unmapped
    # Branch row and is named in meta.pay_unmapped_cities - never guessed.
    city_branch = _quote_city_map(db)
    pay = {}                           # (branchIdx, 'YYYY-MM') -> n
    pay_rows = 0
    pay_no_date = 0
    pay_unmapped = {}                  # city -> paid quotes it could not place
    pay_min = pay_max = None
    for model in (AnubandhanPlusQuote, AnubandhanQuote,
                  BandhanPlusQuote, RegularBandhan):
        for city, when in db.query(model.city,
                                   model.payment_update_date_time).all():
            pay_rows += 1
            d = when.date() if isinstance(when, datetime) else when
            if d is None:
                pay_no_date += 1       # never paid: no month to count it in
                continue
            m = "{:04d}-{:02d}".format(d.year, d.month)
            b = city_branch.get(_quote_city_key(city))
            if b is None:
                label = str(city or "").strip() or "(blank)"
                pay_unmapped[label] = pay_unmapped.get(label, 0) + 1
            key = (_branch(b if b else UNMAPPED_BRANCH_ID), m)
            pay[key] = pay.get(key, 0) + 1
            if pay_min is None or m < pay_min:
                pay_min = m
            if pay_max is None or m > pay_max:
                pay_max = m
    pay_records = sorted([bi, m, n] for (bi, m), n in pay.items())

    branch_regions = [aop_region.get(b) or erp_region.get(b) or "MH"
                      for b in branch_ids]

    # ONE financial year, and it is always the CURRENT one - read off today, not
    # off the data. The sheet is 'this year against its AOP', so it must open on
    # the running year even in the first days of April when no agreement has
    # started yet; deriving it from the last agreement month would have kept the
    # report a year behind until the first upload of the new year landed.
    fy = today.year if today.month >= 4 else today.year - 1

    # Keep what was counted. Writing inside a read is deliberate and safe here:
    # this builder only runs when the underlying data has actually changed (see
    # _cached), which is exactly when a stored figure could need moving.


    def _first(m):
        return "{}-01".format(m) if m else None

    def _last(m):
        if not m:
            return None
        y, mm = int(m[:4]), int(m[5:7])
        return "{}-{:02d}".format(m, calendar.monthrange(y, mm)[1])

    # The month picker walks the PAYMENT months, so the reported span is theirs:
    # the agreements no longer carry one, having no date filter of their own.
    return {"success": True,
            "meta": {"min_date": _first(pay_min), "max_date": _last(pay_max),
                     "min_month": pay_min, "max_month": pay_max,
                     "fy": fy,
                     "counted": counted,
                     "not_active": not_active,
                     # Active rows whose end date has already passed. COUNTED in
                     # the column - this is a tally, not a filter.
                     "active_past_end": expired,
                     "as_on": today.isoformat(),
                     "agreement_rows": len(rows),
                     "by_type": by_type,
                     # the month column's own source and span
                     "pay_min_month": pay_min, "pay_max_month": pay_max,
                     "pay_rows": pay_rows, "pay_no_date": pay_no_date,
                     "pay_files": ["Anubandhan Plus", "Anubandhan",
                                   "Bandhan Plus", "Regular Bandhan"],
                     # cities the territory list has never been told about, so a
                     # missing territory reads as a number to chase
                     "pay_unmapped_cities": pay_unmapped,
                     # how many cities the business has mapped so far, so the
                     # report can say 'nobody has filled the City Master in yet'
                     # rather than looking simply broken
                     "cities_mapped": len(city_branch),
                     "koel_agreement_type": KOEL_AGREEMENT_TYPE},
            "branches": branches, "branch_ids": branch_ids,
            "branch_regions": branch_regions,
            # live agreements per branch - the AMC column. One number each: no
            # month series, because no date filter applies to it.
            "active_nos": [active.get(i, 0) for i in range(len(branch_ids))],
            # live 'KOEL Agreement' rows - its own row under the total, because
            # KOEL sells them, not any branch of this dealership
            "koel_active": koel_active,
            # quote PAYMENTS by payment-update month - the month column
            "pay_records": pay_records,
            "targets": _amc_targets_map(db)}



# ---------------- AOP MASTER: QUOTE CITY MASTER ---------------- #

def list_quote_cities(db: Session):
    """Every city the four Bandhan quote files mention, with how much business
    sits on it and the branch it has been mapped to.

    The list is built FROM THE FILES, not typed: the business picks a branch for
    each city rather than having to know which cities the files contain. Cities
    with the most PAID quotes come first, and unmapped ones come before mapped
    ones - so the rows worth doing something about are at the top.

    ~5,500 quote rows in total, so the grouping is done in Python: the four
    tables would otherwise need four GROUP BYs folded together on a key SQL
    Server would have to be taught (see _quote_city_key)."""
    from app.models.customer_model import (AnubandhanPlusQuote, AnubandhanQuote,
                                           BandhanPlusQuote, RegularBandhan)

    agg = {}
    for model in (AnubandhanPlusQuote, AnubandhanQuote,
                  BandhanPlusQuote, RegularBandhan):
        for city, paid_at in db.query(model.city,
                                      model.payment_update_date_time).all():
            key = _quote_city_key(city)
            if not key:
                continue                 # a blank city cannot be mapped to anything
            row = agg.setdefault(key, {"key": key,
                                       "name": str(city or "").strip(),
                                       "rows": 0, "paid": 0})
            row["rows"] += 1
            if paid_at is not None:
                row["paid"] += 1

    saved = {c.city_key: c for c in db.query(PmsQuoteCityBranch).all()}
    # A city that has been mapped but no longer appears in any file still shows,
    # so a mapping can be corrected or cleared after a file changes.
    for key, c in saved.items():
        agg.setdefault(key, {"key": key, "name": c.city_name or key,
                             "rows": 0, "paid": 0})

    out = []
    for key, row in agg.items():
        c = saved.get(key)
        out.append({**row,
                    "branch_id": c.branch_id if c else None,
                    "by": c.updated_by if c else None})
    out.sort(key=lambda r: (r["branch_id"] is not None, -r["paid"], -r["rows"],
                            r["name"]))

    branches = _profile_branches(db)
    for bid, name, region in db.query(PmsBranchTarget.branch_id,
                                      PmsBranchTarget.branch_name,
                                      PmsBranchTarget.region).distinct():
        b = _norm_branch_id(bid)
        if not b or b == "HO":
            continue
        info = branches.setdefault(b, {"region": None, "name": None})
        if name:
            info["name"] = name.strip()
        if region:
            info["region"] = region.strip().upper()

    return {"cities": out,
            "branches": [{"key": b,
                          "name": (info.get("name") or b),
                          "region": (info.get("region") or "MH").upper()}
                         for b, info in sorted(branches.items(),
                                               key=lambda kv: _branch_sort_key(kv[0]))],
            "mapped": sum(1 for r in out if r["branch_id"]),
            "unmapped": sum(1 for r in out if not r["branch_id"]),
            "unmapped_paid": sum(r["paid"] for r in out if not r["branch_id"])}


def save_quote_cities(db: Session, items: list, user_id: str):
    """Upsert the City Master. A city whose branch is cleared is DELETED rather
    than kept with an empty branch - the report treats 'no row' and 'no branch'
    identically, and one of the two states would only ever confuse."""
    saved_rows = {c.city_key: c for c in db.query(PmsQuoteCityBranch).all()}
    valid = set(_profile_branches(db))
    for t in db.query(PmsBranchTarget.branch_id).distinct():
        b = _norm_branch_id(t[0])
        if b and b != "HO":
            valid.add(b)

    saved = removed = 0
    for it in items or []:
        key = _quote_city_key(it.get("city_key") or it.get("key"))
        if not key:
            continue
        bid = _norm_branch_id(str(it.get("branch_id") or "").strip()[:60])
        row = saved_rows.get(key)
        if not bid:
            if row:
                db.delete(row)
                del saved_rows[key]
                removed += 1
            continue
        if bid not in valid:
            continue                     # a branch the ERP does not have
        if not row:
            row = PmsQuoteCityBranch(city_key=key)
            db.add(row)
            saved_rows[key] = row
        row.city_name = (str(it.get("city_name") or it.get("name") or "").strip()
                         or key)[:120]
        row.branch_id = bid
        row.updated_by = user_id
        saved += 1

    db.commit()
    return {"success": True, "saved": saved, "removed": removed,
            **list_quote_cities(db)}


# ---------------- AOP MASTER: AMC & BANDHAN TARGETS ---------------- #

def list_amc_targets(db: Session, fy_start: int):
    """The AMC & Bandhan AOP tab: one row per branch, carrying the financial
    year's projection and the PREVIOUS year's actual. The branch list is built
    exactly like the CDI tab's, so the two masters can never disagree about
    which branches exist."""
    branches = {b: dict(info) for b, info in _profile_branches(db).items()}
    for bid, name, region in db.query(PmsBranchTarget.branch_id,
                                      PmsBranchTarget.branch_name,
                                      PmsBranchTarget.region).distinct():
        bid = _norm_branch_id(bid)
        if not bid or bid == "HO":
            continue
        info = branches.setdefault(bid, {"region": None, "name": None})
        if name:
            info["name"] = name.strip()
        if region:
            info["region"] = region.strip().upper()

    saved = {_norm_branch_id(t.branch_id): t
             for t in db.query(PmsAmcTarget).filter(PmsAmcTarget.fy == fy_start).all()}

    rows = []
    for b, info in sorted(branches.items(), key=lambda kv: _branch_sort_key(kv[0])):
        t = saved.get(b)
        rows.append({"key": b,
                     "name": info.get("name") or b,
                     "region": (info.get("region") or "MH").upper(),
                     "proj_nos": t.proj_nos if t else None,
                     "prior_nos": t.prior_nos if t else None,
                     "prior_by": t.prior_by if t else None,
                     "prior_at": (t.prior_at.isoformat() if t and t.prior_at else None),
                     "best_nos": t.best_nos if t else None})
    return {"fy": fy_start, "items": rows,
            "categories": _amc_category_rows(db, fy_start)}


def _amc_category_rows(db: Session, fy_start: int) -> list:
    """The tab's SECOND table: the AOP of each row of the Annual Reports' AMC
    sheet. The rows are AGREEMENT CATEGORIES, not branches, so the figures are
    not a sum of the branch table above - see PmsAmcCategoryTarget.

    Each row carries `counted_prior`, the same category counted over the PREVIOUS
    financial year, offered as the box's placeholder so a target can be set
    against what the year before actually did. It understates a closed year (a
    renewal has overwritten the row its sale was counted on), which is why it is
    only ever a hint and never the figure the sheet prints."""
    saved = {t.row_key: t for t in db.query(PmsAmcCategoryTarget)
             .filter(PmsAmcCategoryTarget.fy == fy_start).all()}
    counted = _amc_category_counts(db, "{}-04-01".format(fy_start - 1),
                                   "{}-03-31".format(fy_start))
    out = []
    for row in AMC_SHEET_ROWS:
        t = saved.get(row["key"])
        parts = row.get("of", []) if row["counted"] == "sum" else [row["key"]]
        out.append({"key": row["key"], "name": row["name"],
                    "aop_nos": t.aop_nos if t else None,
                    "aop_by": t.updated_by if t else None,
                    "counted_prior": sum(counted.get(k, 0) for k in parts)})
    return out


def _amc_category_counts(db: Session, first_day: str, last_day: str) -> dict:
    """{series -> rows counted} over an inclusive date span, by exactly the rules
    the AMC sheet counts by. Only used to offer a placeholder in the AOP master,
    so it reads the same file rather than duplicating the sheet's arithmetic."""
    data = annual_amc_monthly_data(db)
    out = {}
    for si, day, n in data.get("records", []):
        if first_day <= day <= last_day:
            name = data["series"][si]
            out[name] = out.get(name, 0) + n
    return out


def save_amc_targets(db: Session, fy_start: int, items: list, user_id: str,
                    categories: list = None):
    """Upsert the FY's AMC & Bandhan AOP rows - the branch table, and the
    per-category table beside it. A row whose figures are ALL blank is DELETED -
    the report then shows a dash rather than a target of 0, the same rule the CDI
    targets follow."""
    existing = {_norm_branch_id(t.branch_id): t
                for t in db.query(PmsAmcTarget).filter(PmsAmcTarget.fy == fy_start).all()}
    saved = removed = 0

    def _nos(raw):
        """A whole number of agreements, or None. Negative is meaningless here,
        while 0 is a real target ('this branch sells none'), so 0 is kept."""
        if raw in (None, ""):
            return None
        try:
            return max(0, int(round(float(raw))))
        except (TypeError, ValueError):
            return None

    for it in items or []:
        bid = _norm_branch_id(str(it.get("key") or "").strip()[:60])
        if not bid:
            continue
        proj, prior = _nos(it.get("proj_nos")), _nos(it.get("prior_nos"))
        best = _nos(it.get("best_nos"))
        row = existing.get(bid)

        # Nothing left in the row: it goes. All three figures are the AOP
        # master's own - nothing is counted or kept behind them - so there is
        # nothing left to preserve.
        if proj is None and prior is None and best is None:
            if row:
                db.delete(row)
                del existing[bid]
                removed += 1
            continue
        if not row:
            row = PmsAmcTarget(fy=fy_start, branch_id=bid, created_by=user_id)
            db.add(row)
            existing[bid] = row
        row.proj_nos = proj
        # Stamp WHO put last year's figure there, and when - it is the one number
        # on the sheet that is asserted rather than counted, so it carries its
        # author. Unchanged value, unchanged stamp.
        if prior != row.prior_nos:
            row.prior_nos = prior
            row.prior_by = None if prior is None else user_id
            row.prior_at = None if prior is None else now_ist()
        # The best month is asserted too - the business knows what its best
        # month was. Nothing raises or lowers it but a person typing here.
        row.best_nos = best
        row.updated_by = user_id
        saved += 1

    # ---- the per-category AOP table (the AMC sheet's rows) ----------------
    # Only keys the sheet actually prints are accepted: a stray one would create
    # a target no row could ever show.
    valid = {r["key"] for r in AMC_SHEET_ROWS}
    cat = {t.row_key: t for t in db.query(PmsAmcCategoryTarget)
           .filter(PmsAmcCategoryTarget.fy == fy_start).all()}
    for it in categories or []:
        key = str(it.get("key") or "").strip()[:40]
        if key not in valid:
            continue
        nos = _nos(it.get("aop_nos"))
        row = cat.get(key)
        if nos is None:
            if row:
                db.delete(row)
                del cat[key]
                removed += 1
            continue
        if not row:
            row = PmsAmcCategoryTarget(fy=fy_start, row_key=key)
            db.add(row)
            cat[key] = row
        if row.aop_nos != nos:
            row.updated_by = user_id
        row.aop_nos = nos
        saved += 1

    db.commit()
    return {"success": True, "saved": saved, "removed": removed,
            **list_amc_targets(db, fy_start)}


# ============================================================================
# ANNUAL REPORTS -> AMC  (the monthly sheet, second tab of the AMC report)
# ----------------------------------------------------------------------------
# One row per AGREEMENT CATEGORY, and - unlike every other annual sheet - it
# reads SIX files, because the business counts each row where that row is
# actually recorded:
#
#   KOEL Bandhan MH / KA      the FOUR BANDHAN QUOTE FILES (Anubandhan,
#                             Anubandhan Plus, Bandhan, Bandhan Plus), counted on
#                             PAYMENT UPDATE DATE TIME and split on the quote's
#                             own STATE column. A Bandhan sale is a PAID QUOTE,
#                             and the quote files are where the payment lands -
#                             the AMC Population Report only picks the agreement
#                             up once it has been cut, which is later and, for a
#                             closed year, lossy (see below).
#   KOEL Bandhan Total        those two added up
#   KALA AMC                  AMC Population Report, ACTIVE 'Dealer Agreement'
#                             on AGREEMENT START DATE - the dealership's own AMC
#   KOEL Corporate AMC        the same, ACTIVE 'KOEL Agreement'
#   AMC Expired During Month  the AMC AGREEMENT EXPIRY PLANNER, on AGREEMENT
#                             END DATE - the file that exists to say what is
#                             running out and when
#   AMC Renewed During Month  those SAME expiring agreements, matched by INSTANCE
#                             ID into the four quote files - against the SAME
#                             filtered records the Bandhan rows count: PAYMENT
#                             UPDATE DATE TIME set AND STATUS 'Payment Success'.
#                             Counted in the month the old cover EXPIRES, so the
#                             two rows read as a pair - N ran out, M of those N
#                             came back
#   Live AMC (KOEL+KALA)      KOEL Bandhan + KALA AMC
#
# The sheet is ONE financial year: AOP, that year's cumulative, one column per
# month, and the WORKING month opened up into its Mon-Sun weeks (that is what the
# business's 'Week-2 / Week-3' columns are). The payload is RAW PER-DAY, so every
# column is re-aggregated in the browser with no refetch.
#
# CLOSED YEARS ARE NOT SHOWN, and that is deliberate for the AMC-Population rows.
# That file is a SNAPSHOT keyed on INSTANCE ID: one row per genset, always its
# LATEST agreement, so a renewal OVERWRITES the agreement it replaced and a
# closed year's sales leak away month by month. A column that wrong is worse than
# no column, so the sheet prints only the RUNNING year. (The quote files behind
# the Bandhan rows do NOT decay - a paid quote stays a paid quote - but the sheet
# keeps one column set for every row rather than showing history for some rows
# and not others.)
#
# The one figure that cannot be counted is the AOP, and it is not typed on the
# sheet either: it belongs to the AOP master like every other target, in the
# second table of its AMC & Bandhan AOP tab (PmsAmcCategoryTarget).
#
# The per-type tallies ride along in meta.type_counts, and any agreement type
# this mapping does not know lands in meta.unmapped_types rather than being
# dropped silently: the mapping was inferred from the business's own sheet, so
# the file has to be able to say when a new type shows up.

# ---- the AMC POPULATION rows: which AGREEMENT TYPE feeds which row --------
# A type appears in at most one row. The Bandhan family is NOT here: those rows
# are counted from the quote files instead (AMC_QUOTE_TABLES below), so a Bandhan
# agreement in the population file is deliberately left uncounted by this sheet -
# it would be the same sale a second time, on a later date.
AMC_ROW_TYPES = {
    # The dealership's own AMC, sold under its own paper.
    "kala_amc": ["Dealer Agreement"],
    # KOEL's own corporate agreement - the one type the AMC & Bandhan Projection
    # sheet leaves out, because it is not the dealer's business done. It IS a row
    # here.
    "koel_corp": ["KOEL Agreement"],
}
# The Bandhan family, kept for the payload's meta so the sheet can say which
# types the quote files are standing in for.
AMC_BANDHAN_TYPES = ["KOEL Bandhan", "KOEL Bandhan Plus", "Bandhan Premium",
                     "KOEL Anubandhan Plus", "KOEL Anubandhan IV+"]

# ---- the BANDHAN rows: the four quote files ------------------------------
# All four share one shape (state / payment_update_date_time), so one loop reads
# them all. A row counts ONCE, in the month its PAYMENT UPDATE landed - a quote
# with no payment update has not been bought and is not a sale, which is the only
# filter the count needs.
AMC_QUOTE_TABLES = [
    ("Anubandhan Quotes Report", "anubandhan_quotes"),
    ("Anubandhan Plus Quotes Report", "anubandhan_plus_quotes"),
    ("Regular Bandhan Customers Report", "regular_bandhan"),
    ("BandhanPlus Quotes Report", "bandhan_plus_quotes"),
]

# The Bandhan family as match keys, so the population pass can tell 'counted
# elsewhere' from 'a type nobody knows'.
_AMC_BANDHAN_KEYS = {re.sub(r"[^A-Z0-9]+", "", t.upper()) for t in AMC_BANDHAN_TYPES}


def _amc_key(value) -> str:
    """Letters and digits only, upper case - so spacing or case in a file cannot
    drop a row out of a count."""
    return re.sub(r"[^A-Z0-9]+", "", str(value or "").upper())


def _state_is_ka(state) -> bool:
    """The quote files carry a STATE, not a branch, so the Bandhan MH / KA split
    is made on that. Karnataka is the only region the dealership works besides
    Maharashtra, so anything that is not recognisably Karnataka falls to MH - the
    home region - rather than being dropped: a state spelt in a new way must move
    a sale between two rows, never out of both.

    Matched on the text rather than an exact list because the four files are
    exported by different systems ('Karnataka', 'KARNATAKA', 'Karnatak')."""
    return "KARNATAK" in _amc_key(state) or _amc_key(state) == "KA"
# Matched on letters and digits only, so spacing or case in the file cannot drop
# an agreement out of a row.
_AMC_ROW_OF_TYPE = {re.sub(r"[^A-Z0-9]+", "", t.upper()): row
                    for row, types in AMC_ROW_TYPES.items() for t in types}

# The sheet's rows, in print order. `counted` says how the row's numbers arrive:
#   'series'  counted from the file, from the per-day series of the same name
#   'sum'     added up from the rows named in `of` (a total)
# EVERY row prints the month it happened in. Corporate AMC was briefly printed as
# a running total, to match a business sheet that showed it that way; it reads as
# a plain monthly count like the rest now (2026-08-22, on the business's word).
AMC_SHEET_ROWS = [
    {"key": "bandhan_total", "name": "KOEL Bandhan Total",
     "counted": "sum", "of": ["bandhan_mh", "bandhan_kar"]},
    {"key": "bandhan_mh", "name": "KOEL Bandhan MH", "counted": "series"},
    {"key": "bandhan_kar", "name": "KOEL Bandhan KA", "counted": "series"},
    {"key": "kala_amc", "name": "KALA AMC", "counted": "series"},
    {"key": "koel_corp", "name": "KOEL Corporate AMC", "counted": "series"},
    {"key": "expired", "name": "AMC Expired During the Month", "counted": "series"},
    {"key": "renewed", "name": "AMC Renewed During the Month", "counted": "series"},
    {"key": "live_total", "name": "Live AMC (KOEL+KALA) OVERALL", "counted": "sum",
     "of": ["bandhan_mh", "bandhan_kar", "kala_amc"], "highlight": True},
]

# The per-day series the payload ships, in the order records[] indexes them.
AMC_SERIES = ["bandhan_mh", "bandhan_kar", "kala_amc", "koel_corp",
              "expired", "renewed"]


def annual_amc_monthly_data(db: Session):
    """Cached wrapper - see _annual_amc_monthly_data."""
    return _cached(db, ("annual_amc_monthly",),
                   lambda: _annual_amc_monthly_data(db))


def _annual_amc_monthly_data(db: Session):
    """'AMC' (Annual Reports, AMC report -> Monthly tab) - agreements per
    category, per DAY.

    records[[seriesIdx, 'YYYY-MM-DD', count]], seriesIdx indexing AMC_SERIES.
    Per-day rather than per-month because the sheet opens its working month up
    into Mon-Sun weeks, and a week does not divide into months.

    FIVE files, each row counted where that row is actually recorded:

      bandhan_mh / bandhan_kar   the four Bandhan QUOTE files, on PAYMENT UPDATE
                                 DATE TIME, split on the quote's own STATE
      kala_amc / koel_corp       AMC Population, ACTIVE, on AGREEMENT START DATE
      expired                    the AMC Agreement Expiry Planner, on AGREEMENT
                                 END DATE - the month the cover runs out
      renewed                    those same rows, matched by INSTANCE ID into the
                                 quote files' PULSE INSTANCE ID - against the
                                 SAME records the Bandhan rows count, i.e. a
                                 PAYMENT UPDATE DATE TIME set AND a STATUS of
                                 'Payment Success'. Counted in the EXPIRY month,
                                 not the payment month, so 'M of the N that
                                 expired in April have renewed' reads straight
                                 off the two rows
    """
    from app.models.customer_model import (AMCAgreement, AMCExpiryPlanner,
                                           AnubandhanPlusQuote, AnubandhanQuote,
                                           BandhanPlusQuote, RegularBandhan)

    # branch_id is read but not split on: these rows are company-wide
    # categories, and the only region split on the sheet (Bandhan MH / KA) comes
    # from the quote files' STATE instead.
    rows = db.query(AMCAgreement.branch_id, AMCAgreement.agreement_type,
                    AMCAgreement.agreement_start_date,
                    AMCAgreement.agreement_end_date,
                    AMCAgreement.agreement_status,
                    AMCAgreement.last_agreement_number).all()

    si = {name: i for i, name in enumerate(AMC_SERIES)}
    counts = {}                      # (seriesIdx, 'YYYY-MM-DD') -> n
    type_counts = {}                 # every ACTIVE type seen -> rows
    unmapped = {}                    # a type no row of this sheet counts
    not_active = no_start = no_end = 0
    renewed_rows = 0
    # TWO spans, and the difference matters. `span` is every date the payload
    # carries; `start_span` is only the SALES dates - payments and agreement
    # starts. The expired and renewed rows are both dated on AGREEMENT END DATE,
    # which runs YEARS ahead, so the FY picker is offered start_span instead.
    span = {"lo": None, "hi": None}
    start_span = {"lo": None, "hi": None}

    def _d(v):
        return v.date() if isinstance(v, datetime) else v

    def _widen(box, iso):
        if box["lo"] is None or iso < box["lo"]:
            box["lo"] = iso
        if box["hi"] is None or iso > box["hi"]:
            box["hi"] = iso

    def _add(series, day):
        iso = day.isoformat()
        key = (si[series], iso)
        counts[key] = counts.get(key, 0) + 1
        _widen(span, iso)
        # Only the SALES series widen the span the FY picker is offered. Expiries
        # and renewals are both dated on the AGREEMENT END DATE, which runs years
        # ahead - offering those years would list financial years in which
        # nothing was ever sold, only cover running out.
        if series not in ("expired", "renewed"):
            _widen(start_span, iso)

    for _bid, atype, start, end, status, last_no in rows:
        if not _is_active(status):
            not_active += 1
            continue
        label = str(atype or "").strip() or "(blank)"
        type_counts[label] = type_counts.get(label, 0) + 1
        row_key = _AMC_ROW_OF_TYPE.get(re.sub(r"[^A-Z0-9]+", "",
                                              str(atype or "").upper()))
        # A Bandhan agreement has no CATEGORY row here - those rows are counted
        # from the quote files, so counting the agreement too would be the same
        # sale twice, on a later date. It is still a type this sheet KNOWS, and
        # it still counts toward the expiry and renewal rows below. A type that
        # is neither is genuinely unknown, and only that kind is flagged.
        known = row_key is not None or _amc_key(atype) in _AMC_BANDHAN_KEYS
        if not known:
            unmapped[label] = unmapped.get(label, 0) + 1
            continue

        # Expiries are NOT counted here any more - the AMC Agreement Expiry
        # Planner is the file that exists to answer that question, and this one
        # is a snapshot whose end dates move as gensets renew. The tally is kept
        # only to say how far the two files disagree.
        e = _d(end)
        if e is None:
            no_end += 1

        d = _d(start)
        if d is None:
            no_start += 1               # an agreement with no start date
            continue
        if row_key is not None:
            _add(row_key, d)
        # LAST AGREEMENT NUMBER used to drive the renewed row. It no longer does
        # - only 239 of 2,504 rows still carry one, because the file keeps just a
        # single step back - but the tally stays, as the measure of what that
        # approach could ever have seen.
        if str(last_no or "").strip():
            renewed_rows += 1

    # ---- EXPIRED and RENEWED: the Expiry Planner, matched to the quotes ---
    # The AMC Agreement Expiry Planner is one row per genset per agreement, and
    # AGREEMENT END DATE is what the whole file is for - so an expiry is simply a
    # row of it, counted in the month its cover runs out.
    #
    # A RENEWAL is one of those same rows bought again, and 'bought' means EXACTLY
    # what the KOEL Bandhan rows mean by it: the match is made against the SAME
    # filtered quote records those rows count, not against the quote files at
    # large. So a quote qualifies only when BOTH hold:
    #
    #   PAYMENT UPDATE DATE TIME is set   the money landed - the very test the
    #                                     Bandhan rows above filter on
    #   STATUS is 'Payment Success'       and it landed cleanly: a quote raised,
    #                                     paid short, or refunded is not a renewal
    #
    # The genset is carried as PULSE INSTANCE ID (RegularBandhan keeps it in
    # instance_id), which is what the expiring agreement's INSTANCE ID is matched
    # against.
    #
    # The renewal is counted in the month the OLD COVER EXPIRES, not the month
    # the payment landed. That keeps the two rows a pair the reader can divide:
    # 'N ran out in April, M of those N have been bought again'. Counting it in
    # the payment month would put the two halves of one story in different
    # columns.
    #
    # A genset with SEVERAL expiring agreements counts once per agreement on both
    # rows - the file's own key is instance + agreement number, and each
    # agreement is its own piece of cover.
    paid_instances = set()
    for model, id_col in ((AnubandhanPlusQuote, "pulse_instance_id"),
                          (AnubandhanQuote, "pulse_instance_id"),
                          (BandhanPlusQuote, "pulse_instance_id"),
                          # This file matches on Pulse Instance ID too; its
                          # import lands it in instance_id (see RegularBandhan).
                          (RegularBandhan, "instance_id")):
        col = getattr(model, id_col)
        for inst, status, paid_at in db.query(
                col, model.status, model.payment_update_date_time).all():
            if paid_at is None:
                continue                 # never paid: not a Bandhan record either
            if _amc_key(status) != "PAYMENTSUCCESS":
                continue
            key = str(inst or "").strip().upper()
            if key:
                paid_instances.add(key)

    expiry_rows = 0
    expiry_no_date = 0
    renewed_matched = 0
    for inst, end_at in db.query(AMCExpiryPlanner.instance_id,
                                 AMCExpiryPlanner.agreement_end_date).all():
        expiry_rows += 1
        d = _d(end_at)
        if d is None:
            expiry_no_date += 1          # cannot be placed on the calendar
            continue
        _add("expired", d)
        if str(inst or "").strip().upper() in paid_instances:
            _add("renewed", d)
            renewed_matched += 1

    # ---- the BANDHAN rows: the four quote files ------------------------
    # A PAID QUOTE is the sale, so the count is one per row that carries a
    # PAYMENT UPDATE DATE TIME, in the month that payment landed. A quote with no
    # payment update has not been bought and is simply not counted - no status
    # filter is needed on top, and none is applied: `status` carries free text
    # that differs between the four files, and reading it would drop sales on a
    # wording change.
    quote_rows = 0
    quote_unpaid = 0
    quote_by_file = {}
    state_counts = {}
    for label, table in AMC_QUOTE_TABLES:
        try:
            found = db.execute(text(
                "SELECT state, payment_update_date_time FROM dbo.{}".format(table)
            )).fetchall()
        except Exception:
            # A file nobody has uploaded yet has no table. It contributes
            # nothing rather than failing the whole sheet - but the failed
            # statement has to be rolled back first, or every query after it on
            # this connection fails with it.
            db.rollback()
            quote_by_file[label] = None
            continue
        n_paid = 0
        for st, paid_at in found:
            quote_rows += 1
            d = _d(paid_at)
            if d is None:
                quote_unpaid += 1
                continue
            key = (st or "").strip() or "(blank)"
            state_counts[key] = state_counts.get(key, 0) + 1
            _add("bandhan_kar" if _state_is_ka(st) else "bandhan_mh", d)
            n_paid += 1
        quote_by_file[label] = n_paid

    records = sorted([s, day, n] for (s, day), n in counts.items())

    # The RUNNING financial year, read off today rather than off the data: the
    # sheet is 'this year against its AOP', so it must open on the running year
    # even in the first days of April when nothing has started yet.
    today = now_ist().date()
    fy = today.year if today.month >= 4 else today.year - 1

    return {"success": True,
            "meta": {"min_date": span["lo"], "max_date": span["hi"],
                     "min_start": start_span["lo"], "max_start": start_span["hi"],
                     "today": today.isoformat(), "fy": fy,
                     "agreement_rows": len(rows),
                     "not_active": not_active,
                     "no_start_date": no_start,
                     # the Expiry Planner and its match into the quote files
                     "expiry_rows": expiry_rows,
                     "expiry_no_date": expiry_no_date,
                     "renewed_matched": renewed_matched,
                     "paid_instances": len(paid_instances),
                     # what the OLD approach could have seen, kept for comparison:
                     # AMC Population rows still carrying a last agreement number,
                     # and rows whose end date is missing there
                     "population_last_agreement_rows": renewed_rows,
                     "population_no_end_date": no_end,
                     "type_counts": type_counts,
                     "unmapped_types": unmapped,
                     "row_types": AMC_ROW_TYPES,
                     "bandhan_types": AMC_BANDHAN_TYPES,
                     "quote_rows": quote_rows,
                     "quote_unpaid": quote_unpaid,
                     "quote_by_file": quote_by_file,
                     "quote_states": state_counts},
            "series": AMC_SERIES,
            "rows": AMC_SHEET_ROWS,
            "records": records,
            "aop": _amc_category_aop_map(db),
            "dbamc_aop": _amc_branch_aop_totals(db)}


def _amc_branch_aop_totals(db: Session) -> dict:
    """{'fy' -> every branch's F<yy> PROJ AOP D/BAMC added up}.

    This is what the AMC sheet's KCGL Total AMC table plans against: the company
    figure is the SUM of the branch projections already kept in the first table
    of the AOP master's AMC & Bandhan AOP tab, spread equally over the twelve
    months. So the yearly plan is maintained in exactly one place - per branch,
    where it is actually owned - and the KCGL row is derived from it rather than
    typed a second time and left to drift.

    Keyed by string because it crosses JSON, and the sheet looks it up by the
    financial year the reader has picked.

    A branch with no projection contributes nothing (rather than a zero), so a
    part-filled year reads as the sum of what has been set."""
    out = {}
    for fy, proj in db.query(PmsAmcTarget.fy, PmsAmcTarget.proj_nos).all():
        if proj is None:
            continue
        out[str(fy)] = out.get(str(fy), 0) + proj
    return out


def _amc_category_aop_map(db: Session) -> dict:
    """Every per-category AOP as {'fy|row_key': {nos, by}} - flat, so one payload
    covers whichever financial year the sheet lands on."""
    return {"{}|{}".format(t.fy, t.row_key): {"nos": t.aop_nos, "by": t.updated_by}
            for t in db.query(PmsAmcCategoryTarget).all()
            if t.aop_nos is not None}


def _amc_nos(raw):
    """A whole number of agreements, or None. Negative is meaningless here,
    while 0 is a real figure ('this row plans none'), so 0 is kept."""
    if raw in (None, ""):
        return None
    try:
        return max(0, int(round(float(raw))))
    except (TypeError, ValueError):
        return None


# ============================================================================
# ANNUAL REPORTS -> SERVICE LOAD AND RESPONSE
# ----------------------------------------------------------------------------
# ONE file: 'Response Time & MaxTTR Details' (response_time_maxttr). Everything
# the sheet prints is counted on SR CLOSE DATE, per BRANCH ID:
#
#   Total Service Load Available   every SR of the period, whatever its type
#   the breakdown rows             that same population split by the Service
#                                  Load head master (CSP / Post Warranty /
#                                  Warranty / KOEL AMC / Dealer AMC / ...)
#   4 HRS RESPONSE %               SR TYPE 'Warranty', Response Time <= 4
#   SR CLOSED WITHIN 24 / 48 HRS   SR TYPE 'Warranty',
#                                  MaxTTR on SR Closed in hrs <= 24 / 48
#                                  All three are scoped to that one SR TYPE, and
#                                  a NEGATIVE duration is excluded from both the
#                                  numerator and the denominator.
#   FTR % / FVR %                  NOT counted — typed into AOP & Master, per
#                                  month and per cumulative year, and printed as
#                                  entered (see PmsServiceLoadManual)
#   Productivity (Calls PP PD)     closures / (the branch's SE HEADCOUNT x its
#                                  working days). The headcount is TYPED in the
#                                  AOP master - the file only names engineers who
#                                  closed something, which flatters a branch with
#                                  anyone on leave. Working days are exact: days
#                                  in the window, minus Sundays, minus the
#                                  region's ticked holidays.
#
# WHY SR OPEN DATE IS NEVER USED (it is not a date input here at all, but the
# same corruption explains the negative Response Times below): 8,721 of the
# 45,279 rows in the live file
# carry an SR OPEN DATE that falls AFTER their SR CLOSE DATE - always at
# 00:00:00, i.e. the SCHEDULED date of a PM/planned SR that was closed early.
# The file's own arithmetic turns those into a negative MaxTTR (-38, -298, -586)
# and buckets them as '<=2 HRS (+30MIN BUFFER)'. So response and TTR are read
# from the file's OWN columns and never recomputed from open -> close, and a
# negative TTR counts as inside every window - closed before it was due is
# compliant, which is exactly how the source file scores it. meta reports the
# count so the number is never invisible.
# ============================================================================


def list_service_load_heads(db: Session):
    """The shared head list, in the order the Service Load and Response sheet
    prints its breakdown rows."""
    return list_heads_for(db, "service_load")


def add_service_load_head(db: Session, name: str, user_id: str):
    return add_head_common(db, name, user_id, "service_load")


def delete_service_load_head(db: Session, head_id: int):
    return delete_head_common(db, head_id, "service_load")


def _seed_service_load_sr_defaults(db: Session):
    existing = {m.sr_type.lower() for m in db.query(PmsServiceLoadSrTypeMap).all()}
    added = 0
    for sr, head in DEFAULT_SERVICE_LOAD_SR_HEADS.items():
        if sr.lower() not in existing:
            db.add(PmsServiceLoadSrTypeMap(sr_type=sr, head=head, created_by="system"))
            added += 1
    if added:
        db.commit()
    return added


def list_service_load_sr_types(db: Session):
    if db.query(PmsServiceLoadSrTypeMap).count() == 0:
        _seed_service_load_sr_defaults(db)
    rows = (db.query(PmsServiceLoadSrTypeMap)
            .order_by(PmsServiceLoadSrTypeMap.sr_type).all())
    return [{"id": m.id, "sr_type": m.sr_type, "head": m.head} for m in rows]


def save_service_load_sr_types(db: Session, items: list, user_id: str):
    """Upsert the mapping. A head cleared to blank leaves that SR Type counting
    in the sheet's 'all types' row while dropping out of every breakdown row -
    which is how the printed sheet's gap between the two is reproduced."""
    for it in items or []:
        sr = _clean_str(it.get("sr_type"), 200)
        if not sr:
            continue
        row = (db.query(PmsServiceLoadSrTypeMap)
               .filter(PmsServiceLoadSrTypeMap.sr_type == sr).first())
        if not row:
            row = PmsServiceLoadSrTypeMap(sr_type=sr, created_by=user_id)
            db.add(row)
        row.head = _clean_str(it.get("head"), 60)
        row.updated_by = user_id
    db.commit()
    return {"success": True, "items": list_service_load_sr_types(db)}


def sync_service_load_sr_types(db: Session, user_id: str):
    """Pull the distinct SR Type values out of the uploaded MaxTTR file."""
    from app.models.customer_model import ResponseTimeMaxTTR
    _seed_service_load_sr_defaults(db)
    known = {m.sr_type.lower() for m in db.query(PmsServiceLoadSrTypeMap).all()}
    defaults = {k.lower(): v for k, v in DEFAULT_SERVICE_LOAD_SR_HEADS.items()}
    rows = (db.query(ResponseTimeMaxTTR.sr_type)
            .filter(ResponseTimeMaxTTR.sr_type.isnot(None),
                    ResponseTimeMaxTTR.sr_type != "")
            .distinct().all())
    added = 0
    for (sr,) in rows:
        sr = re.sub(r"\s+", " ", (sr or "").strip())[:200]
        if sr and sr.lower() not in known:
            db.add(PmsServiceLoadSrTypeMap(sr_type=sr, head=defaults.get(sr.lower()),
                                           created_by=user_id))
            known.add(sr.lower())
            added += 1
    db.commit()
    return {"success": True, "added": added,
            "items": list_service_load_sr_types(db)}


def reset_service_load_sr_types(db: Session, user_id: str):
    for sr, head in DEFAULT_SERVICE_LOAD_SR_HEADS.items():
        row = (db.query(PmsServiceLoadSrTypeMap)
               .filter(PmsServiceLoadSrTypeMap.sr_type == sr).first())
        if row:
            row.head = head
            row.updated_by = user_id
        else:
            db.add(PmsServiceLoadSrTypeMap(sr_type=sr, head=head, created_by=user_id))
    db.commit()
    return {"success": True, "items": list_service_load_sr_types(db)}


# ---------------- the report ------------------------------------------------ #

# ALL THREE compliance percentages are measured on ONE column, 'Response Time',
# counted on SR CLOSE DATE — the business's own definition of the sheet. Nothing
# else feeds them: not the RESPONSE TIME RANGE IN HRS bucket (it is only this
# same number pre-binned; the two agreed on all 45,279 live rows), and not
# MaxTTR ON SR CLOSED IN HRS, which measures time to CLOSE rather than time to
# RESPOND. Deriving the elapsed time from the timestamps instead was tried and
# withdrawn: SR OPEN DATE is a SCHEDULED date on planned work, so open -> close
# is not a service level on 42% of the file.
_RT_HRS = "TRY_CONVERT(FLOAT, REPLACE(response_time, '''', ''))"
# Time to CLOSE, which is what the 24 / 48-hour rows measure.
_TTR_HRS = "TRY_CONVERT(FLOAT, REPLACE(maxttr_on_sr_closed_in_hrs, '''', ''))"
# Every compliance percentage is scoped to this SR TYPE. It is the literal value
# in the file, not the report's 'Warranty' HEAD (which also gathers Line
# Rejection, Campaign, Revalidation and Extended Warranty) — the business names
# the SR type.
_WARRANTY = "r.sr_type = 'Warranty'"

_SERVICE_LOAD_SQL = """
    SELECT r.branch_id                                       AS branch_id,
           CAST(r.sr_close_date AS DATE)                     AS d,
           r.sr_type                                         AS sr_type,
           COUNT(*)                                          AS n,
           -- THE THREE COMPLIANCE MEASURES ARE SCOPED TO SR TYPE 'Warranty'
           -- and read TWO different columns:
           --   4 HRS RESPONSE      Response Time            <= 4
           --   CLOSED IN 24 / 48   MaxTTR on SR Closed hrs  <= 24 / 48
           -- Response time and time-to-close are different measures, and the
           -- business scores the first on one column and the last two on the
           -- other. A NEGATIVE value in either is excluded from BOTH halves —
           -- it is planned work closed before its scheduled date, so there is no
           -- duration to score — which is why each measure carries its own
           -- denominator rather than dividing by the SR count.
           SUM(CASE WHEN {w} AND {rt} BETWEEN 0 AND 4 THEN 1 ELSE 0 END)  AS r4,
           SUM(CASE WHEN {w} AND {rt} >= 0 THEN 1 ELSE 0 END)             AS r4_den,
           SUM(CASE WHEN {w} AND {tt} BETWEEN 0 AND 24 THEN 1 ELSE 0 END) AS c24,
           SUM(CASE WHEN {w} AND {tt} BETWEEN 0 AND 48 THEN 1 ELSE 0 END) AS c48,
           SUM(CASE WHEN {w} AND {tt} >= 0 THEN 1 ELSE 0 END)             AS tt_den,
           SUM(CASE WHEN {w} THEN 1 ELSE 0 END)                           AS warranty_n,
           SUM(CASE WHEN {w} AND ({rt} < 0 OR {tt} < 0) THEN 1 ELSE 0 END) AS neg_ttr,
           SUM(CASE WHEN {w} AND ({rt} IS NULL OR {tt} IS NULL)
                    THEN 1 ELSE 0 END)                                    AS no_ttr
      FROM dbo.response_time_maxttr r
     WHERE r.sr_close_date IS NOT NULL
     GROUP BY r.branch_id, CAST(r.sr_close_date AS DATE), r.sr_type
""".replace("{rt}", _RT_HRS).replace("{tt}", _TTR_HRS).replace("{w}", _WARRANTY)

def annual_service_load_data(db: Session):
    """Cached wrapper - see _annual_service_load_data."""
    return _cached(db, ("annual_service_load",),
                   lambda: _annual_service_load_data(db))


def _annual_service_load_data(db: Session):
    """'Service Load and Response' (Annual Reports) - the RESPONSE TIME & MaxTTR
    DETAILS file and only it, counted on SR CLOSE DATE per BRANCH ID.

    Aggregated in SQL down to (branch, day, SR type) and folded to heads here,
    because the DB is remote: 45k rows become ~12k records, and the page then
    derives the FY cumulatives, the month columns, the working month's weeks and
    every region rollup from those without a refetch - the same contract the CDI
    and Employee Productivity payloads use.

    records[[branchIdx, isoCloseDate, headIdx, n,
             within4hrs, scorableFor4hrs, closed24, closed48, scorableForClose,
             warrantySRs]]
        the counts AND their three SLA numerators travel together, so the sheet
        can score any row-set - one head, a few, or all of them - without asking
        the server for another cut. headIdx -1 is the 'no head' bucket.
    The file's SE NAME is deliberately NOT read: productivity divides by the
    branch's TYPED headcount (PmsServiceLoadSeCount), because the file only names
    engineers who closed something and that flatters any branch with a person on
    leave. That also keeps 22k engineer-day triples out of the payload.
    """
    from app.models.customer_model import ResponseTimeMaxTTR

    # ---- branch identity: every AOP / ERP branch gets a row, MH then KA -----
    aop_name, aop_region = {}, {}
    for t in db.query(PmsBranchTarget.branch_id, PmsBranchTarget.branch_name,
                      PmsBranchTarget.region).distinct():
        bid = _norm_branch_id(t[0])
        if not bid:
            continue
        if t[1] and bid not in aop_name:
            aop_name[bid] = t[1].strip()
        if t[2] and bid not in aop_region:
            aop_region[bid] = t[2].strip().upper()
    erp_region = {b: r for r, b, _n in ERP_BRANCHES}
    erp_name = {b: n for _r, b, n in ERP_BRANCHES}

    branch_idx, branches, branch_ids = {}, [], []

    def _branch(bid):
        """A branch code no KALA master knows is not a branch - the MaxTTR file
        carries another dealer's code on a handful of rows and one row was enough
        to grow a ghost column in the Employee Productivity report. Such codes
        fold into the single Unmapped Branch bucket and are reported in meta."""
        bid = _norm_branch_id(bid) or ""
        if bid not in aop_name and bid not in erp_name:
            bid = UNMAPPED_BRANCH_ID
        if bid not in branch_idx:
            branch_idx[bid] = len(branches)
            branches.append(aop_name.get(bid) or erp_name.get(bid)
                            or UNMAPPED_BRANCH_NAME)
            branch_ids.append(bid)
        return branch_idx[bid]

    for _r, b, _n in ERP_BRANCHES:
        _branch(b)
    # Parbhani (420435_7) is an AOP master branch the ERP list has never carried;
    # every other master-only branch gets its row too, in natural order.
    for b in sorted(set(aop_name) - set(branch_idx), key=_branch_sort_key):
        _branch(b)

    # ---- SR TYPE -> head ('SR Type Master (Service Load)') -----------------
    heads = _report_heads(db, "service_load")
    head_idx = {h: i for i, h in enumerate(heads)}
    sr_head = {}
    if db.query(PmsServiceLoadSrTypeMap).count() == 0:
        _seed_service_load_sr_defaults(db)
    for m in db.query(PmsServiceLoadSrTypeMap).all():
        if m.sr_type:
            sr_head[_tight(m.sr_type)] = (m.head or "").strip()

    unmapped_types = {}                  # SR Type with no head -> its row count

    def _head_of(sr_type):
        """Index of the head an SR Type reports under, or None when it has no
        head - those rows still count in the sheet's 'all types' row, and the
        difference is printed as its own line rather than quietly dropped."""
        h = sr_head.get(_tight(sr_type or ""))
        if not h:
            return None
        if h not in head_idx:            # a head added after the master was read
            head_idx[h] = len(heads)
            heads.append(h)
        return head_idx[h]

    # ---- one grouped aggregate over the whole file --------------------------
    rows = db.execute(text(_SERVICE_LOAD_SQL)).fetchall()

    # (branchIdx, iso date, headIdx-or--1) -> [n, r4, c24, c48]
    cells = {}
    min_d = max_d = None
    counted = no_ttr_rows = neg_ttr_rows = unmapped_branch_rows = 0
    for (bid, d, sr_type, n, r4, r4_den, c24, c48, tt_den, warranty_n,
         neg_ttr, no_ttr) in rows:
        d = d.date() if isinstance(d, datetime) else d
        if d is None:
            continue
        n = int(n or 0)
        bi = _branch(bid)
        if branch_ids[bi] == UNMAPPED_BRANCH_ID:
            unmapped_branch_rows += n
        hi = _head_of(sr_type)
        if hi is None:
            key = str(sr_type or "").strip() or "(blank)"
            unmapped_types[key] = unmapped_types.get(key, 0) + n
        ds = d.isoformat()
        # -1 is the 'no head' bucket: it never gets a breakdown row, only the
        # 'all types' row and the balancing line under the Total.
        acc = cells.setdefault((bi, ds, -1 if hi is None else hi),
                               [0, 0, 0, 0, 0, 0, 0])
        acc[0] += n
        acc[1] += int(r4 or 0)
        acc[2] += int(r4_den or 0)
        acc[3] += int(c24 or 0)
        acc[4] += int(c48 or 0)
        acc[5] += int(tt_den or 0)
        acc[6] += int(warranty_n or 0)
        counted += n
        no_ttr_rows += int(no_ttr or 0)
        neg_ttr_rows += int(neg_ttr or 0)
        if min_d is None or d < min_d:
            min_d = d
        if max_d is None or d > max_d:
            max_d = d

    records = sorted([bi, ds, hi] + v for (bi, ds, hi), v in cells.items())

    branch_regions = [aop_region.get(b) or erp_region.get(b) or "MH"
                      for b in branch_ids]

    # ---- branch groups, the same ones Employee Productivity and SR Allocation
    # collapse their first column by. Shipped so this sheet groups branches
    # identically instead of inventing a second grouping of the same branches;
    # a branch in no group gets a group of its own and so stays a plain row.
    groups, grouped = [], set()
    for g in EPR_BRANCH_GROUPS:
        members = [branch_idx[b] for b in g if b in branch_idx]
        if members:
            groups.append(members)
            grouped.update(members)
    for bi in range(len(branches)):
        if bi not in grouped:
            groups.append([bi])

    no_date_rows = int(db.query(func.count(ResponseTimeMaxTTR.id))
                       .filter(ResponseTimeMaxTTR.sr_close_date.is_(None))
                       .scalar() or 0)

    return {"success": True,
            "meta": {"min_date": min_d.isoformat() if min_d else None,
                     "max_date": max_d.isoformat() if max_d else None,
                     "counted_rows": counted,
                     "no_date_rows": no_date_rows,
                     "unmapped_branch_rows": unmapped_branch_rows,
                     # SR Types the head master does not place: {type: rows}
                     "unmapped_types": dict(sorted(unmapped_types.items(),
                                                   key=lambda kv: -kv[1])),
                     # a Response Time that is not a number at all - it can
                     # satisfy no window, so it only ever sits in the denominator
                     "no_ttr_rows": no_ttr_rows,
                     # a NEGATIVE Response Time: planned work finished before its
                     # scheduled open date. Inside every window, which is how the
                     # source file scores it too
                     "neg_ttr_rows": neg_ttr_rows,
                     "no_ftr_rows": 0},
            "heads": heads,
            "branches": branches, "branch_ids": branch_ids,
            "branch_regions": branch_regions, "groups": groups,
            "records": records,
            "working_days": _working_days_master(db),
            # Exact working days need the calendar, not just the monthly total:
            # a WEEK column containing 15 Aug has to lose that day, which a
            # month-level number cannot express.
            "holidays": {rg: sorted(d.isoformat() for d in days)
                         for rg, days in _holiday_sets(db).items()},
            "se_counts": _service_load_se_count_map(db),
            "targets": _service_load_targets_map(db),
            "pct_targets": _service_load_pct_targets_map(db),
            "manual": _service_load_manual_map(db)}


# ---------------- AOP MASTER: SERVICE LOAD AOP ----------------------------- #

def _service_load_targets_map(db: Session) -> dict:
    """Every saved monthly SR-closure target as {'YYYY-MM|branch_id': nos}. The
    sheet sums these itself - by branch for a branch row's AOP, by region for
    MH / KA, across everything for Total, and by month for the
    'Service Request Closure (Nos.)' strip - so one flat map covers whichever FY
    the page lands on."""
    return {"{}|{}".format(t.target_month, t.branch_id): t.sr_target
            for t in db.query(PmsServiceLoadTarget).all()
            if t.sr_target is not None}


def _service_load_pct_targets_map(db: Session) -> dict:
    """The percentage / ratio AOPs as {'fy|metric|scope|key': value}. These
    cannot be summed, so each row of the sheet carries its own - the same reason
    PmsCdiTarget is keyed on a (scope, scope_key) pair."""
    return {"{}|{}|{}|{}".format(t.fy, t.metric, t.scope, t.scope_key):
            t.target_value
            for t in db.query(PmsServiceLoadPctTarget).all()
            if t.target_value is not None}


def _service_load_se_count_map(db: Session) -> dict:
    """{branch_id: SE headcount} — the productivity denominator. A branch with
    no row is absent, and the sheet shows a dash for it rather than a figure
    divided by a guess."""
    return {r.branch_id: r.se_count
            for r in db.query(PmsServiceLoadSeCount).all()
            if r.se_count}


def list_service_load_se_counts(db: Session):
    """The SE Headcount grid of the Service Load AOP tab, over the same branch
    list the other grids use so the tabs can never show different branches."""
    rows = _service_load_branch_list(db)
    saved = _service_load_se_count_map(db)
    for r in rows:
        r["se_count"] = saved.get(r["key"])
    return {"items": rows}


def save_service_load_se_counts(db: Session, items: list, user_id: str):
    """Upsert the headcounts. A blank DELETES the row: 'nobody has told us' and
    'this branch has no engineers' are different statements, and only the second
    would justify printing a number."""
    existing = {r.branch_id: r for r in db.query(PmsServiceLoadSeCount).all()}
    saved = removed = 0
    for it in items or []:
        bid = _norm_branch_id(it.get("key") or it.get("branch_id"))
        if not bid:
            continue
        n = _as_int_or_none(it.get("se_count"))
        if n is not None and (n < 0 or n > 999):
            continue
        row = existing.get(bid)
        if n is None:
            if row is not None:
                db.delete(row)
                existing.pop(bid, None)
                removed += 1
            continue
        if row is None:
            row = PmsServiceLoadSeCount(branch_id=bid, created_by=user_id)
            db.add(row)
            existing[bid] = row
        row.se_count = n
        row.updated_by = user_id
        saved += 1
    db.commit()
    return {"success": True, "saved": saved, "removed": removed,
            **list_service_load_se_counts(db)}


def _service_load_manual_map(db: Session) -> dict:
    """The TYPED FTR / FVR figures as {'metric|period': value}.

    period is either a month ('2026-07') or a whole financial year ('FY2026',
    meaning Apr 2026 - Mar 2027), so the sheet can look a cell up by what it
    covers no matter which year is picked at the top. Keys are absolute rather
    than relative ('two years back') for exactly that reason."""
    return {"{}|{}".format(m.metric, m.period): m.value
            for m in db.query(PmsServiceLoadManual).all()
            if m.value is not None}


def list_service_load_manual(db: Session, fy_start: int):
    """The FTR / FVR tab of the Service Load AOP master: the three cumulative
    years the sheet prints and the twelve months of the picked year."""
    periods = (["FY{}".format(fy_start - 2), "FY{}".format(fy_start - 1),
                "FY{}".format(fy_start)] + _fy_months(fy_start))
    saved = {(m.metric, m.period): m.value
             for m in db.query(PmsServiceLoadManual)
             .filter(PmsServiceLoadManual.period.in_(periods)).all()}
    return {"fy": fy_start, "periods": periods,
            "metrics": list(SERVICE_LOAD_MANUAL_METRICS),
            "values": {m: {p: saved.get((m, p)) for p in periods}
                       for m in SERVICE_LOAD_MANUAL_METRICS}}


def save_service_load_manual(db: Session, fy_start: int, items: list, user_id: str):
    """Upsert the typed figures. A blank value DELETES its row, so the sheet
    shows a dash rather than 0% for a month nobody has filled in."""
    periods = set(["FY{}".format(fy_start - 2), "FY{}".format(fy_start - 1),
                   "FY{}".format(fy_start)] + _fy_months(fy_start))
    existing = {(m.metric, m.period): m
                for m in db.query(PmsServiceLoadManual)
                .filter(PmsServiceLoadManual.period.in_(list(periods))).all()}
    saved = removed = 0
    for it in items or []:
        metric = str(it.get("metric") or "").strip().lower()
        period = str(it.get("period") or "").strip()[:10]
        if metric not in SERVICE_LOAD_MANUAL_METRICS or period not in periods:
            continue
        val = _as_num_or_none(it.get("value"))
        if val is not None and (val < 0 or val > 100):
            continue                      # a percentage, and nothing else
        row = existing.get((metric, period))
        if val is None:
            if row is not None:
                db.delete(row)
                existing.pop((metric, period), None)
                removed += 1
            continue
        if row is None:
            row = PmsServiceLoadManual(metric=metric, period=period,
                                       created_by=user_id)
            db.add(row)
            existing[(metric, period)] = row
        row.value = val
        row.updated_by = user_id
        saved += 1
    db.commit()
    return {"success": True, "saved": saved, "removed": removed,
            **list_service_load_manual(db, fy_start)}


def _service_load_branch_list(db: Session):
    """The branch rows of the Service Load AOP tab. Same list the Target Master
    tab uses, with its saved name and region winning, so the tabs can never show
    different branches."""
    branches = {b: dict(info) for b, info in _profile_branches(db).items()}
    for bid, name, region in db.query(PmsBranchTarget.branch_id,
                                      PmsBranchTarget.branch_name,
                                      PmsBranchTarget.region).distinct():
        bid = _norm_branch_id(bid)
        if not bid or bid == "HO":
            continue
        info = branches.setdefault(bid, {"region": None, "name": None})
        if name:
            info["name"] = name.strip()
        if region:
            info["region"] = region.strip().upper()
    return [{"key": b,
             "name": info.get("name") or b,
             "region": (info.get("region") or "MH").upper()}
            for b, info in sorted(branches.items(),
                                  key=lambda kv: _branch_sort_key(kv[0]))]


def _fy_months(fy_start: int):
    """The twelve 'YYYY-MM' of a financial year, April first."""
    return ["{:04d}-{:02d}".format(fy_start if m <= 12 else fy_start + 1,
                                   m if m <= 12 else m - 12)
            for m in range(4, 16)]


def list_service_load_targets(db: Session, fy_start: int):
    """The Service Load AOP tab: a month x branch grid of SR-closure targets,
    plus the percentage / productivity AOPs per report row."""
    months = _fy_months(fy_start)
    rows = _service_load_branch_list(db)

    saved = {(t.target_month, t.branch_id): t.sr_target
             for t in db.query(PmsServiceLoadTarget)
             .filter(PmsServiceLoadTarget.target_month.in_(months)).all()}
    for r in rows:
        r["months"] = {m: saved.get((m, r["key"])) for m in months}

    pct = {(t.metric, t.scope, t.scope_key): t.target_value
           for t in db.query(PmsServiceLoadPctTarget)
           .filter(PmsServiceLoadPctTarget.fy == fy_start).all()}

    def _pct_block(scope, key):
        return {m: pct.get((m, scope, key)) for m in SERVICE_LOAD_METRICS}

    return {
        "fy": fy_start,
        "months": months,
        "metrics": list(SERVICE_LOAD_METRICS),
        "items": rows,
        "branch_pct": {r["key"]: _pct_block("branch", r["key"]) for r in rows},
        "region_pct": {rg: _pct_block("region", rg) for rg in ("MH", "KA")},
        "overall_pct": _pct_block("overall", "ALL"),
    }


def _as_int_or_none(raw):
    try:
        return None if raw in (None, "") else int(round(float(raw)))
    except (TypeError, ValueError):
        return None


def _as_num_or_none(raw):
    try:
        return None if raw in (None, "") else round(float(raw), 3)
    except (TypeError, ValueError):
        return None


def save_service_load_targets(db: Session, fy_start: int, items: list,
                              pct_items: list, user_id: str):
    """Upsert the FY's Service Load AOP. A blank / non-numeric value DELETES its
    row, so the sheet shows no AOP for it rather than a target of zero - the same
    rule the CDI and AMC target tabs follow."""
    months = set(_fy_months(fy_start))
    existing = {(t.target_month, t.branch_id): t
                for t in db.query(PmsServiceLoadTarget)
                .filter(PmsServiceLoadTarget.target_month.in_(list(months))).all()}
    saved = removed = 0
    for it in items or []:
        bid = _norm_branch_id(it.get("key"))
        month = str(it.get("month") or "").strip()[:7]
        if not bid or month not in months:
            continue
        nos = _as_int_or_none(it.get("sr_target"))
        row = existing.get((month, bid))
        if nos is None:
            if row is not None:
                db.delete(row)
                existing.pop((month, bid), None)
                removed += 1
            continue
        if row is None:
            row = PmsServiceLoadTarget(target_month=month, branch_id=bid,
                                       created_by=user_id)
            db.add(row)
            existing[(month, bid)] = row
        row.sr_target = nos
        row.updated_by = user_id
        saved += 1

    pct_existing = {(t.metric, t.scope, t.scope_key): t
                    for t in db.query(PmsServiceLoadPctTarget)
                    .filter(PmsServiceLoadPctTarget.fy == fy_start).all()}
    for it in pct_items or []:
        metric = str(it.get("metric") or "").strip().lower()
        scope = str(it.get("scope") or "").strip().lower()
        if metric not in SERVICE_LOAD_METRICS or scope not in CDI_TARGET_SCOPES:
            continue
        key = str(it.get("key") or "").strip()[:60]
        if scope == "branch":
            key = _norm_branch_id(key)
        elif scope == "region":
            key = key.upper()
        else:
            key = "ALL"
        if not key:
            continue
        val = _as_num_or_none(it.get("target_value"))
        row = pct_existing.get((metric, scope, key))
        if val is None:
            if row is not None:
                db.delete(row)
                pct_existing.pop((metric, scope, key), None)
                removed += 1
            continue
        if row is None:
            row = PmsServiceLoadPctTarget(fy=fy_start, metric=metric, scope=scope,
                                          scope_key=key, created_by=user_id)
            db.add(row)
            pct_existing[(metric, scope, key)] = row
        row.target_value = val
        row.updated_by = user_id
        saved += 1

    db.commit()
    return {"success": True, "saved": saved, "removed": removed,
            **list_service_load_targets(db, fy_start)}
