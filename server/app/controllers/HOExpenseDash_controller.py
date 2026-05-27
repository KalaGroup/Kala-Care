from sqlalchemy.orm import Session
from sqlalchemy import func, text
from typing import List, Dict, Any, Optional
from datetime import datetime, timedelta
from collections import defaultdict
from dateutil import parser as date_parser
from app.models.TADA_model import TADAImport
from app.models.TADA_history_model import TADAHistory
from app.models.OE_model import OfficeExpense
from app.models.OEH_model import OfficeExpenseHistory
from app.models.LVB_model import LocalVendorBill, LocalVendorBillHistory

BRANCH_MAP = {
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
    '420435_14': 'Bijapur',
}

BRANCH_ORDER = list(BRANCH_MAP.keys())


# ──────────────────────────────────────────────────────────────────
# Generic helpers
# ──────────────────────────────────────────────────────────────────
def _parse_date_safe(date_str):
    """Safely parse string dates from history records."""
    if not date_str:
        return None
    s = str(date_str).strip()
    if not s or s.lower() in ('null', 'none', '-', 'nan', '0'):
        return None
    try:
        parsed = date_parser.parse(s, dayfirst=False, fuzzy=False)
        min_valid = datetime(2020, 1, 1)
        max_valid = datetime.now() + timedelta(days=30)
        if parsed < min_valid or parsed > max_valid:
            return None
        return parsed
    except Exception:
        return None


def _safe_float(val) -> float:
    try:
        if val is None or str(val).strip() == '':
            return 0.0
        return float(val)
    except (ValueError, TypeError):
        return 0.0


# ──────────────────────────────────────────────────────────────────
# Dynamic amount calculation helpers (mirror of frontend logic)
# Used for unverified records where total_amount is NULL in DB.
# ──────────────────────────────────────────────────────────────────
def _get_branch_km_rates(db: Session) -> Dict[str, Dict[str, Any]]:
    """Fetch all branch KM/DA rates from branch_km_rates table."""
    try:
        rows = db.execute(text("""
            SELECT branch_code, km_rate, range_start_km, range_end_km,
                   range_amount, above_km, above_amount
            FROM branch_km_rates
        """)).fetchall()
        rates = {}
        for r in rows:
            rates[r.branch_code] = {
                'km_rate':        _safe_float(r.km_rate),
                'range_start_km': float(r.range_start_km) if r.range_start_km is not None else None,
                'range_end_km':   float(r.range_end_km)   if r.range_end_km   is not None else None,
                'range_amount':   _safe_float(r.range_amount),
                'above_km':       float(r.above_km)       if r.above_km       is not None else None,
                'above_amount':   _safe_float(r.above_amount),
            }
        return rates
    except Exception as e:
        print(f"[KM rates] Could not load: {e}")
        return {}


def _effective_km(record) -> Optional[float]:
    """Priority: ho_corrected_km → branch_verified_km → two_way_km."""
    for field in ('ho_corrected_km', 'branch_verified_km', 'two_way_km'):
        val = getattr(record, field, None)
        if val is None:
            continue
        s = str(val).strip()
        if not s:
            continue
        try:
            return float(s)
        except (ValueError, TypeError):
            continue
    return None


def _calc_da(km: float, rate: Dict[str, Any]) -> float:
    """Range-based DA, falls back to above-range DA."""
    rs, re_, ak = rate['range_start_km'], rate['range_end_km'], rate['above_km']
    if rs is not None and re_ is not None and rs <= km <= re_:
        return rate['range_amount']
    if ak is not None and km > ak:
        return rate['above_amount']
    return 0.0


def _calc_total(km: Optional[float], rate: Optional[Dict[str, Any]]) -> float:
    """Total = (km × km_rate) + DA."""
    if km is None or not rate or rate['km_rate'] <= 0:
        return 0.0
    return (km * rate['km_rate']) + _calc_da(km, rate)


