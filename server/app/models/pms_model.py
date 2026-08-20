from sqlalchemy import (
    Boolean, Column, Integer, String, Float, Date, DateTime, Text, ForeignKey,
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


class PmsCdiTarget(Base):
    """AOP Master → CDI Target tab — the AOP column of the Customer Delight
    Index report (Annual Reports).

    ONE percentage per financial year and row of that report. The report has
    three kinds of row and each can carry its own target, so the key is a
    (scope, scope_key) pair rather than a branch id:

        scope 'branch'   scope_key = branch id ('420435_1')
        scope 'region'   scope_key = 'MH' | 'KA'   — the region total rows
        scope 'overall'  scope_key = 'ALL'         — the KCGL Overall row

    The sheet the business prints sets the target at region and overall level
    only; branch targets are optional and simply stay empty until someone fills
    them in. Nothing is derived from anything else — an unset row shows no AOP.
    """
    __tablename__ = "pms_cdi_targets"

    id = Column(Integer, primary_key=True, index=True)
    fy = Column(Integer, nullable=False, index=True)   # FY start year: 2026 = Apr 2026–Mar 2027
    scope = Column(String(10), nullable=False)         # 'branch' | 'region' | 'overall'
    scope_key = Column(String(60), nullable=False)     # branch id | 'MH'/'KA' | 'ALL'
    target_pct = Column(Float, nullable=False, default=0)
    created_by = Column(String(50), nullable=True)
    updated_by = Column(String(50), nullable=True)
    created_at = Column(DateTime(timezone=True), default=now_ist)
    updated_at = Column(DateTime(timezone=True), onupdate=now_ist)

    __table_args__ = (
        UniqueConstraint("fy", "scope", "scope_key", name="uq_pms_cdi_target_fy_scope"),
    )


class PmsHoliday(Base):
    """A non-working DATE in the AOP Master's working-days calendar.

    The month's working-day COUNT used to be typed in by hand, which could not
    say WHICH days were off — so a report for 01–17 Aug had to guess how much of
    the month had elapsed. Ticking the actual holidays here makes every
    part-period exact: working days of any range = days in it, minus Sundays,
    minus the dates ticked for that region.

    One row per (date, region): a day off in both regions is two rows, so MH and
    KA keep their own calendars."""
    __tablename__ = "pms_holidays"

    id = Column(Integer, primary_key=True, index=True)
    holiday_date = Column(Date, nullable=False, index=True)
    region = Column(String(10), nullable=False)           # 'MH' | 'KA'
    name = Column(String(120), nullable=True)             # optional label
    created_by = Column(String(50), nullable=True)
    created_at = Column(DateTime(timezone=True), default=now_ist)

    __table_args__ = (UniqueConstraint("holiday_date", "region",
                                       name="uq_pms_holiday_date_region"),)


class PmsMonthSettings(Base):
    """Per-month settings for the AOP Master — the number of working days
    (defaults to all days except Sundays; editable). Working days are set
    PER REGION (MH / KA have different holidays); the legacy single
    `working_days` stays as a fallback for months saved before the split."""
    __tablename__ = "pms_month_settings"

    id = Column(Integer, primary_key=True, index=True)
    target_month = Column(String(7), nullable=False, unique=True, index=True)  # 'YYYY-MM'
    working_days = Column(Integer, nullable=True)         # legacy single value (fallback)
    working_days_mh = Column(Integer, nullable=True)
    working_days_ka = Column(Integer, nullable=True)
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


class PmsSeUid(Base):
    """SE UID master — Service Engineer NAME ↔ UID, maintained from the
    Profile page (Master Admin) by hand or by Excel import.

    The bridge between the files the Employee Productivity report joins:
    'Response Time & MaxTTR Details' carries only the SE NAME, while the LMS
    and EFSR files identify the engineer by SERVICE ENGINEER UID. Matching is
    done on the name's squashed upper-case form (name_key) so spacing / case
    differences between files never split one engineer into two.
    """
    __tablename__ = "pms_se_uid_master"

    id = Column(Integer, primary_key=True, index=True)
    se_name = Column(String(200), nullable=False)
    name_key = Column(String(200), nullable=False, unique=True, index=True)
    se_uid = Column(String(100), nullable=True, index=True)
    # The branch the engineer belongs to — the LAST-RESORT answer for the PMS
    # reports. They read the branch off the uploaded files first; this is what
    # places an engineer no file gives a valid KALA branch code for (an EFSR row
    # can carry another dealer's SD BRANCH CODE). Optional, set by hand on the
    # Profile page; holds the KALA branch id, e.g. '420435_1'.
    branch_id = Column(String(100), nullable=True)
    # Which uploaded file the engineer was found in. Stored on the row (set by
    # the sync) so listing the master is a plain table read — the two DISTINCT
    # scans over MaxTTR / LMS only run when the user asks to reload from data.
    src_maxttr = Column(Boolean, nullable=False, default=False)
    src_lms = Column(Boolean, nullable=False, default=False)
    src_efsr = Column(Boolean, nullable=False, default=False)
    created_by = Column(String(50), nullable=True)
    updated_by = Column(String(50), nullable=True)
    created_at = Column(DateTime(timezone=True), default=now_ist)
    updated_at = Column(DateTime(timezone=True), onupdate=now_ist)


class PmsMaxttrHead(Base):
    """Head master for the MAXTTR SR Type mapping — the SR Type columns of the
    Employee Productivity report. Separate from PmsHead: that one groups the
    Sales/Labour file's SR types for the Sales & Labour report, while this one
    groups the 'Response Time & MaxTTR Details' file's own SR Type column,
    which carries values the labour file never has (Courtesy Visit, Dealer AMC,
    DG Commissioning …)."""
    __tablename__ = "pms_maxttr_heads"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(60), nullable=False, unique=True)
    created_by = Column(String(50), nullable=True)
    created_at = Column(DateTime(timezone=True), default=now_ist)


