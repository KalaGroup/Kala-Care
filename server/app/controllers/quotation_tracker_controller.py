"""Open Quotation Tracker — the branch-wise service quotation and invoicing summary.

WHAT IT ANSWERS
    For a period, per branch: how much service business was QUOTED and how much
    was actually INVOICED, split into labour and parts. The gap between the two
    is open quotation value — business already asked for that has not converted.

THE TWO SOURCES (both are uploads on the Import page)

    'Pulse Quotation - Service Only'  ->  dbo.pulse_quotations      (the QUOTE half)
        Creation Date   the period the quotation falls in
        Service Dealer  the branch (this file carries NO branch id column)
        Labor Amount    a row with > 0 is one labour quotation; SUM is its value
        Parts Amount    a row with > 0 is one part quotation;   SUM is its value

    'All Invoice Detailed Report'     ->  dbo.all_invoice_report    (the INVOICE half)
        INVOICE DATE     the period the invoice falls in
        INVOICE STATUS   'Cancelled' lines are dropped (185 of the real export)
        INVOICE SEGMENT  'Service' only — drops OTC (15,747) and Agreement (76)
        BRANCH ID        the branch, and the JOIN KEY to the quote half
        INVOICE TYPE     'Labor' -> the labour columns, 'Parts' -> the part ones
        INVOICE AMOUNT   SUM is the invoiced value

QUOTES AND INVOICES ARE NOT LINE-MATCHED
    The invoice report carries no quotation reference, so a branch's quote and
    invoice figures are read SIDE BY SIDE for the same period — they are not the
    same transactions matched up. An invoice raised in the period may answer a
    quotation from before it. The page prints this under the table; it is the one
    thing that would otherwise be misread as a conversion rate.

THE BRANCH JOIN
    The quote file names its branch ("KALA Care Global LLP - Ahmednagar") and the
    invoice file names AND numbers its own ("420435_2"), so the row identity is
    the BRANCH CODE and the name is only the label. The code for a quote row is
    resolved from the name, against:
      1. the invoice table's own (branch_id, branch_name) pairs — authoritative,
         because both files come out of the same ERP; and
      2. ERP_BRANCHES, which lists the same 13 branches under the names the rest
         of this app uses. Four of them differ from the invoice file's spelling
         (Ch.Sambhaji Nagar / Aurangabad, Ahilyanagar / Ahmednagar, Gulbarga /
         Kalaburagi, Bijapur / Vijayapura), so those are aliased explicitly.
    A dealer name that resolves to no code still gets its own row, keyed on the
    name, and is named in the response's `unmapped_dealers` — so it reads as a
    mapping to fix rather than as business that vanished.
"""

import re
from datetime import date, datetime, timedelta

from sqlalchemy import case, func, or_, text
from sqlalchemy.orm import Session

from app.models.customer_model import AllInvoiceReport, PulseQuotation
from app.controllers.pms_controller import ERP_BRANCHES


# ---------------- what the report keeps out ---------------------------------- #

# The one invoice status that is not business. Everything else ('New',
# 'Invoiced') counts.
CANCELLED_STATUS = "cancelled"
# The one invoice segment that IS service business. OTC is counter sale and
# Agreement is AMC billing; neither belongs to a service quotation.
SERVICE_SEGMENT = "service"


# ---------------- branch identity ------------------------------------------- #

def _branch_key(name) -> str:
    """A branch's identity from a name, however it was written.

    Both files prefix the dealership onto the branch ("KALA Care Global LLP -
    Ahmednagar"), so everything up to the last ' - ' is dropped, then letters and
    digits only, upper case. 'KALA Care Global LLP - Ch. Sambhaji Nagar',
    'CH SAMBHAJINAGAR' and 'Chhatrapati-Sambhajinagar' cannot become three
    branches this way.
    """
    text_ = str(name or "").strip()
    if not text_:
        return ""
    # The dealership prefix, when there is one: keep the LAST ' - ' segment.
    parts = re.split(r"\s+-\s+", text_)
    tail = parts[-1] if parts else text_
    return re.sub(r"[^A-Z0-9]+", "", tail.upper())


def _branch_label(name) -> str:
    """The branch as it should be PRINTED: the same tail, spelling intact."""
    text_ = str(name or "").strip()
    if not text_:
        return ""
    parts = re.split(r"\s+-\s+", text_)
    return (parts[-1] if parts else text_).strip()


# The four branches the ERP master and the invoice export spell differently.
# Same branch, two names in use — without these the quote half of, say,
# Kalaburagi would sit on a row of its own next to the invoice half.
BRANCH_NAME_ALIASES = {
    "CHSAMBHAJINAGAR": "AURANGABAD",
    "AHILYANAGAR": "AHMEDNAGAR",
    "GULBARGA": "KALABURAGI",
    "BIJAPUR": "VIJAYAPURA",
    "BABHALESHWAR": "BABHLESHWAR",
    "BAGALKOT": "BAGALKOTE",
}