# ──────────────────────────────────────────────────────────────────
# 1) All branches – verified expense (BAR CHART, with date range)
# ──────────────────────────────────────────────────────────────────
def get_all_branches_verified_expense(
    db: Session,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """
    Total VERIFIED expense per branch from TADAHistory.
    Optional time filter on sr_reach_at_site_datetime.
    Always returns all 15 branches in fixed order.
    """
    df, dt = None, None
    if date_from:
        try:
            df = datetime.strptime(date_from, '%Y-%m-%d')
        except Exception:
            df = None
    if date_to:
        try:
            dt = datetime.strptime(date_to, '%Y-%m-%d') + timedelta(days=1)  # inclusive
        except Exception:
            dt = None

    records = db.query(TADAHistory).filter(
        TADAHistory.verification_status == 'Verified',
        TADAHistory.sd_branch_code.in_(BRANCH_ORDER),
    ).all()

    totals = defaultdict(lambda: {'total_amount': 0.0, 'record_count': 0})

    for r in records:
        if df or dt:
            rec_date = _parse_date_safe(r.sr_reach_at_site_datetime)
            if not rec_date:
                continue
            if df and rec_date < df:
                continue
            if dt and rec_date >= dt:
                continue

        branch = r.sd_branch_code
        if branch not in BRANCH_MAP:
            continue

        totals[branch]['total_amount'] += _safe_float(r.total_amount)
        totals[branch]['record_count'] += 1

    return [
        {
            'branch_code': bc,
            'branch_name': BRANCH_MAP[bc],
            'total_amount': round(totals[bc]['total_amount'], 2),
            'record_count': totals[bc]['record_count'],
        }
        for bc in BRANCH_ORDER
    ]


# ──────────────────────────────────────────────────────────────────
# 2) Single branch – 12-month expense trend (LINE CHART)
# ──────────────────────────────────────────────────────────────────
def get_branch_monthly_expense(
    db: Session,
    branch_code: str,
    year: int,
) -> List[Dict[str, Any]]:
    """
    Monthly verified expense for a branch in a given year (Jan-Dec).
    Grouped by moved_at (when the record was submitted to history).
    """
    if branch_code not in BRANCH_MAP:
        return []

    months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
              'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    monthly = {
        i: {'month': months[i - 1], 'month_num': i,
            'total_amount': 0.0, 'record_count': 0}
        for i in range(1, 13)
    }

    start = datetime(year, 1, 1)
    end = datetime(year + 1, 1, 1)

    records = db.query(TADAHistory).filter(
        TADAHistory.sd_branch_code == branch_code,
        TADAHistory.verification_status == 'Verified',
        TADAHistory.moved_at >= start,
        TADAHistory.moved_at < end,
    ).all()

    for r in records:
        if not r.moved_at:
            continue
        m = r.moved_at.month
        monthly[m]['total_amount'] += _safe_float(r.total_amount)
        monthly[m]['record_count'] += 1

    return [
        {
            'month': monthly[i]['month'],
            'month_num': i,
            'total_amount': round(monthly[i]['total_amount'], 2),
            'record_count': monthly[i]['record_count'],
        }
        for i in range(1, 13)
    ]

# ──────────────────────────────────────────────────────────────────
# 3) All branches – unverified expense (count + dynamic amount)
# ──────────────────────────────────────────────────────────────────
def get_all_branches_unverified_count(db: Session) -> List[Dict[str, Any]]:
    """
    Per-branch UNVERIFIED record count + amount from TADAImport.
    A record is "unverified" when verification_status is NULL or not 'Verified'.

    Why we calculate amount dynamically:
        TADAImport.total_amount is only written when a user clicks
        "verify" on the frontend. For pending records the column is NULL,
        so summing it gives 0. We instead replicate the frontend formula
        (km × km_rate + DA) using branch_km_rates.
    """
    branch_data = {code: {'unverified_count': 0, 'total_amount': 0.0}
                   for code in BRANCH_MAP}

    km_rates = _get_branch_km_rates(db)
    ho_rate = km_rates.get('HO')  # fallback rate when branch has no rate set

    rows = db.query(
        TADAImport.sd_branch_code,
        TADAImport.total_amount,
        TADAImport.ho_corrected_km,
        TADAImport.branch_verified_km,
        TADAImport.two_way_km,
    ).filter(
        (TADAImport.verification_status != 'Verified') |
        (TADAImport.verification_status.is_(None)),
        TADAImport.sd_branch_code.in_(BRANCH_ORDER),
    ).all()

    for r in rows:
        branch = r.sd_branch_code
        if branch not in branch_data:
            continue

        branch_data[branch]['unverified_count'] += 1

        # 1) Use stored total_amount if it's already populated
        amt = _safe_float(r.total_amount)

        # 2) Otherwise calculate dynamically (mirrors frontend logic)
        if amt <= 0:
            km = _effective_km(r)
            rate = km_rates.get(branch) or ho_rate
            amt = _calc_total(km, rate)

        branch_data[branch]['total_amount'] += amt

    return [
        {
            'branch_code': bc,
            'branch_name': BRANCH_MAP[bc],
            'unverified_count': branch_data[bc]['unverified_count'],
            'total_amount': round(branch_data[bc]['total_amount'], 2),
        }
        for bc in BRANCH_ORDER
    ]


