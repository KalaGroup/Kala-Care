from sqlalchemy.orm import Session
from datetime import date
from app.models.voucher_counter_model import VoucherCounter


class LVBVoucherController:
    """
    Per-branch, per-FY HO-submission voucher for Local Vendor Bills.
    Format: 26-27/LVB_<branchSeq>/01  (sequence zero-padded, resets each FY).
    """
    MODULE = "LVB"

    @staticmethod
    def _fy_label(d: date) -> str:
        start, end = (d.year, d.year + 1) if d.month >= 4 else (d.year - 1, d.year)
        return f"{str(start)[-2:]}-{str(end)[-2:]}"

    @staticmethod
    def _branch_seq(branch_code: str) -> str:
        if not branch_code:
            return "0"
        return branch_code.split("_")[-1] if "_" in branch_code else branch_code

    @staticmethod
    def peek_next_voucher(db: Session, branch_code: str, ref_date: date) -> str:
        """Preview WITHOUT incrementing."""
        fy = LVBVoucherController._fy_label(ref_date)
        row = db.query(VoucherCounter).filter(
            VoucherCounter.financial_year == fy,
            VoucherCounter.module == LVBVoucherController.MODULE,
            VoucherCounter.branch_code == branch_code,
        ).first()
        nxt = (row.last_sequence if row else 0) + 1
        return f"{fy}/{LVBVoucherController.MODULE}_{LVBVoucherController._branch_seq(branch_code)}/{str(nxt).zfill(2)}"

    @staticmethod
    def generate_voucher(db: Session, branch_code: str, ref_date: date) -> str:
        """Reserve and return one voucher code. Caller commits."""
        fy = LVBVoucherController._fy_label(ref_date)
        row = db.query(VoucherCounter).filter(
            VoucherCounter.financial_year == fy,
            VoucherCounter.module == LVBVoucherController.MODULE,
            VoucherCounter.branch_code == branch_code,
        ).with_for_update().first()

        if not row:
            row = VoucherCounter(
                financial_year=fy,
                module=LVBVoucherController.MODULE,
                branch_code=branch_code,
                last_sequence=0,
            )
            db.add(row)
            db.flush()

        row.last_sequence += 1
        db.flush()
        return f"{fy}/{LVBVoucherController.MODULE}_{LVBVoucherController._branch_seq(branch_code)}/{str(row.last_sequence).zfill(2)}"