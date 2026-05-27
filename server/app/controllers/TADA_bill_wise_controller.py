from sqlalchemy.orm import Session
from sqlalchemy import desc
from fastapi import HTTPException
from typing import Optional, List
from datetime import datetime, timedelta
import logging

from app.models.TADA_bill_wise_model import TADABillWise
from app.models.TADA_bill_wise_history_model import TADABillWiseHistory
from app.models.branch_submit_limit_model import BranchSubmitLimit
from app.models.TADA_bill_wise_temp_model import TADABillWiseTemp
from app.controllers.voucher_controller import generate_voucher_no

logger = logging.getLogger(__name__)


# ════════════════════════════════════════════════════════════════════════════
# DATE + PERIOD HELPERS
# ════════════════════════════════════════════════════════════════════════════

def _parse_date(date_str):
    if not date_str:
        return None
    s = str(date_str).strip()[:10]
    for fmt in ("%Y-%m-%d", "%d-%m-%Y", "%d/%m/%Y", "%Y/%m/%d", "%d-%b-%Y"):
        try:
            return datetime.strptime(s, fmt).date()
        except (ValueError, AttributeError):
            continue
    try:
        return datetime.fromisoformat(s).date()
    except Exception:
        return None


def _get_branch_period_rule(db: Session, branch_code: str) -> dict:
    rule = db.query(BranchSubmitLimit).filter(
        BranchSubmitLimit.branch_code == branch_code
    ).first()
    if rule:
        return {
            "rule_type": rule.rule_type,
            "allowed_values": list(rule.allowed_values or []),
        }
    return {"rule_type": "month_dates", "allowed_values": [1, 16]}


def _compute_period_bounds(d, rule: dict):
    """
    weekdays:  7-day buckets (frontend: 1=Mon..6=Sat, 0=Sun  →  python: 0=Mon..6=Sun)
    month_dates: 15-day halves (1–15, 16–end)
    """
    if not d:
        return None, None

    if rule["rule_type"] == "weekdays":
        def fe_to_py(v):
            return 6 if v == 0 else (v - 1)
        allowed = sorted(set(fe_to_py(v) for v in rule["allowed_values"])) or [0]
        py_wd = d.weekday()
        start_wd = next((wd for wd in reversed(allowed) if wd <= py_wd), None)
        if start_wd is None:
            start_wd = allowed[-1]
            diff = py_wd + (7 - start_wd)
        else:
            diff = py_wd - start_wd
        start = d - timedelta(days=diff)
        return start, start + timedelta(days=6)

    if d.day <= 15:
        return d.replace(day=1), d.replace(day=15)
    start = d.replace(day=16)
    if d.month == 12:
        next_month = d.replace(year=d.year + 1, month=1, day=1)
    else:
        next_month = d.replace(month=d.month + 1, day=1)
    return start, next_month - timedelta(days=1)


# ════════════════════════════════════════════════════════════════════════════
# CREATE (BULK / LOOP) / READ / DELETE
# ════════════════════════════════════════════════════════════════════════════

def create_bill_wise_entries(db: Session, header: dict, bills: List[dict],
                             entry_type: str, branch_code: str, created_by: str):
    """
    Create MULTIPLE Bill Wise DRAFT rows (TADABillWiseTemp) in a loop.
    One row per bill, all sharing the same header fields.
    """
    try:
        if not bills:
            raise HTTPException(status_code=400, detail="No bill line items provided")

        et = "BM" if str(entry_type).upper() == "BM" else "SE"
        created = []

        for bill in bills:
            record = TADABillWiseTemp(
                entry_type=et,
                date=bill.get("date"),
                expenses_head=bill.get("expenses_head"),
                amount=str(bill.get("amount") or ""),
                bill_submitted=bill.get("bill_submitted") if et == "SE" else None,
                # SE header
                engineer_name=header.get("engineer_name"),
                employee_id=header.get("employee_id"),
                service_engineer_uid=header.get("service_engineer_uid"),
                work_description=header.get("work_description"),
                service_request_no=header.get("service_request_no"),
                appointment_number=header.get("appointment_number"),
                account=header.get("account"),
                installation_site_address=header.get("installation_site_address"),
                sr_type=header.get("sr_type"),
                task_status=header.get("task_status"),
                kms_travelled=header.get("kms_travelled"),
                task_start_date=header.get("task_start_date"),
                task_end_date=header.get("task_end_date"),
                # BM header
                customer_name=header.get("customer_name"),
                sr_invoice_engine_no=header.get("sr_invoice_engine_no"),
                work_status=header.get("work_status"),
                remark=header.get("remark"),
                # meta
                branch_code=branch_code,
                created_by=created_by,
            )
            db.add(record)
            created.append(record)

        db.commit()
        for r in created:
            db.refresh(r)
        return created
    except HTTPException:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"create_bill_wise_entries error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