# ──────────────────────────────────────────────────────────────────
# 4) Available years (for line-chart year dropdown)
# ──────────────────────────────────────────────────────────────────
def get_available_years(db: Session, branch_code: Optional[str] = None) -> List[int]:
    """Distinct years that have verified history records."""
    q = db.query(TADAHistory).filter(TADAHistory.verification_status == 'Verified')
    if branch_code:
        q = q.filter(TADAHistory.sd_branch_code == branch_code)

    years = set()
    for r in q.all():
        d = _parse_date_safe(r.sr_reach_at_site_datetime)
        if d:
            years.add(d.year)

    if not years:
        years.add(datetime.now().year)

    return sorted(years, reverse=True)


# ──────────────────────────────────────────────────────────────────
# 5) Top-summary KPIs (used by header cards)
# ──────────────────────────────────────────────────────────────────
def get_dashboard_kpis(db: Session) -> Dict[str, Any]:
    verified_total = sum(
        _safe_float(r.total_amount)
        for r in db.query(TADAHistory.total_amount).filter(
            TADAHistory.verification_status == 'Verified',
            TADAHistory.sd_branch_code.in_(BRANCH_ORDER),
        ).all()
    )
    verified_count = db.query(func.count(TADAHistory.id)).filter(
        TADAHistory.verification_status == 'Verified',
        TADAHistory.sd_branch_code.in_(BRANCH_ORDER),
    ).scalar() or 0

    unverified_count = db.query(func.count(TADAImport.id)).filter(
        (TADAImport.verification_status != 'Verified') |
        (TADAImport.verification_status.is_(None)),
        TADAImport.sd_branch_code.in_(BRANCH_ORDER),
    ).scalar() or 0

    return {
        'total_verified_amount': round(verified_total, 2),
        'total_verified_count': verified_count,
        'total_unverified_count': unverified_count,
        'total_branches': len(BRANCH_ORDER),
    }

# 1) All branches – verified office expense (BAR CHART, with date range)
def get_all_branches_office_verified_expense(
    db: Session,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
) -> List[Dict[str, Any]]:
    df, dt = None, None
    if date_from:
        try:
            df = datetime.strptime(date_from, '%Y-%m-%d')
        except Exception:
            df = None
    if date_to:
        try:
            dt = datetime.strptime(date_to, '%Y-%m-%d') + timedelta(days=1)
        except Exception:
            dt = None

    q = db.query(OfficeExpenseHistory).filter(
        OfficeExpenseHistory.branch_code.in_(BRANCH_ORDER),
    )
    if df:
        q = q.filter(OfficeExpenseHistory.paid_date >= df)
    if dt:
        q = q.filter(OfficeExpenseHistory.paid_date < dt)

    totals = defaultdict(lambda: {'total_amount': 0.0, 'record_count': 0})
    for r in q.all():
        if r.branch_code not in BRANCH_MAP:
            continue
        totals[r.branch_code]['total_amount'] += _safe_float(r.amount)
        totals[r.branch_code]['record_count'] += 1

    return [
        {
            'branch_code': bc,
            'branch_name': BRANCH_MAP[bc],
            'total_amount': round(totals[bc]['total_amount'], 2),
            'record_count': totals[bc]['record_count'],
        }
        for bc in BRANCH_ORDER
    ]


# 2) Single branch – 12-month office expense trend (LINE CHART)
def get_branch_monthly_office_expense(
    db: Session,
    branch_code: str,
    year: int,
) -> List[Dict[str, Any]]:
    """
    Monthly verified office expense for a branch.
    Grouped by moved_at (when the record was submitted to history).
    """
    if branch_code not in BRANCH_MAP:
        return []

    months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
              'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    monthly = {
        i: {'month': months[i - 1], 'month_num': i,
            'total_amount': 0.0, 'record_count': 0}
        for i in range(1, 13)
    }

    start = datetime(year, 1, 1)
    end = datetime(year + 1, 1, 1)

    records = db.query(OfficeExpenseHistory).filter(
        OfficeExpenseHistory.branch_code == branch_code,
        OfficeExpenseHistory.moved_at >= start,
        OfficeExpenseHistory.moved_at < end,
    ).all()

    for r in records:
        if not r.moved_at:
            continue
        m = r.moved_at.month
        monthly[m]['total_amount'] += _safe_float(r.amount)
        monthly[m]['record_count'] += 1

    return [
        {
            'month': monthly[i]['month'],
            'month_num': i,
            'total_amount': round(monthly[i]['total_amount'], 2),
            'record_count': monthly[i]['record_count'],
        }
        for i in range(1, 13)
    ]