def _canon_key(name) -> str:
    """_branch_key(), with the known renames folded onto one spelling."""
    key = _branch_key(name)
    return BRANCH_NAME_ALIASES.get(key, key)


def _branch_directory(db: Session):
    """{branch key -> (branch_id, label)} for every branch the app knows.

    The invoice table's own pairs win, because they are this ERP's current
    spelling and they carry the code the report is keyed on. ERP_BRANCHES fills
    in any branch the invoice file has not mentioned yet.
    """
    directory = {}

    for _region, branch_id, name in ERP_BRANCHES:
        key = _canon_key(name)
        if key:
            directory[key] = (branch_id, _branch_label(name))

    rows = (db.query(AllInvoiceReport.branch_id, AllInvoiceReport.branch_name)
            .filter(AllInvoiceReport.branch_id.isnot(None),
                    AllInvoiceReport.branch_name.isnot(None))
            .distinct().all())
    for branch_id, branch_name in rows:
        key = _canon_key(branch_name)
        if key:
            directory[key] = (branch_id, _branch_label(branch_name))

    return directory


# ---------------- cache ------------------------------------------------------ #

# The two tables this report reads, fingerprinted the way the PMS reports are:
# row count + MAX(id) + last update. The last update matters on BOTH — each is
# upserted (pulse on Instance Id + Quote ID, invoices on INVOICE NUMBER), so a
# re-upload that only corrects amounts or fills a date in on rows that already
# exist moves neither the count nor MAX(id).
_VERSION_SQL = text("""
    SELECT (SELECT COUNT(*) FROM dbo.pulse_quotations),
           (SELECT ISNULL(MAX(id), 0) FROM dbo.pulse_quotations),
           (SELECT ISNULL(CONVERT(VARCHAR(30), MAX(updated_at), 126), '')
              FROM dbo.pulse_quotations),
           (SELECT COUNT(*) FROM dbo.all_invoice_report),
           (SELECT ISNULL(MAX(id), 0) FROM dbo.all_invoice_report),
           (SELECT ISNULL(CONVERT(VARCHAR(30), MAX(updated_at), 126), '')
              FROM dbo.all_invoice_report)
""")

_REPORT_CACHE = {}
_REPORT_CACHE_MAX = 24


def _data_version(db: Session):
    """A cheap fingerprint of the two tables the report reads."""
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


# ---------------- period ----------------------------------------------------- #

def parse_period(date_from, date_to):
    """('YYYY-MM-DD', 'YYYY-MM-DD') -> (start, end, end_exclusive).

    Both ends are INCLUSIVE dates, which is how the business reads a period, so
    the SQL bound is end + 1 day: an invoice stamped '07-07-2026 16:40' belongs
    to a period ending on the 7th.
    """
    def one(value, fallback):
        if not value:
            return fallback
        try:
            return datetime.strptime(str(value)[:10], "%Y-%m-%d").date()
        except ValueError:
            return fallback

    today = date.today()
    # Default period: this financial year so far (Indian FY starts 1 April).
    fy_start = date(today.year if today.month >= 4 else today.year - 1, 4, 1)

    start = one(date_from, fy_start)
    end = one(date_to, today)
    if end < start:
        start, end = end, start
    return start, end, end + timedelta(days=1)


# ---------------- the report ------------------------------------------------- #

def _quote_rows(db: Session, start, end_exclusive):
    """Per Service Dealer: quotation counts and value, both halves.

    One grouped aggregate — a row counts as a labour quotation when its Labor
    Amount is above zero and as a part quotation when its Parts Amount is,
    so a quote carrying both is counted on both sides (that is what the two
    pairs of columns mean). The VALUE columns sum the amount column itself.
    """
    labour_hit = case((PulseQuotation.labor_amount > 0, 1), else_=0)
    part_hit = case((PulseQuotation.parts_amount > 0, 1), else_=0)

    return (db.query(
                PulseQuotation.service_dealer,
                func.sum(labour_hit),
                func.sum(func.coalesce(PulseQuotation.labor_amount, 0.0)),
                func.sum(part_hit),
                func.sum(func.coalesce(PulseQuotation.parts_amount, 0.0)))
            .filter(PulseQuotation.creation_date.isnot(None),
                    PulseQuotation.creation_date >= start,
                    PulseQuotation.creation_date < end_exclusive)
            .group_by(PulseQuotation.service_dealer)
            .all())


def _invoice_rows(db: Session, start, end_exclusive):
    """Per branch and invoice type: invoice counts and value.

    Cancelled lines are out, and only the Service segment is in — OTC is counter
    sale and Agreement is AMC billing, neither of which answers a service
    quotation. A line with no status counts: only 'Cancelled' is excluded.
    """
    return (db.query(
                AllInvoiceReport.branch_id,
                AllInvoiceReport.branch_name,
                AllInvoiceReport.invoice_type,
                func.count(AllInvoiceReport.id),
                func.sum(func.coalesce(AllInvoiceReport.invoice_amount, 0.0)))
            .filter(AllInvoiceReport.invoice_date.isnot(None),
                    AllInvoiceReport.invoice_date >= start,
                    AllInvoiceReport.invoice_date < end_exclusive,
                    func.lower(func.rtrim(func.ltrim(
                        func.coalesce(AllInvoiceReport.invoice_segment, '')))) == SERVICE_SEGMENT,
                    or_(AllInvoiceReport.invoice_status.is_(None),
                        func.lower(func.rtrim(func.ltrim(
                            AllInvoiceReport.invoice_status))) != CANCELLED_STATUS))
            .group_by(AllInvoiceReport.branch_id,
                      AllInvoiceReport.branch_name,
                      AllInvoiceReport.invoice_type)
            .all())


