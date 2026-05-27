from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List, Dict, Any, Optional
from datetime import datetime, timedelta
from collections import defaultdict

from app.models.TADA_model import TADAImport
from app.models.TADA_history_model import TADAHistory
from app.models.OE_model import OfficeExpense
from app.models.OEH_model import OfficeExpenseHistory
from app.models.LVB_model import LocalVendorBill, LocalVendorBillHistory

# Reuse the helpers + branch map already defined for HO dashboard
from app.controllers.HOExpenseDash_controller import (
    _parse_date_safe, _safe_float,
    _get_branch_km_rates, _effective_km, _calc_total,
    BRANCH_MAP,
)


def _ok(branch_code: str) -> bool:
    return branch_code in BRANCH_MAP


# ──────────────────────────────────────────────────────────────────
# 1) Branch KPIs (4 numbers: verified count/amount, unverified count/amount)
# ──────────────────────────────────────────────────────────────────
def get_branch_kpis(db: Session, branch_code: str) -> Dict[str, Any]:
    base = {
        'branch_code': branch_code,
        'branch_name': BRANCH_MAP.get(branch_code, branch_code),
        'total_verified_amount': 0,
        'total_verified_count': 0,
        'total_unverified_amount': 0,
        'total_unverified_count': 0,
    }
    if not _ok(branch_code):
        return base

    # Verified totals (from history)
    verified_total = sum(
        _safe_float(r.total_amount)
        for r in db.query(TADAHistory.total_amount).filter(
            TADAHistory.verification_status == 'Verified',
            TADAHistory.sd_branch_code == branch_code,
        ).all()
    )
    verified_count = db.query(func.count(TADAHistory.id)).filter(
        TADAHistory.verification_status == 'Verified',
        TADAHistory.sd_branch_code == branch_code,
    ).scalar() or 0

    # Unverified totals (from imports). Amount calculated dynamically when null.
    km_rates = _get_branch_km_rates(db)
    rate = km_rates.get(branch_code) or km_rates.get('HO')

    unverified_rows = db.query(
        TADAImport.total_amount,
        TADAImport.ho_corrected_km,
        TADAImport.branch_verified_km,
        TADAImport.two_way_km,
    ).filter(
        (TADAImport.verification_status != 'Verified') |
        (TADAImport.verification_status.is_(None)),
        TADAImport.sd_branch_code == branch_code,
    ).all()

    unverified_count = len(unverified_rows)
    unverified_total = 0.0
    for r in unverified_rows:
        amt = _safe_float(r.total_amount)
        if amt <= 0:
            km = _effective_km(r)
            amt = _calc_total(km, rate)
        unverified_total += amt

    base.update({
        'total_verified_amount': round(verified_total, 2),
        'total_verified_count': verified_count,
        'total_unverified_amount': round(unverified_total, 2),
        'total_unverified_count': unverified_count,
    })
    return base


# ──────────────────────────────────────────────────────────────────
# 2) Monthly verified trend (LINE) — grouped by moved_at
# ──────────────────────────────────────────────────────────────────
def get_branch_monthly(db: Session, branch_code: str, year: int) -> List[Dict[str, Any]]:
    if not _ok(branch_code):
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
# 3) Engineer-wise VERIFIED for this branch (with optional date range)
# ──────────────────────────────────────────────────────────────────
def get_engineers_verified(
    db: Session,
    branch_code: str,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
) -> List[Dict[str, Any]]:
    if not _ok(branch_code):
        return []

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

    records = db.query(TADAHistory).filter(
        TADAHistory.verification_status == 'Verified',
        TADAHistory.sd_branch_code == branch_code,
    ).all()

    eng_data = defaultdict(lambda: {
        'engineer_name': '',
        'engineer_uid': '',
        'total_amount': 0.0,
        'record_count': 0,
    })

    for r in records:
        # Date filter on sr_reach_at_site_datetime (same as HO Box 1)
        if df or dt:
            rec_date = _parse_date_safe(r.sr_reach_at_site_datetime)
            if not rec_date:
                continue
            if df and rec_date < df:
                continue
            if dt and rec_date >= dt:
                continue

        eng_name = (r.service_engineer_name or 'Unknown').strip() or 'Unknown'
        eng_uid = (r.service_engineer_uid or '').strip()
        key = eng_uid if eng_uid else eng_name

        eng_data[key]['engineer_name'] = eng_name
        eng_data[key]['engineer_uid'] = eng_uid
        eng_data[key]['total_amount'] += _safe_float(r.total_amount)
        eng_data[key]['record_count'] += 1

    result = [
        {
            'engineer_name': v['engineer_name'],
            'engineer_uid': v['engineer_uid'],
            'total_amount': round(v['total_amount'], 2),
            'record_count': v['record_count'],
        }
        for v in eng_data.values()
    ]
    result.sort(key=lambda x: x['total_amount'], reverse=True)
    return result