# 3) All branches – unverified office expense (count + amount)
def get_all_branches_office_unverified(db: Session) -> List[Dict[str, Any]]:
    """
    Anything still in OfficeExpense (not yet moved to history) counts as
    "unverified" — including records whose verification_status='Verified'
    but which haven't been submitted to history yet.
    """
    branch_data = {code: {'unverified_count': 0, 'total_amount': 0.0}
                   for code in BRANCH_MAP}

    rows = db.query(
        OfficeExpense.branch_code,
        OfficeExpense.amount,
    ).filter(
        OfficeExpense.is_deleted == False,           # noqa: E712
        OfficeExpense.branch_code.in_(BRANCH_ORDER),
    ).all()

    for r in rows:
        if r.branch_code not in branch_data:
            continue
        branch_data[r.branch_code]['unverified_count'] += 1
        branch_data[r.branch_code]['total_amount'] += _safe_float(r.amount)

    return [
        {
            'branch_code': bc,
            'branch_name': BRANCH_MAP[bc],
            'unverified_count': branch_data[bc]['unverified_count'],
            'total_amount': round(branch_data[bc]['total_amount'], 2),
        }
        for bc in BRANCH_ORDER
    ]


# 4) Available years (for line-chart year dropdown)
def get_office_available_years(db: Session, branch_code: Optional[str] = None) -> List[int]:
    q = db.query(OfficeExpenseHistory.paid_date)
    if branch_code:
        q = q.filter(OfficeExpenseHistory.branch_code == branch_code)

    years = set()
    for (pd_,) in q.all():
        if pd_:
            years.add(pd_.year)

    if not years:
        years.add(datetime.now().year)

    return sorted(years, reverse=True)


# 5) Office Expense KPIs
def get_office_dashboard_kpis(db: Session) -> Dict[str, Any]:
    verified_total = db.query(func.coalesce(func.sum(OfficeExpenseHistory.amount), 0.0)).filter(
        OfficeExpenseHistory.branch_code.in_(BRANCH_ORDER),
    ).scalar() or 0.0

    verified_count = db.query(func.count(OfficeExpenseHistory.id)).filter(
        OfficeExpenseHistory.branch_code.in_(BRANCH_ORDER),
    ).scalar() or 0

    unverified_count = db.query(func.count(OfficeExpense.id)).filter(
        OfficeExpense.is_deleted == False,           # noqa: E712
        OfficeExpense.branch_code.in_(BRANCH_ORDER),
    ).scalar() or 0

    return {
        'total_verified_amount': round(float(verified_total), 2),
        'total_verified_count': verified_count,
        'total_unverified_count': unverified_count,
        'total_branches': len(BRANCH_ORDER),
    }    

# 1) All branches – verified vendor bills (BAR CHART, with date range)
def get_all_branches_vendor_verified(
    db: Session,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
) -> List[Dict[str, Any]]:
    df, dt = None, None
    if date_from:
        try:
            df = datetime.strptime(date_from, '%Y-%m-%d')
        except Exception:
            df = None
    if date_to:
        try:
            dt = datetime.strptime(date_to, '%Y-%m-%d') + timedelta(days=1)
        except Exception:
            dt = None

    q = db.query(LocalVendorBillHistory).filter(
        LocalVendorBillHistory.branch_code.in_(BRANCH_ORDER),
    )
    if df:
        q = q.filter(LocalVendorBillHistory.invoice_date >= df)
    if dt:
        q = q.filter(LocalVendorBillHistory.invoice_date < dt)

    totals = defaultdict(lambda: {'total_amount': 0.0, 'record_count': 0})
    for r in q.all():
        if r.branch_code not in BRANCH_MAP:
            continue
        totals[r.branch_code]['total_amount'] += _safe_float(r.payment_amount)
        totals[r.branch_code]['record_count'] += 1

    return [
        {
            'branch_code': bc,
            'branch_name': BRANCH_MAP[bc],
            'total_amount': round(totals[bc]['total_amount'], 2),
            'record_count': totals[bc]['record_count'],
        }
        for bc in BRANCH_ORDER
    ]


