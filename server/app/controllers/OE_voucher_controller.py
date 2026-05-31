from sqlalchemy.orm import Session
from datetime import date
from app.models.voucher_counter_model import VoucherCounter


class OEVoucherController:
    """
    Per-branch, per-FY HO-submission voucher for Office Expense.
    Format: 26-27/OE_<branchSeq>/01  (sequence zero-padded, resets each FY).
    """
    MODULE = "OE"

    @staticmethod
    def _fy_label(d: date) -> str:
        # Apr–Mar Indian FY. 2026-05 -> '26-27', 2026-02 -> '25-26'
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
        fy = OEVoucherController._fy_label(ref_date)
        row = db.query(VoucherCounter).filter(
            VoucherCounter.financial_year == fy,
            VoucherCounter.module == OEVoucherController.MODULE,
            VoucherCounter.branch_code == branch_code,
        ).first()
        nxt = (row.last_sequence if row else 0) + 1
        return f"{fy}/{OEVoucherController.MODULE}_{OEVoucherController._branch_seq(branch_code)}/{str(nxt).zfill(2)}"

    @staticmethod
    def generate_voucher(db: Session, branch_code: str, ref_date: date) -> str:
        """Reserve and return one voucher code. Caller commits."""
        fy = OEVoucherController._fy_label(ref_date)
        row = db.query(VoucherCounter).filter(
            VoucherCounter.financial_year == fy,
            VoucherCounter.module == OEVoucherController.MODULE,
            VoucherCounter.branch_code == branch_code,
        ).with_for_update().first()

        if not row:
            row = VoucherCounter(
                financial_year=fy,
                module=OEVoucherController.MODULE,
                branch_code=branch_code,
                last_sequence=0,
            )
            db.add(row)
            db.flush()

        row.last_sequence += 1
        db.flush()
        return f"{fy}/{OEVoucherController.MODULE}_{OEVoucherController._branch_seq(branch_code)}/{str(row.last_sequence).zfill(2)}"