def get_bill_wise_records(db: Session, branch_code: Optional[str] = None,
                          skip: int = 0, limit: int = 100):
    try:
        q = db.query(TADABillWise)
        if branch_code:
            q = q.filter(TADABillWise.branch_code == branch_code)
        return q.order_by(desc(TADABillWise.created_at)).offset(skip).limit(limit).all()
    except Exception as e:
        logger.error(f"get_bill_wise_records error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

def get_bill_wise_temp_records(db: Session, branch_code: Optional[str] = None,
                               skip: int = 0, limit: int = 1000):
    """Drafts (TADABillWiseTemp) — shown on the Verify tab."""
    try:
        q = db.query(TADABillWiseTemp)
        if branch_code:
            q = q.filter(TADABillWiseTemp.branch_code == branch_code)
        return q.order_by(desc(TADABillWiseTemp.created_at)).offset(skip).limit(limit).all()
    except Exception as e:
        logger.error(f"get_bill_wise_temp_records error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


def delete_bill_wise_temp(db: Session, record_id: int) -> bool:
    try:
        rec = db.query(TADABillWiseTemp).filter(TADABillWiseTemp.id == record_id).first()
        if not rec:
            return False
        db.delete(rec)
        db.commit()
        return True
    except Exception as e:
        db.rollback()
        logger.error(f"delete_bill_wise_temp error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


def submit_bill_wise_temp_to_main(db, temp_ids, branch_code):
    try:
        rows = db.query(TADABillWiseTemp).filter(TADABillWiseTemp.id.in_(temp_ids)).all()
        voucher_no = generate_voucher_no(db, "TADA", branch_code) if rows else None
        moved = 0
        for r in rows:
            main = TADABillWise(
                entry_type=r.entry_type, date=r.date, expenses_head=r.expenses_head,
                amount=r.amount, bill_submitted=r.bill_submitted,
                engineer_name=r.engineer_name, employee_id=r.employee_id,
                service_engineer_uid=r.service_engineer_uid,
                work_description=r.work_description, service_request_no=r.service_request_no,
                appointment_number=r.appointment_number, account=r.account,
                installation_site_address=r.installation_site_address, sr_type=r.sr_type,
                task_status=r.task_status, kms_travelled=r.kms_travelled,
                task_start_date=r.task_start_date, task_end_date=r.task_end_date,
                customer_name=r.customer_name, sr_invoice_engine_no=r.sr_invoice_engine_no,
                work_status=r.work_status, remark=r.remark, verification_status="Pending",
                voucher_no=voucher_no,                  # <-- only added field
                branch_code=r.branch_code, created_by=r.created_by, created_at=r.created_at,
            )
            db.add(main); db.delete(r); moved += 1
        db.commit()
        return {"status": "success", "moved_count": moved, "voucher_no": voucher_no,
                "message": f"{moved} record(s) submitted — Voucher {voucher_no}"}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))
        
def delete_bill_wise_record(db: Session, record_id: int) -> bool:
    try:
        rec = db.query(TADABillWise).filter(TADABillWise.id == record_id).first()
        if not rec:
            return False
        db.delete(rec)
        db.commit()
        return True
    except Exception as e:
        db.rollback()
        logger.error(f"delete_bill_wise_record error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


# ════════════════════════════════════════════════════════════════════════════
# BRANCH SUMMARY — grouped by submit-period
# ════════════════════════════════════════════════════════════════════════════

def get_branch_bill_wise_summary(db: Session, branch_code: str) -> dict:
    """Bill Wise records grouped by (engineer/customer name + submission period)."""
    records = db.query(TADABillWise).filter(TADABillWise.branch_code == branch_code).all()
    rule = _get_branch_period_rule(db, branch_code)
    period_days = 7 if rule["rule_type"] == "weekdays" else 15

    if not records:
        return {"rule_type": rule["rule_type"], "period_days": period_days, "groups": []}

    groups_map = {}
    for r in records:
        d = _parse_date(r.date)
        if not d:
            continue
        start, end = _compute_period_bounds(d, rule)
        if not start or not end:
            continue

        # SE rows group by engineer; BM rows group by customer
        label = (r.engineer_name if r.entry_type == "SE" else r.customer_name) or "Unknown"
        label = label.strip()
        key = (label, start, end)

        if key not in groups_map:
            groups_map[key] = {
                "engineer_name": label,
                "period_start": start.isoformat(),
                "period_end": end.isoformat(),
                "period_start_display": start.strftime("%d %b %Y"),
                "period_end_display": end.strftime("%d %b %Y"),
                "record_count": 0,
                "total_amount": 0.0,
                "verified_amount": 0.0,
                "verified_count": 0,
                "record_ids": [],
            }
        g = groups_map[key]
        g["record_count"] += 1
        g["record_ids"].append(r.id)
        try:
            amt = float(r.amount or 0)
        except (ValueError, TypeError):
            amt = 0.0
        g["total_amount"] += amt
        if r.verification_status == "Verified":
            g["verified_amount"] += amt
            g["verified_count"] += 1

    groups = sorted(
        groups_map.values(),
        key=lambda g: (g["period_start"], g["engineer_name"]),
        reverse=True,
    )
    for g in groups:
        g["total_amount"] = round(g["total_amount"], 2)
        g["verified_amount"] = round(g["verified_amount"], 2)

    return {
        "rule_type": rule["rule_type"],
        "period_days": period_days,
        "groups": groups,
    }


# ════════════════════════════════════════════════════════════════════════════
# PERIOD-FILTERED RECORDS
# ════════════════════════════════════════════════════════════════════════════

def get_branch_bill_wise_records(db: Session, branch_code: str,
                                  period_start: Optional[str] = None,
                                  period_end: Optional[str] = None,
                                  engineer_name: Optional[str] = None):
    try:
        q = db.query(TADABillWise).filter(TADABillWise.branch_code == branch_code)
        if engineer_name:
            q = q.filter(TADABillWise.engineer_name == engineer_name)
        records = q.order_by(desc(TADABillWise.created_at)).all()
        if period_start and period_end:
            try:
                ps = datetime.strptime(period_start, "%Y-%m-%d").date()
                pe = datetime.strptime(period_end, "%Y-%m-%d").date()
            except ValueError:
                raise HTTPException(status_code=400, detail="Invalid period date format")
            filtered = []
            for r in records:
                d = _parse_date(r.date)
                if d and ps <= d <= pe:
                    filtered.append(r)
            records = filtered
        return records
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"get_branch_bill_wise_records error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


# ════════════════════════════════════════════════════════════════════════════
# UPDATE — verification status only
# ════════════════════════════════════════════════════════════════════════════

def update_bill_wise_record(db: Session, record_id: int, update_data: dict):
    """Update verification_status only (no HO corrections in Bill Wise)."""
    try:
        rec = db.query(TADABillWise).filter(TADABillWise.id == record_id).first()
        if not rec:
            raise HTTPException(status_code=404, detail="Bill Wise record not found")

        if "verification_status" in update_data:
            status = update_data["verification_status"]
            if status not in ("Pending", "Verified"):
                raise HTTPException(status_code=400, detail="Invalid verification_status")
            rec.verification_status = status

        db.commit()
        db.refresh(rec)
        return rec
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"update_bill_wise_record error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


# ════════════════════════════════════════════════════════════════════════════
# SUBMIT TO HISTORY
# ════════════════════════════════════════════════════════════════════════════

def submit_bill_wise_to_history(db: Session, record_ids: List[int],
                                 submitted_by_name: str, submitted_by_uid: str) -> dict:
    try:
        if not record_ids:
            raise HTTPException(status_code=400, detail="No record_ids provided")

        moved = 0
        skipped = 0

        for rid in record_ids:
            rec = db.query(TADABillWise).filter(
                TADABillWise.id == rid,
                TADABillWise.verification_status == "Verified",
            ).first()
            if not rec:
                skipped += 1
                continue

            hist = TADABillWiseHistory(
                original_id=rec.id,
                entry_type=rec.entry_type,
                date=rec.date,
                expenses_head=rec.expenses_head,
                amount=rec.amount,
                bill_submitted=rec.bill_submitted,
                engineer_name=rec.engineer_name,
                employee_id=rec.employee_id,
                service_engineer_uid=rec.service_engineer_uid,
                work_description=rec.work_description,
                service_request_no=rec.service_request_no,
                appointment_number=rec.appointment_number,
                account=rec.account,
                installation_site_address=rec.installation_site_address,
                sr_type=rec.sr_type,
                task_status=rec.task_status,
                kms_travelled=rec.kms_travelled,
                task_start_date=rec.task_start_date,
                task_end_date=rec.task_end_date,
                customer_name=rec.customer_name,
                sr_invoice_engine_no=rec.sr_invoice_engine_no,
                work_status=rec.work_status,
                remark=rec.remark,
                verification_status=rec.verification_status,
                branch_code=rec.branch_code,
                created_by=rec.created_by,
                created_at=rec.created_at,
                submitted_by_name=submitted_by_name,
                submitted_by_uid=submitted_by_uid,
            )
            db.add(hist)
            db.delete(rec)
            moved += 1

        db.commit()
        return {"moved_count": moved, "skipped_count": skipped}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"submit_bill_wise_to_history error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


# ════════════════════════════════════════════════════════════════════════════
# HISTORY LIST + paid-date
# ════════════════════════════════════════════════════════════════════════════

def get_bill_wise_history(db: Session, branch_code: Optional[str] = None,
                          skip: int = 0, limit: int = 500):
    try:
        q = db.query(TADABillWiseHistory)
        if branch_code:
            q = q.filter(TADABillWiseHistory.branch_code == branch_code)
        return q.order_by(desc(TADABillWiseHistory.moved_at)).offset(skip).limit(limit).all()
    except Exception as e:
        logger.error(f"get_bill_wise_history error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


def update_history_paid_date(db: Session, record_id: int, paid_date):
    try:
        rec = db.query(TADABillWiseHistory).filter(TADABillWiseHistory.id == record_id).first()
        if not rec:
            raise HTTPException(status_code=404, detail="History record not found")
        rec.paid_date = paid_date
        db.commit()
        db.refresh(rec)
        return rec
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"update_history_paid_date error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


def get_bill_wise_history_grouped(db: Session, branch_code: str) -> dict:
    """Group Bill Wise history records by submission period."""
    records = (
        db.query(TADABillWiseHistory)
        .filter(TADABillWiseHistory.branch_code == branch_code)
        .order_by(desc(TADABillWiseHistory.moved_at))
        .all()
    )
    rule = _get_branch_period_rule(db, branch_code)
    period_days = 7 if rule["rule_type"] == "weekdays" else 15

    if not records:
        return {"rule_type": rule["rule_type"], "period_days": period_days, "groups": []}

    groups_map = {}
    for r in records:
        d = _parse_date(r.date)

        uploader = r.submitted_by_name or "Unknown"
        label = (r.engineer_name if r.entry_type == "SE" else r.customer_name) or "Unknown"
        label = label.strip()
        # Group by name + submitter only (no period rule); track min/max date.
        key = (r.entry_type or "SE", label, uploader)

        if key not in groups_map:
            groups_map[key] = {
                "engineer_name": label,
                "uploaded_by": uploader,
                "_min_date": None,
                "_max_date": None,
                "record_count": 0,
                "total_amount": 0.0,
                "record_ids": [],
                "_paid_dates": set(),
                "paid_count": 0,
                "_created_by_names": set(),
            }

        g = groups_map[key]
        if d:
            if g["_min_date"] is None or d < g["_min_date"]:
                g["_min_date"] = d
            if g["_max_date"] is None or d > g["_max_date"]:
                g["_max_date"] = d
        g["record_count"] += 1
        g["record_ids"].append(r.id)
        if r.created_by:
            g["_created_by_names"].add(str(r.created_by).strip())
        try:
            g["total_amount"] += float(r.amount or 0)
        except (ValueError, TypeError):
            pass
        if r.paid_date:
            g["paid_count"] += 1
            g["_paid_dates"].add(str(r.paid_date))

    groups = []
    for g in groups_map.values():
        start = g.pop("_min_date")
        end = g.pop("_max_date")
        g["period_start"] = start.isoformat() if start else ""
        g["period_end"] = end.isoformat() if end else ""
        g["period_start_display"] = start.strftime("%d %b %Y") if start else "-"
        g["period_end_display"] = end.strftime("%d %b %Y") if end else "-"
        paid_dates = g.pop("_paid_dates")
        if len(paid_dates) == 1 and g["paid_count"] == g["record_count"]:
            g["paid_date"] = paid_dates.pop()
        else:
            g["paid_date"] = None
        created_names = sorted(g.pop("_created_by_names"))
        g["created_by_names"] = ", ".join(created_names) if created_names else ""
        g["total_amount"] = round(g["total_amount"], 2)
        groups.append(g)

    groups.sort(key=lambda x: (x["engineer_name"] or ""))
    return {"rule_type": rule["rule_type"], "period_days": period_days, "groups": groups}


def bulk_update_bill_wise_history_paid_date(db: Session, record_ids: List[int], paid_date) -> dict:
    """Apply a paid_date to many Bill Wise history rows at once."""
    if not record_ids:
        raise HTTPException(status_code=400, detail="No record_ids provided")
    updated = (
        db.query(TADABillWiseHistory)
        .filter(TADABillWiseHistory.id.in_(record_ids))
        .update({"paid_date": paid_date}, synchronize_session=False)
    )
    db.commit()
    return {"updated_count": updated}