# ──────────────────────────────────────────────────────────────────
# 4) Engineer-wise UNVERIFIED for this branch
# ──────────────────────────────────────────────────────────────────
def get_engineers_unverified(db: Session, branch_code: str) -> List[Dict[str, Any]]:
    if not _ok(branch_code):
        return []

    km_rates = _get_branch_km_rates(db)
    rate = km_rates.get(branch_code) or km_rates.get('HO')

    rows = db.query(TADAImport).filter(
        (TADAImport.verification_status != 'Verified') |
        (TADAImport.verification_status.is_(None)),
        TADAImport.sd_branch_code == branch_code,
    ).all()

    eng_data = defaultdict(lambda: {
        'engineer_name': '',
        'engineer_uid': '',
        'unverified_count': 0,
        'total_amount': 0.0,
    })

    for r in rows:
        eng_name = (r.service_engineer_name or 'Unknown').strip() or 'Unknown'
        eng_uid = (r.service_engineer_uid or '').strip()
        key = eng_uid if eng_uid else eng_name

        eng_data[key]['engineer_name'] = eng_name
        eng_data[key]['engineer_uid'] = eng_uid
        eng_data[key]['unverified_count'] += 1

        amt = _safe_float(r.total_amount)
        if amt <= 0:
            km = _effective_km(r)
            amt = _calc_total(km, rate)
        eng_data[key]['total_amount'] += amt

    result = [
        {
            'engineer_name': v['engineer_name'],
            'engineer_uid': v['engineer_uid'],
            'unverified_count': v['unverified_count'],
            'total_amount': round(v['total_amount'], 2),
        }
        for v in eng_data.values()
    ]
    result.sort(key=lambda x: x['unverified_count'], reverse=True)
    return result


# ──────────────────────────────────────────────────────────────────
# 5) Available years for the line-chart year dropdown
# ──────────────────────────────────────────────────────────────────
def get_branch_available_years(db: Session, branch_code: str) -> List[int]:
    if not _ok(branch_code):
        return [datetime.now().year]

    rows = db.query(TADAHistory.moved_at).filter(
        TADAHistory.verification_status == 'Verified',
        TADAHistory.sd_branch_code == branch_code,
    ).all()

    years = {m.year for (m,) in rows if m}
    if not years:
        years.add(datetime.now().year)
    return sorted(years, reverse=True)

def get_branch_office_kpis(db: Session, branch_code: str) -> Dict[str, Any]:
    base = {
        'branch_code': branch_code,
        'branch_name': BRANCH_MAP.get(branch_code, branch_code),
        'total_verified_amount': 0,
        'total_verified_count': 0,
        'total_unverified_amount': 0,
        'total_unverified_count': 0,
    }
    if not _ok(branch_code):
        return base

    verified_total = db.query(func.coalesce(func.sum(OfficeExpenseHistory.amount), 0.0)).filter(
        OfficeExpenseHistory.branch_code == branch_code,
    ).scalar() or 0.0
    verified_count = db.query(func.count(OfficeExpenseHistory.id)).filter(
        OfficeExpenseHistory.branch_code == branch_code,
    ).scalar() or 0

    unverified_total = db.query(func.coalesce(func.sum(OfficeExpense.amount), 0.0)).filter(
        OfficeExpense.is_deleted == False,           # noqa: E712
        OfficeExpense.branch_code == branch_code,
    ).scalar() or 0.0
    unverified_count = db.query(func.count(OfficeExpense.id)).filter(
        OfficeExpense.is_deleted == False,           # noqa: E712
        OfficeExpense.branch_code == branch_code,
    ).scalar() or 0

    base.update({
        'total_verified_amount': round(float(verified_total), 2),
        'total_verified_count': verified_count,
        'total_unverified_amount': round(float(unverified_total), 2),
        'total_unverified_count': unverified_count,
    })
    return base


def get_branch_office_monthly(db: Session, branch_code: str, year: int) -> List[Dict[str, Any]]:
    if not _ok(branch_code):
        return []

    months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
    monthly = {
        i: {'month': months[i-1], 'month_num': i, 'total_amount': 0.0, 'record_count': 0}
        for i in range(1, 13)
    }

    start = datetime(year, 1, 1)
    end   = datetime(year + 1, 1, 1)

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