def _blank_row():
    return {
        "branch_id": None,
        "branch": "",
        "labour_quote": 0,
        "labour_quote_amount": 0.0,
        "labour_invoice": 0,
        "labour_invoice_amount": 0.0,
        "part_quote": 0,
        "part_quote_amount": 0.0,
        "part_invoice": 0,
        "part_invoice_amount": 0.0,
    }


def _invoice_side(invoice_type):
    """'Labor'/'Labour' -> 'labour', 'Parts'/'Part' -> 'part', else None."""
    key = re.sub(r"[^a-z]+", "", str(invoice_type or "").lower())
    if key.startswith("labo"):
        return "labour"
    if key.startswith("part"):
        return "part"
    return None


def build_report(db: Session, date_from=None, date_to=None):
    """The whole sheet: one row per branch, plus the grand total."""
    start, end, end_exclusive = parse_period(date_from, date_to)

    def build():
        directory = _branch_directory(db)
        rows = {}          # row key -> row dict
        unmapped = {}      # dealer label -> quotation count, for the note

        def row_for(key, branch_id, label):
            row = rows.get(key)
            if row is None:
                row = _blank_row()
                rows[key] = row
            if branch_id and not row["branch_id"]:
                row["branch_id"] = branch_id
            if label and not row["branch"]:
                row["branch"] = label
            return row

        # ---- quote half: Service Dealer -> branch code ----
        for dealer, l_cnt, l_amt, p_cnt, p_amt in _quote_rows(db, start, end_exclusive):
            key = _canon_key(dealer)
            label = _branch_label(dealer)
            known = directory.get(key)
            if not key:
                # A quotation with no Service Dealer at all: it belongs to no
                # branch, so it is named rather than silently added to one.
                unmapped["(no Service Dealer)"] = unmapped.get("(no Service Dealer)", 0) + \
                    int(l_cnt or 0) + int(p_cnt or 0)
                key = "__NO_DEALER__"
                label = "Unmapped Branch"
            elif known is None:
                unmapped[label or key] = unmapped.get(label or key, 0) + \
                    int(l_cnt or 0) + int(p_cnt or 0)

            branch_id = known[0] if known else None
            row = row_for(key, branch_id, (known[1] if known else label))
            row["labour_quote"] += int(l_cnt or 0)
            row["labour_quote_amount"] += float(l_amt or 0.0)
            row["part_quote"] += int(p_cnt or 0)
            row["part_quote_amount"] += float(p_amt or 0.0)

        # ---- invoice half: keyed on the branch NAME so it meets the quote
        #      half on the same row, and carrying the branch code with it ----
        for branch_id, branch_name, invoice_type, count, amount in _invoice_rows(
                db, start, end_exclusive):
            side = _invoice_side(invoice_type)
            if side is None:
                continue          # neither labour nor parts: nothing to add to
            key = _canon_key(branch_name) or f"__BID__{branch_id or ''}"
            row = row_for(key, branch_id, _branch_label(branch_name) or (branch_id or ""))
            row[f"{side}_invoice"] += int(count or 0)
            row[f"{side}_invoice_amount"] += float(amount or 0.0)

        out = sorted(rows.values(), key=lambda r: (r["branch"] or "").upper())

        total = _blank_row()
        total["branch"] = "Grand Total"
        for row in out:
            for field in total:
                if field in ("branch", "branch_id"):
                    continue
                total[field] += row[field]

        return {
            "rows": out,
            "total": total,
            "unmapped_dealers": [{"dealer": d, "quotations": n}
                                 for d, n in sorted(unmapped.items())],
        }

    payload = _cached(db, ("quotation_tracker", str(start), str(end)), build)
    return {
        "period": {"from": start.isoformat(), "to": end.isoformat()},
        **payload,
    }


def data_status(db: Session):
    """Row count and last upload per source file — shown on the page header so a
    figure that looks wrong can be checked against what was actually loaded."""
    def one(model, date_col):
        count, last_upload, first_date, last_date = db.query(
            func.count(model.id),
            func.max(model.updated_at),
            func.min(date_col),
            func.max(date_col),
        ).first()
        return {
            "rows": int(count or 0),
            "last_upload": last_upload,
            "date_from": first_date,
            "date_to": last_date,
        }

    return {
        "quotes": one(PulseQuotation, PulseQuotation.creation_date),
        "invoices": one(AllInvoiceReport, AllInvoiceReport.invoice_date),
    }
