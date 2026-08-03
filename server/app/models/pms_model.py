from sqlalchemy import (
    Column, Integer, String, Float, Date, DateTime, Text, ForeignKey,
    UniqueConstraint, Index,
)
from app.database import Base
from app.time_utils import now_ist


class PmsBranchTarget(Base):
    """AOP Master — branch-wise monthly targets (Spare + Labour).

    One row per (target_month, branch_id). The responsible person is the
    branch manager shown on the generated report. Region is MH / KA and
    drives the region filter + regional summary of the report.
    """
    __tablename__ = "pms_branch_targets"

    id = Column(Integer, primary_key=True, index=True)
    target_month = Column(String(7), nullable=False, index=True)   # 'YYYY-MM'
    region = Column(String(10), nullable=True)                     # MH / KA
    branch_id = Column(String(60), nullable=False)
    branch_name = Column(String(120), nullable=True)
    responsible_person = Column(String(120), nullable=True)
    spare_target = Column(Float, nullable=False, default=0)
    labour_target = Column(Float, nullable=False, default=0)
    created_by = Column(String(50), nullable=True)
    updated_by = Column(String(50), nullable=True)
    created_at = Column(DateTime(timezone=True), default=now_ist)
    updated_at = Column(DateTime(timezone=True), onupdate=now_ist)

    __table_args__ = (
        UniqueConstraint("target_month", "branch_id", name="uq_pms_target_month_branch"),
    )


class PmsMonthSettings(Base):
    """Per-month settings for the AOP Master — currently the number of
    working days (defaults to all days except Sundays; editable)."""
    __tablename__ = "pms_month_settings"

    id = Column(Integer, primary_key=True, index=True)
    target_month = Column(String(7), nullable=False, unique=True, index=True)  # 'YYYY-MM'
    working_days = Column(Integer, nullable=True)
    updated_by = Column(String(50), nullable=True)
    created_at = Column(DateTime(timezone=True), default=now_ist)
    updated_at = Column(DateTime(timezone=True), onupdate=now_ist)


class PmsHead(Base):
    """Head master — the reporting buckets SR Types map to (Warranty,
    Post Warranty, AMC, KOEL AMC, OTC Order + any added later). Managed from
    the SR Type Master tab; feeds its Head dropdown."""
    __tablename__ = "pms_heads"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(60), nullable=False, unique=True)
    created_by = Column(String(50), nullable=True)
    created_at = Column(DateTime(timezone=True), default=now_ist)


class PmsSrTypeMapping(Base):
    """SR Type → Head mapping (e.g. 'Bandhan Premium' → 'AMC').

    Heads group the raw Service Report Types from the uploaded files into the
    five reporting buckets: Warranty, Post Warranty, AMC, KOEL AMC, OTC Order.
    """
    __tablename__ = "pms_sr_type_map"

    id = Column(Integer, primary_key=True, index=True)
    sr_type = Column(String(120), nullable=False, unique=True, index=True)
    head = Column(String(60), nullable=True)
    created_by = Column(String(50), nullable=True)
    updated_by = Column(String(50), nullable=True)
    created_at = Column(DateTime(timezone=True), default=now_ist)
    updated_at = Column(DateTime(timezone=True), onupdate=now_ist)


class PmsUploadBatch(Base):
    """One Excel upload (Part Sale or Labour Revenue file) — audit trail of
    what was uploaded, when, and how many rows were new vs duplicates."""
    __tablename__ = "pms_upload_batches"

    id = Column(Integer, primary_key=True, index=True)
    record_type = Column(String(10), nullable=False)      # 'part' | 'labour'
    file_name = Column(String(255), nullable=True)
    total_rows = Column(Integer, nullable=False, default=0)
    inserted_rows = Column(Integer, nullable=False, default=0)
    updated_rows = Column(Integer, nullable=False, default=0)   # same invoice, new values
    duplicate_rows = Column(Integer, nullable=False, default=0)
    skipped_rows = Column(Integer, nullable=False, default=0)   # unparseable rows
    uploaded_by = Column(String(50), nullable=True)
    uploaded_at = Column(DateTime(timezone=True), default=now_ist)


class PmsSalesRecord(Base):
    """One invoice line accumulated from the uploaded files.

    Data keeps accumulating across daily/weekly/monthly uploads; the
    dedupe_key (hash of the identifying fields) guarantees a row uploaded
    twice is stored only once. Canonical columns are mapped flexibly from the
    file headers; anything unrecognised is preserved in extra_data JSON.
    """
    __tablename__ = "pms_sales_records"

    id = Column(Integer, primary_key=True, index=True)
    record_type = Column(String(10), nullable=False, index=True)  # 'part' | 'labour'
    zone_name = Column(String(80), nullable=True)
    soid = Column(String(80), nullable=True)
    sd_name = Column(String(150), nullable=True)
    branch_id = Column(String(60), nullable=True, index=True)
    branch_name = Column(String(150), nullable=True)
    claim_invoice_no = Column(String(100), nullable=True, index=True)
    claim_invoice_date = Column(Date, nullable=True, index=True)
    product_segment = Column(String(100), nullable=True)
    segment = Column(String(100), nullable=True)
    sr_type = Column(String(120), nullable=True)
    net_taxable_amount = Column(Float, nullable=False, default=0)
    extra_data = Column(Text, nullable=True)              # JSON of unmapped columns
    dedupe_key = Column(String(64), nullable=False, unique=True, index=True)
    batch_id = Column(Integer, ForeignKey("pms_upload_batches.id"), nullable=True)
    created_at = Column(DateTime(timezone=True), default=now_ist)

    __table_args__ = (
        Index("ix_pms_records_type_date", "record_type", "claim_invoice_date"),
        # Preview pagination: filter by record_type, newest-first by id.
        Index("ix_pms_records_type_id", "record_type", "id"),
    )


class PmsReportHistory(Base):
    """A generated report saved to history — the full computed payload is
    frozen as JSON so the report can be re-opened later exactly as it was."""
    __tablename__ = "pms_report_history"

    id = Column(Integer, primary_key=True, index=True)
    as_on_date = Column(Date, nullable=False, index=True)
    title = Column(String(200), nullable=True)
    payload = Column(Text, nullable=False)                # JSON report snapshot
    created_by = Column(String(50), nullable=True)
    created_at = Column(DateTime(timezone=True), default=now_ist)