class PmsMaxttrSrTypeMap(Base):
    """MaxTTR 'SR Type' → head (e.g. 'KOEL Bandhan Plus' → 'AMC').

    Values are synced out of the uploaded MaxTTR file and mapped by hand in the
    AOP Master's 'SR Type Master (MaxTTR)' tab.
    """
    __tablename__ = "pms_maxttr_sr_type_map"

    id = Column(Integer, primary_key=True, index=True)
    sr_type = Column(String(200), nullable=False, unique=True, index=True)
    head = Column(String(60), nullable=True)
    created_by = Column(String(50), nullable=True)
    updated_by = Column(String(50), nullable=True)
    created_at = Column(DateTime(timezone=True), default=now_ist)
    updated_at = Column(DateTime(timezone=True), onupdate=now_ist)


class PmsEfsrHead(Base):
    """Head master for the EFSR SR Type mapping — the 'Allocate SR' SR Type
    columns of the Employee Productivity report. Kept apart from the MaxTTR
    head master because the two files carry different SR Type vocabularies
    (EFSR also has Commercial, RECD Kit …)."""
    __tablename__ = "pms_efsr_heads"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(60), nullable=False, unique=True)
    created_by = Column(String(50), nullable=True)
    created_at = Column(DateTime(timezone=True), default=now_ist)


class PmsEfsrSrTypeMap(Base):
    """EFSR 'SR Type' → head. Values are synced out of the uploaded EFSR
    Report and mapped by hand in the AOP Master's 'SR Type Master (EFSR)' tab.
    """
    __tablename__ = "pms_efsr_sr_type_map"

    id = Column(Integer, primary_key=True, index=True)
    sr_type = Column(String(200), nullable=False, unique=True, index=True)
    head = Column(String(60), nullable=True)
    created_by = Column(String(50), nullable=True)
    updated_by = Column(String(50), nullable=True)
    created_at = Column(DateTime(timezone=True), default=now_ist)
    updated_at = Column(DateTime(timezone=True), onupdate=now_ist)


class PmsLeadCategory(Base):
    """Product category master for leads — the columns of the Employee
    Productivity report's 'Product Wise Lead Count' group (Allied Oil, Battery,
    Whole Goods …). Managed from the AOP Master's Lead Category tab; feeds its
    Category dropdown. Column order follows id."""
    __tablename__ = "pms_lead_categories"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(60), nullable=False, unique=True)
    created_by = Column(String(50), nullable=True)
    created_at = Column(DateTime(timezone=True), default=now_ist)


class PmsLeadRaisedForMap(Base):
    """LMS 'Lead Raised For' → product category (e.g. 'BD Spares' → 'Spares').

    Same shape as the SR Type → Head mapping: the raw values are synced out of
    the uploaded LMS file and each one is mapped to a category by hand.
    """
    __tablename__ = "pms_lead_raised_for_map"

    id = Column(Integer, primary_key=True, index=True)
    lead_raised_for = Column(String(200), nullable=False, unique=True, index=True)
    category = Column(String(60), nullable=True)
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
    # ---- full standard file columns (one REAL column each — no JSON) ----
    instance_id = Column(String(100), nullable=True)          # Part Sale file
    application_code = Column(String(100), nullable=True)     # Part Sale file
    engine_serial_no = Column(String(100), nullable=True)     # Part Sale file
    sr_sub_type = Column(String(120), nullable=True)          # both files
    category = Column(String(100), nullable=True)             # Part Sale file
    part_category = Column(String(100), nullable=True)        # Part Sale file
    part_number = Column(String(120), nullable=True)          # Part Sale file
    part_description = Column(String(255), nullable=True)     # Part Sale file
    quantity = Column(Float, nullable=True)                   # Part Sale file
    series = Column(String(100), nullable=True)               # Labour file
    sr_number = Column(String(100), nullable=True)            # Labour file
    # legacy JSON of unmapped columns — kept only for rows imported before
    # the real columns existed (migration backfills them from here)
    extra_data = Column(Text, nullable=True)
    # Cancelled invoice: the row STAYS stored (audit trail) but is excluded
    # from every generated report. Set/cleared per invoice from the preview.
    is_cancelled = Column(Boolean, nullable=False, default=False, index=True)
    cancelled_by = Column(String(50), nullable=True)
    cancelled_at = Column(DateTime(timezone=True), nullable=True)
    dedupe_key = Column(String(64), nullable=False, unique=True, index=True)
    batch_id = Column(Integer, ForeignKey("pms_upload_batches.id"), nullable=True)
    created_at = Column(DateTime(timezone=True), default=now_ist)

    __table_args__ = (
        Index("ix_pms_records_type_date", "record_type", "claim_invoice_date"),
        # Preview pagination: filter by record_type, newest-first by id.
        Index("ix_pms_records_type_id", "record_type", "id"),
    )