def get_branch_office_by_category(
    db: Session,
    branch_code: str,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """Verified office expense grouped by expenses_head (category)."""
    if not _ok(branch_code):
        return []

    df, dt = None, None
    if date_from:
        try: df = datetime.strptime(date_from, '%Y-%m-%d')
        except Exception: df = None
    if date_to:
        try: dt = datetime.strptime(date_to, '%Y-%m-%d') + timedelta(days=1)
        except Exception: dt = None

    q = db.query(OfficeExpenseHistory).filter(
        OfficeExpenseHistory.branch_code == branch_code,
    )
    if df: q = q.filter(OfficeExpenseHistory.paid_date >= df)
    if dt: q = q.filter(OfficeExpenseHistory.paid_date < dt)

    cats = defaultdict(lambda: {'total_amount': 0.0, 'record_count': 0})
    for r in q.all():
        head = (r.expenses_head or 'Uncategorized').strip() or 'Uncategorized'
        cats[head]['total_amount'] += _safe_float(r.amount)
        cats[head]['record_count'] += 1

    result = [
        {
            'category': k,
            'total_amount': round(v['total_amount'], 2),
            'record_count': v['record_count'],
        }
        for k, v in cats.items()
    ]
    result.sort(key=lambda x: x['total_amount'], reverse=True)
    return result


def get_branch_office_available_years(db: Session, branch_code: str) -> List[int]:
    if not _ok(branch_code):
        return [datetime.now().year]
    rows = db.query(OfficeExpenseHistory.moved_at).filter(
        OfficeExpenseHistory.branch_code == branch_code,
    ).all()
    years = {m.year for (m,) in rows if m}
    if not years:
        years.add(datetime.now().year)
    return sorted(years, reverse=True)


# ══════════════════════════════════════════════════════════════════
# LOCAL VENDOR BILLS — Branch Admin
# Verified  → LocalVendorBillHistory  (only this branch)
# Unverified → LocalVendorBill        (only this branch, not deleted)
# ══════════════════════════════════════════════════════════════════
def get_branch_vendor_kpis(db: Session, branch_code: str) -> Dict[str, Any]:
    base = {
        'branch_code': branch_code,
        'branch_name': BRANCH_MAP.get(branch_code, branch_code),
        'total_verified_amount': 0,
        'total_verified_count': 0,
        'total_unverified_amount': 0,
        'total_unverified_count': 0,
    }
    if not _ok(branch_code):
        return base

    verified_total = db.query(func.coalesce(func.sum(LocalVendorBillHistory.payment_amount), 0.0)).filter(
        LocalVendorBillHistory.branch_code == branch_code,
    ).scalar() or 0.0
    verified_count = db.query(func.count(LocalVendorBillHistory.id)).filter(
        LocalVendorBillHistory.branch_code == branch_code,
    ).scalar() or 0

    unverified_total = db.query(func.coalesce(func.sum(LocalVendorBill.payment_amount), 0.0)).filter(
        LocalVendorBill.is_deleted == False,           # noqa: E712
        LocalVendorBill.branch_code == branch_code,
    ).scalar() or 0.0
    unverified_count = db.query(func.count(LocalVendorBill.id)).filter(
        LocalVendorBill.is_deleted == False,           # noqa: E712
        LocalVendorBill.branch_code == branch_code,
    ).scalar() or 0

    base.update({
        'total_verified_amount': round(float(verified_total), 2),
        'total_verified_count': verified_count,
        'total_unverified_amount': round(float(unverified_total), 2),
        'total_unverified_count': unverified_count,
    })
    return base


def get_branch_vendor_monthly(db: Session, branch_code: str, year: int) -> List[Dict[str, Any]]:
    if not _ok(branch_code):
        return []

    months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
    monthly = {
        i: {'month': months[i-1], 'month_num': i, 'total_amount': 0.0, 'record_count': 0}
        for i in range(1, 13)
    }

    start = datetime(year, 1, 1)
    end   = datetime(year + 1, 1, 1)

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


def get_branch_vendor_by_vendor(
    db: Session,
    branch_code: str,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """Verified vendor bills grouped by vendor_name."""
    if not _ok(branch_code):
        return []

    df, dt = None, None
    if date_from:
        try: df = datetime.strptime(date_from, '%Y-%m-%d')
        except Exception: df = None
    if date_to:
        try: dt = datetime.strptime(date_to, '%Y-%m-%d') + timedelta(days=1)
        except Exception: dt = None

    q = db.query(LocalVendorBillHistory).filter(
        LocalVendorBillHistory.branch_code == branch_code,
    )
    if df: q = q.filter(LocalVendorBillHistory.invoice_date >= df)
    if dt: q = q.filter(LocalVendorBillHistory.invoice_date < dt)

    vendors = defaultdict(lambda: {'total_amount': 0.0, 'record_count': 0})
    for r in q.all():
        v = (r.vendor_name or 'Unknown Vendor').strip() or 'Unknown Vendor'
        vendors[v]['total_amount'] += _safe_float(r.payment_amount)
        vendors[v]['record_count'] += 1

    result = [
        {
            'vendor_name': k,
            'total_amount': round(v['total_amount'], 2),
            'record_count': v['record_count'],
        }
        for k, v in vendors.items()
    ]
    result.sort(key=lambda x: x['total_amount'], reverse=True)
    return result


def get_branch_vendor_available_years(db: Session, branch_code: str) -> List[int]:
    if not _ok(branch_code):
        return [datetime.now().year]
    rows = db.query(LocalVendorBillHistory.moved_at).filter(
        LocalVendorBillHistory.branch_code == branch_code,
    ).all()
    years = {m.year for (m,) in rows if m}
    if not years:
        years.add(datetime.now().year)
    return sorted(years, reverse=True)