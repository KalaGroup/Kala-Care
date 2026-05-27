from sqlalchemy.orm import Session
from datetime import datetime
from app.models.voucher_counter_model import VoucherCounter


def get_financial_year(d: datetime = None) -> str:
    d = d or datetime.now()
    start, end = (d.year, d.year + 1) if d.month >= 4 else (d.year - 1, d.year)
    return f"{str(start)[-2:]}-{str(end)[-2:]}"


def branch_suffix(branch_code: str) -> str:
    if not branch_code:
        return "NA"
    return branch_code.split("_")[-1] if "_" in branch_code else branch_code


def generate_voucher_no(db: Session, module: str, branch_code: str) -> str:
    """Format: {FY}/{MODULE}_{branchSuffix}/{seq:02d}  e.g. 26-27/TADA_1/01"""
    fy = get_financial_year()
    counter = (
        db.query(VoucherCounter)
        .filter(
            VoucherCounter.financial_year == fy,
            VoucherCounter.module == module,
            VoucherCounter.branch_code == branch_code,
        )
        .with_for_update()
        .first()
    )
    if not counter:
        counter = VoucherCounter(financial_year=fy, module=module,
                                 branch_code=branch_code, last_sequence=0)
        db.add(counter)
        db.flush()
    counter.last_sequence += 1
    return f"{fy}/{module}_{branch_suffix(branch_code)}/{counter.last_sequence:02d}"