# 2) Single branch – 12-month vendor bills trend (LINE CHART)
def get_branch_monthly_vendor(
    db: Session,
    branch_code: str,
    year: int,
) -> List[Dict[str, Any]]:
    """
    Monthly verified vendor bills for a branch.
    Grouped by moved_at (when the record was submitted to history).
    """
    if branch_code not in BRANCH_MAP:
        return []

    months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
              'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    monthly = {
        i: {'month': months[i - 1], 'month_num': i,
            'total_amount': 0.0, 'record_count': 0}
        for i in range(1, 13)
    }

    start = datetime(year, 1, 1)
    end = datetime(year + 1, 1, 1)

    records = db.query(LocalVendorBillHistory).filter(
        LocalVendorBillHistory.branch_code == branch_code,
        LocalVendorBillHistory.moved_at >= start,
        LocalVendorBillHistory.moved_at < end,
    ).all()

    for r in records:
        if not r.moved_at:
            continue
        m = r.moved_at.month
        monthly[m]['total_amount'] += _safe_float(r.payment_amount)
        monthly[m]['record_count'] += 1

    return [
        {
            'month': monthly[i]['month'],
            'month_num': i,
            'total_amount': round(monthly[i]['total_amount'], 2),
            'record_count': monthly[i]['record_count'],
        }
        for i in range(1, 13)
    ]


# 3) All branches – unverified vendor bills (count + amount)
def get_all_branches_vendor_unverified(db: Session) -> List[Dict[str, Any]]:
    """
    Anything still in LocalVendorBill (not yet moved to history) counts as
    "unverified" — including records whose verification_status='Verified'
    but which haven't been submitted to history yet.
    """
    branch_data = {code: {'unverified_count': 0, 'total_amount': 0.0}
                   for code in BRANCH_MAP}

    rows = db.query(
        LocalVendorBill.branch_code,
        LocalVendorBill.payment_amount,
    ).filter(
        LocalVendorBill.is_deleted == False,           # noqa: E712
        LocalVendorBill.branch_code.in_(BRANCH_ORDER),
    ).all()

    for r in rows:
        if r.branch_code not in branch_data:
            continue
        branch_data[r.branch_code]['unverified_count'] += 1
        branch_data[r.branch_code]['total_amount'] += _safe_float(r.payment_amount)

    return [
        {
            'branch_code': bc,
            'branch_name': BRANCH_MAP[bc],
            'unverified_count': branch_data[bc]['unverified_count'],
            'total_amount': round(branch_data[bc]['total_amount'], 2),
        }
        for bc in BRANCH_ORDER
    ]


# 4) Available years (for line-chart year dropdown)
def get_vendor_available_years(db: Session, branch_code: Optional[str] = None) -> List[int]:
    q = db.query(LocalVendorBillHistory.invoice_date)
    if branch_code:
        q = q.filter(LocalVendorBillHistory.branch_code == branch_code)

    years = set()
    for (idate,) in q.all():
        if idate:
            years.add(idate.year)

    if not years:
        years.add(datetime.now().year)

    return sorted(years, reverse=True)


# 5) Local Vendor Bills KPIs
def get_vendor_dashboard_kpis(db: Session) -> Dict[str, Any]:
    verified_total = db.query(func.coalesce(func.sum(LocalVendorBillHistory.payment_amount), 0.0)).filter(
        LocalVendorBillHistory.branch_code.in_(BRANCH_ORDER),
    ).scalar() or 0.0

    verified_count = db.query(func.count(LocalVendorBillHistory.id)).filter(
        LocalVendorBillHistory.branch_code.in_(BRANCH_ORDER),
    ).scalar() or 0

    unverified_count = db.query(func.count(LocalVendorBill.id)).filter(
        LocalVendorBill.is_deleted == False,           # noqa: E712
        LocalVendorBill.branch_code.in_(BRANCH_ORDER),
    ).scalar() or 0

    return {
        'total_verified_amount': round(float(verified_total), 2),
        'total_verified_count': verified_count,
        'total_unverified_count': unverified_count,
        'total_branches': len(BRANCH_ORDER),
    }
