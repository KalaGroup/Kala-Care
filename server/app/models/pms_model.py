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


class PmsAmcTarget(Base):
    """AOP Master -> AMC & Bandhan AOP - the three columns of the Annual Reports'
    'AMC & Bandhan Projection' sheet that the business ASSERTS rather than counts.

    One row per (financial year, branch):

        prior_nos   'F26 ACT D/BAMC'          last year's actual
        proj_nos    'F27 PROJ AOP D/BAMC'     this year's AOP projection
        best_nos    'BEST ACT AOP D/BAMC (M)' the best month for the year

    All three come from HERE and nowhere else. Nothing in the data raises,
    lowers, seeds or back-fills them - the report prints exactly what somebody
    typed, and an empty cell prints a dash rather than a figure derived behind
    the reader's back. The sheet's other two columns are the counted ones (the
    year's AMC, and the month's payments) and keep nothing in this table.

    prior_by / prior_at stamp who put last year's figure there and when, since it
    is the one column describing a year the current data can no longer show.

    Region and company rows carry no row of their own: these are COUNTS, so the
    report adds its branches up. (The CDI target is a percentage, which is why
    that one needs a target per row instead - see PmsCdiTarget.)
    """

    __tablename__ = "pms_amc_targets"

    id = Column(Integer, primary_key=True, index=True)
    fy = Column(Integer, nullable=False, index=True)   # FY start: 2026 = Apr 2026-Mar 2027
    branch_id = Column(String(60), nullable=False)
    proj_nos = Column(Integer, nullable=True)          # the FY's AOP projection
    prior_nos = Column(Integer, nullable=True)         # the PREVIOUS FY's actual
    prior_by = Column(String(50), nullable=True)       # who set it
    prior_at = Column(DateTime(timezone=True), nullable=True)   # when
    best_nos = Column(Integer, nullable=True)          # BEST ACT (M) for the year
    created_by = Column(String(50), nullable=True)
    updated_by = Column(String(50), nullable=True)
    created_at = Column(DateTime(timezone=True), default=now_ist)
    updated_at = Column(DateTime(timezone=True), onupdate=now_ist)

    __table_args__ = (
        UniqueConstraint("fy", "branch_id", name="uq_pms_amc_target_fy_branch"),
    )


class PmsAmcCategoryTarget(Base):
    """AOP Master -> AMC & Bandhan AOP, the SECOND table on that tab: the AOP of
    each row of the Annual Reports' AMC sheet.

    The tab's first table is keyed on BRANCH, which is what the AMC & Bandhan
    Projection sheet's rows are. The AMC sheet next to it has rows that are
    AGREEMENT CATEGORIES instead - KOEL Bandhan (and its MH / KAR split), KALA
    AMC, KOEL Corporate AMC, expiries, renewals, Live AMC - so its AOP cannot be
    a sum of branch targets and needs a figure of its own per row.

    One row per (fy, row_key); row_key is one of AMC_SHEET_ROWS in
    pms_controller. The sheet's KCGL Total AMC table takes the Live AMC row's AOP
    and splits it equally across the twelve months, so that one figure carries
    both the yearly target and the monthly plan."""
    __tablename__ = "pms_amc_category_targets"

    id = Column(Integer, primary_key=True, index=True)
    fy = Column(Integer, nullable=False, index=True)   # FY start: 2026 = Apr 2026-Mar 2027
    row_key = Column(String(40), nullable=False)
    aop_nos = Column(Integer, nullable=True)
    updated_by = Column(String(50), nullable=True)
    created_at = Column(DateTime(timezone=True), default=now_ist)
    updated_at = Column(DateTime(timezone=True), onupdate=now_ist)

    __table_args__ = (
        UniqueConstraint("fy", "row_key", name="uq_pms_amc_cat_target_fy_row"),
    )


class PmsQuoteCityBranch(Base):
    """AOP Master -> AMC & Bandhan AOP, the CITY MASTER: which branch each city
    in the Bandhan quote files belongs to.

    The four quote files are KOEL's, and their branch column knows KOEL's
    structure rather than this dealership's - so the AMC & Bandhan Projection
    sheet places a paid quote by the customer's CITY instead. Which city belongs
    to which branch is a business fact about territories, and only the business
    knows it: an earlier version tried to derive it from district geography and
    was wrong in ways nobody could see. So it is TYPED, once, and kept here.

    One row per city. `city_key` is the city with everything but letters and
    digits stripped and upper-cased, so 'Ch. Sambhaji Nagar', 'CH SAMBHAJINAGAR'
    and 'Chhatrapati-Sambhajinagar' cannot become three different territories;
    `city_name` keeps one readable spelling for the master's own list.

    A city with no row here is NOT guessed at. Its quotes still count, on the
    Unmapped Branch row, and the report names the city underneath - so a
    territory nobody has mapped yet is a number to chase rather than business
    quietly credited to the wrong branch."""
    __tablename__ = "pms_quote_city_branch"

    id = Column(Integer, primary_key=True, index=True)
    city_key = Column(String(80), nullable=False, unique=True, index=True)
    city_name = Column(String(120), nullable=True)
    branch_id = Column(String(60), nullable=False)
    updated_by = Column(String(50), nullable=True)
    created_at = Column(DateTime(timezone=True), default=now_ist)
    updated_at = Column(DateTime(timezone=True), onupdate=now_ist)


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
    # Set by the HR 'Attendance Summary' import (PmsAttendanceSummary). It is the
    # only source that is not a KOEL data file, so it earns its own flag: a row
    # carrying ONLY this badge is somebody HR employs who has never appeared in
    # MaxTTR / LMS / EFSR — a new joiner, or one of the non-engineer staff the
    # attendance file also lists.
    src_attendance = Column(Boolean, nullable=False, default=False)
    # A HUMAN HAS SETTLED THIS BRANCH. Set when the branch was chosen on the
    # Profile page — by hand in the Edit dialog, or in the branch review the HR
    # attendance import opens when its file disagrees with this row. Once it is
    # set, a monthly HR export that says something else is neither applied nor
    # asked about again: the business has already answered that question, and a
    # dialog that keeps re-asking it is one nobody reads.
    branch_pinned = Column(Boolean, nullable=False, default=False)
    created_by = Column(String(50), nullable=True)
    updated_by = Column(String(50), nullable=True)
    created_at = Column(DateTime(timezone=True), default=now_ist)
    updated_at = Column(DateTime(timezone=True), onupdate=now_ist)


class PmsMaxttrHead(Base):
    """The head list AS THE MAXTTR MASTER ORDERS IT — the SR Type columns of the
    Employee Productivity report, in this order.

    The NAMES are shared with the other three SR Type masters: pms_controller's
    _sync_head_master() keeps this table, pms_heads, pms_efsr_heads and
    pms_service_load_heads carrying the same set, so a head added or deleted in
    any AOP Master tab is added or deleted in all four. Only the ORDER is this
    table's own, which is why the four tables were not collapsed into one.

    What this report PRINTS is narrower still: the heads some SR Type in
    pms_maxttr_sr_type_map actually maps to (see _report_heads), so a head only
    the Service Load master uses never opens an empty column here."""
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
    """The head list AS THE EFSR MASTER ORDERS IT — the 'Allocate SR' SR Type
    columns of the Employee Productivity report.

    Same deal as PmsMaxttrHead: the NAMES are shared across the four SR Type
    masters (_sync_head_master), the order is this one's own, and the report
    prints only the heads pms_efsr_sr_type_map actually maps to."""
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



class PmsTrainingRecord(Base):
    """'Training Report' upload — one row per TRAINING a service engineer has
    been through (PMS -> Training Report page).

    The file's grain is one row per (engineer, skill, training) — the same
    engineer appears once for every skill they were trained on, and once more
    for the same skill when it was re-taken under another CATEGORY (a 'LkVA'
    training counts both as Breakdown Expert and as Service Expert). An
    engineer with NO training yet still gets one row, with the skill blank, so
    the master lists every employee the file carries.

    Only the nine columns the business fixed are stored as real columns:
        UID NO, EMPLOYEE TICKET NUMBER, FULL NAME, OCCUPATION, SKILL,
        BRANCH NAME, BRANCH ID, HIRE DATE, CURRENT STATUS
    EVERYTHING else in the file (ZONE NAME, JOB TITLE, CATEGORY, TRAINING
    DATE, TRAINING END DATE, SD NAME/ID, the bank block, …) is DYNAMIC: it is
    kept verbatim in extra_data as {header: value} and rendered from there, so
    a file that gains or loses a column keeps importing untouched.

    Identity = UID NO + SKILL + TRAINING DATE + CATEGORY. Verified against the
    real export (407 rows): UID + SKILL alone collapsed 114 rows and
    + TRAINING DATE still collapsed 107 (the same training is recorded under
    more than one category); the four together drop none. TRAINING DATE and
    CATEGORY are read out of the file by flexible header match even though
    they live in extra_data — the key has to be stable, the storage does not.
    A re-uploaded row with changed values UPDATES in place (latest file wins).
    """
    __tablename__ = "pms_training_records"

    id = Column(Integer, primary_key=True, index=True)
    # ---- the nine FIXED columns ----
    uid_no = Column(String(60), nullable=False, index=True)
    employee_ticket_number = Column(String(60), nullable=True, index=True)
    full_name = Column(String(200), nullable=False, index=True)
    occupation = Column(String(150), nullable=True)
    skill = Column(String(150), nullable=True, index=True)
    branch_name = Column(String(150), nullable=True, index=True)
    branch_id = Column(String(60), nullable=True, index=True)
    hire_date = Column(Date, nullable=True)
    # 'Active' / 'Inactive' — normalised from the file's CURRENT STATUS column.
    # The file carries it on EVERY row of an employee, so it describes the
    # PERSON: it is what tells a leaver apart from a serving engineer. A leaver's
    # rows are NEVER deleted — the training history has to survive the exit, so
    # the status is the only thing that marks them, and the report both counts
    # and filters on it. NULL = the file had no status column (older uploads).
    current_status = Column(String(30), nullable=True, index=True)
    # Squashed upper-case name ('NILESHSALUNKE') — the same trick PmsSeUid
    # uses, so spacing / case differences between files never split one
    # engineer into two on the name search.
    name_key = Column(String(200), nullable=True, index=True)
    # ---- everything else in the file, verbatim ----
    extra_data = Column(Text, nullable=True)

    dedupe_key = Column(String(64), nullable=False, unique=True, index=True)
    batch_id = Column(Integer, ForeignKey("pms_upload_batches.id"), nullable=True)
    created_at = Column(DateTime(timezone=True), default=now_ist)
    updated_at = Column(DateTime(timezone=True), default=now_ist, onupdate=now_ist)

    __table_args__ = (
        Index("ix_pms_training_uid_skill", "uid_no", "skill"),
    )


class PmsTrainingStatusOverride(Base):
    """A MANUALLY typed employment status, one row per engineer (PMS -> Training
    Report -> open an employee -> Employment status).

    The file's CURRENT STATUS column is only as fresh as the last export: HR
    knows an engineer has left days before KOEL's file says so, and some files
    carry no status column at all. So the status can be typed here, and this
    row OVERRIDES whatever the file says for that UID.

    It lives in its OWN table on purpose. Written onto pms_training_records it
    would be wiped by the next upload — the importer upserts every one of that
    engineer's rows and would put the file's stale 'Active' straight back. Here
    it survives every re-upload, and even a "clear all data": if the person is
    imported again, their manual status is still waiting for them.

    Clearing the override (status typed as blank) DELETES the row, which hands
    the engineer back to the file's own word — that is the only way back, so
    there is never an invisible manual value in play.
    """
    __tablename__ = "pms_training_status_overrides"

    id = Column(Integer, primary_key=True, index=True)
    # UID NO — the identity the training master is keyed on. UNIQUE: one
    # standing answer per engineer, so a re-typed status updates in place.
    uid_no = Column(String(60), nullable=False, unique=True, index=True)
    status = Column(String(30), nullable=False)      # 'Active' | 'Inactive'
    # Last working day, when it is known. Optional: the page's job is to record
    # that the person has GONE, and a date nobody is sure of is worse than none.
    left_on = Column(Date, nullable=True)
    reason = Column(String(300), nullable=True)
    set_by = Column(String(50), nullable=True)
    created_at = Column(DateTime(timezone=True), default=now_ist)
    updated_at = Column(DateTime(timezone=True), default=now_ist, onupdate=now_ist)


# ============================================================================
# ANNUAL REPORTS -> SERVICE LOAD AND RESPONSE
# The sheet reads ONE file, 'Response Time & MaxTTR Details' (response_time_maxttr),
# and needs three masters on top of it: its own SR Type -> head grouping, the
# monthly SR-closure AOP per branch, and the percentage AOPs the counted rows
# are measured against.
# ============================================================================

class PmsServiceLoadHead(Base):
    """The head list AS THE SERVICE LOAD SHEET ORDERS IT — the SR-type-wise
    breakdown rows above its Total (CSP, Post Warranty, Warranty, KOEL AMC,
    Dealer AMC + anything added later).

    WHY THIS IS STILL ITS OWN TABLE: the four masters share one list of head
    NAMES (_sync_head_master), but not one MAPPING and not one order. Both this
    sheet and Employee Productivity read the same file's SR Type column and
    group it differently, and neither grouping is wrong — that report folds CSP
    into Warranty and Dealer AMC into AMC, this sheet prints them as rows of
    their own. Sharing the mapping would force one of the two to lie; sharing
    the name list only means both offer the same dropdown."""
    __tablename__ = "pms_service_load_heads"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(60), nullable=False, unique=True)
    created_by = Column(String(50), nullable=True)
    created_at = Column(DateTime(timezone=True), default=now_ist)


class PmsServiceLoadSrTypeMap(Base):
    """SR Type -> head for the Service Load and Response sheet.

    An SR Type with no head still COUNTS in the sheet's 'Total Service Load
    Available (All Type of SR's)' row — that row is every SR of the period,
    whatever its type — but it gets no breakdown row of its own. The gap between
    that row and the breakdown Total is therefore visible on the sheet instead of
    silently swallowed, and is what the unmapped-types warning reports."""
    __tablename__ = "pms_service_load_sr_type_map"

    id = Column(Integer, primary_key=True, index=True)
    sr_type = Column(String(200), nullable=False, unique=True, index=True)
    head = Column(String(60), nullable=True)
    created_by = Column(String(50), nullable=True)
    updated_by = Column(String(50), nullable=True)
    created_at = Column(DateTime(timezone=True), default=now_ist)
    updated_at = Column(DateTime(timezone=True), onupdate=now_ist)


class PmsServiceLoadTarget(Base):
    """AOP Master -> Service Load AOP tab — the sheet's AOP column for the SR
    CLOSURE rows, and its 'Service Request Closure (Nos.)' strip.

    One row per (target_month, branch_id), because a MONTHLY per-branch number
    is the only figure everything else on the sheet rolls up from:

        the AOP column of a branch row   its 12 months of this FY, summed
        the AOP column of MH / KA        those months across the region's branches
        the AOP column of Total          the same across every branch
        'AOP Target' Apr-26 .. Mar-27    one month across every branch

    Verified against the printed sheet: MH 16255 + KAR 22745 = 39000, and the
    twelve monthly targets (2800, 3000, 3260, 3290 x5, 3400, 3400, 3290, 3400)
    also total 39000. One table, every rollup consistent by construction.

    Region and overall rows need no target of their own here — unlike the
    percentage rows, which cannot be summed (see PmsServiceLoadPctTarget)."""
    __tablename__ = "pms_service_load_targets"

    id = Column(Integer, primary_key=True, index=True)
    target_month = Column(String(7), nullable=False, index=True)   # 'YYYY-MM'
    branch_id = Column(String(60), nullable=False)
    sr_target = Column(Integer, nullable=True)        # SR closures targeted
    created_by = Column(String(50), nullable=True)
    updated_by = Column(String(50), nullable=True)
    created_at = Column(DateTime(timezone=True), default=now_ist)
    updated_at = Column(DateTime(timezone=True), onupdate=now_ist)

    __table_args__ = (
        UniqueConstraint("target_month", "branch_id",
                         name="uq_pms_service_load_target_month_branch"),
    )


class PmsServiceLoadPctTarget(Base):
    """AOP Master -> Service Load AOP tab — the AOP column of the sheet's rows
    that are NOT counts and so cannot be added up: the response / closure
    percentages and the productivity ratio.

    One value per (fy, metric, scope, scope_key). The scope pair is the same
    idea PmsCdiTarget uses, for the same reason — a percentage row needs its own
    target at every level:

        scope 'branch'   scope_key = branch id ('420435_1')
        scope 'region'   scope_key = 'MH' | 'KA'
        scope 'overall'  scope_key = 'ALL'

    metric is the sheet's row:
        'productivity'  Productivity - Calls PP PD          (a ratio, e.g. 1.3)
        'resp4'         4 HRS RESPONSE                      (a percentage, 85)
        'closed24'      SR CLOSED WITHIN 24 HRS             (85)
        'closed48'      SR CLOSED WITHIN 48 HRS             (95)

    The printed sheet sets these at region and overall level only; branch
    targets are optional and stay empty until somebody fills them in."""
    __tablename__ = "pms_service_load_pct_targets"

    id = Column(Integer, primary_key=True, index=True)
    fy = Column(Integer, nullable=False, index=True)    # FY start: 2026 = Apr 2026-Mar 2027
    metric = Column(String(20), nullable=False)         # productivity|resp4|closed24|closed48
    scope = Column(String(10), nullable=False)          # branch|region|overall
    scope_key = Column(String(60), nullable=False)      # branch id | 'MH'/'KA' | 'ALL'
    target_value = Column(Float, nullable=True)
    created_by = Column(String(50), nullable=True)
    updated_by = Column(String(50), nullable=True)
    created_at = Column(DateTime(timezone=True), default=now_ist)
    updated_at = Column(DateTime(timezone=True), onupdate=now_ist)

    __table_args__ = (
        UniqueConstraint("fy", "metric", "scope", "scope_key",
                         name="uq_pms_service_load_pct_target"),
    )


class PmsServiceLoadManual(Base):
    """AOP Master -> Service Load AOP tab — the FTR / FVR figures of the
    'Service Load and Response' sheet, TYPED rather than counted.

    Nothing in any upload can produce them: FIRST TIME RIGHT and FIRST VISIT
    REPORT are judgements KOEL makes about a job, and the two files that once
    carried them were withdrawn. So the sheet prints what a person enters, and
    these rows are the only ones on it that are asserted rather than measured.

    One value per (metric, period), where period is either

        'YYYY-MM'   a month           -> that month's column
        'FYnnnn'    a financial year  -> 'Cumm FY nn-nn', Apr nnnn to Mar nnnn+1

    The keys are ABSOLUTE, not relative to whichever year is open on the report:
    a figure typed for FY2025 keeps meaning FY25-26 when the page moves on to
    FY26-27 and that year becomes the middle cumulative column. A period nobody
    has filled in has NO row, and the sheet shows a dash for it — which is not
    the same statement as 0%."""
    __tablename__ = "pms_service_load_manual"

    id = Column(Integer, primary_key=True, index=True)
    metric = Column(String(20), nullable=False)        # 'ftr' | 'fvr'
    period = Column(String(10), nullable=False)        # 'YYYY-MM' | 'FYnnnn'
    value = Column(Float, nullable=True)               # a percentage, 0-100
    created_by = Column(String(50), nullable=True)
    updated_by = Column(String(50), nullable=True)
    created_at = Column(DateTime(timezone=True), default=now_ist)
    updated_at = Column(DateTime(timezone=True), onupdate=now_ist)

    __table_args__ = (
        UniqueConstraint("metric", "period", name="uq_pms_service_load_manual"),
    )


class PmsServiceLoadSeCount(Base):
    """AOP Master -> Service Load AOP tab — the SERVICE ENGINEER HEADCOUNT of
    each branch, and the denominator of the sheet's productivity row.

    Productivity is closures / (SE headcount x working days). The headcount has
    to be TYPED because the file cannot supply it: the MaxTTR export only names
    the engineers who happened to CLOSE something in the period, so a branch
    with ten engineers where two were on leave would read as a branch of eight
    and its productivity would come out flattered. What the business measures
    against is the people it employs, present or not.

    One row per branch — the establishment, not a monthly roster. Blank means no
    headcount is on record, and the sheet then shows a dash rather than dividing
    by nothing."""
    __tablename__ = "pms_service_load_se_count"

    id = Column(Integer, primary_key=True, index=True)
    branch_id = Column(String(60), nullable=False, unique=True, index=True)
    se_count = Column(Integer, nullable=True)
    created_by = Column(String(50), nullable=True)
    updated_by = Column(String(50), nullable=True)
    created_at = Column(DateTime(timezone=True), default=now_ist)
    updated_at = Column(DateTime(timezone=True), onupdate=now_ist)


class PmsAttendanceSummary(Base):
    """HR's monthly 'Attendance Summary' file, one row per employee per month.

    The file is uploaded from the SE UID Master (Profile page) because it is the
    only export that carries BOTH identities: E Code — the KalaCare login id in
    dbo.users — and UID, the Service Engineer UID the PMS reports attribute LMS
    leads by. Importing it therefore does two jobs: it stores the month's
    attendance here, and it fills the blanks in pms_se_uid_master (see
    import_attendance_summary).

    The file itself carries NO month column — 'July' lives only in its name — so
    the period is chosen by hand at import time and stored as period_month
    ('YYYY-MM'). Re-uploading a month REPLACES that month's rows and leaves every
    other month alone, which is what makes a corrected re-export safe.

    Counts are Float, not Integer: a half day is half a day.
    """
    __tablename__ = "pms_attendance_summary"
    __table_args__ = (
        # One row per employee per month — the upsert key of the import.
        UniqueConstraint("period_month", "e_code", name="uq_pms_att_month_ecode"),
        Index("ix_pms_att_month_branch", "period_month", "branch_id"),
    )

    id = Column(Integer, primary_key=True, index=True)
    period_month = Column(String(7), nullable=False, index=True)   # 'YYYY-MM'

    # ---- identity ---------------------------------------------------------
    e_code = Column(String(50), nullable=False, index=True)        # users.user_id
    uid = Column(String(100), nullable=True, index=True)           # SE UID; the
    # file writes 'UID Pending' / 'UID Hold' for a new joiner, which is stored as
    # typed but never offered to the SE UID master as a UID.
    employee_name = Column(String(200), nullable=True)
    name_key = Column(String(200), nullable=True, index=True)      # squashed name
    joining_date = Column(Date, nullable=True)

    # Branch as the file spells it, plus the KALA branch id it resolves to.
    # Both are kept: 'Bidar' and 'Raichur' are in the HR file but are not KALA
    # branches, so they resolve to nothing and only the raw name survives.
    branch = Column(String(120), nullable=True)
    branch_id = Column(String(100), nullable=True, index=True)
    designation = Column(String(120), nullable=True)

    # ---- the month's figures, exactly the CURRENT file's columns ------------
    # These ten, and only these ten: they are what 'Attendance <Month>' carries,
    # and its trailing counts are exactly the totals of its own day cells.
    #
    # HALF DAY IS IN DAYS, not in occurrences. Two half days are stored as 1.0.
    # That is the convention the old summary export used and it is kept, so a
    # month uploaded from either file adds up the same way and days worked is
    # present + out_door_duty + half_day with nothing halved twice.
    #
    # The older export also had Payable Days, Leave & Absent, LOP, Allowed
    # Leave, Total Payable Days and an EmpStatus. HR does not send them now,
    # nothing reads them, and they are gone from this model - the physical
    # columns are still on the table, nullable, holding whatever that export
    # last left in them.
    total_days_month = Column(Float, nullable=True)
    present = Column(Float, nullable=True)
    out_door_duty = Column(Float, nullable=True)
    half_day = Column(Float, nullable=True)
    absent = Column(Float, nullable=True)
    leave = Column(Float, nullable=True)
    weekly_off = Column(Float, nullable=True)
    c_off = Column(Float, nullable=True)
    holiday = Column(Float, nullable=True)
    na = Column(Float, nullable=True)

    created_by = Column(String(50), nullable=True)
    updated_by = Column(String(50), nullable=True)
    created_at = Column(DateTime(timezone=True), default=now_ist)
    updated_at = Column(DateTime(timezone=True), onupdate=now_ist)


class PmsAttendanceDay(Base):
    """HR's DAY-WISE attendance — one row per employee per calendar day.

    The 'Attendance <Month>' export (Code, UID, Employee Name, Joining Date,
    Branch, Designation, Total Days Month, D_01 .. D_31, then a count per
    status). It is the same 142 employees as the 'Attendance Summary' export of
    the same month and its trailing counts are exactly the totals of its own day
    cells - checked over 142 employees x 9 counts, 0 mismatches - so this file
    ALONE can carry a month: the import derives the month's summary row from
    these days rather than asking for the second file.

    ONE ROW PER DAY rather than 31 columns per employee: the reports read it by
    date (SE Performance shows the selected month day by day), a month is
    ~4,400 rows, and a file with a different number of day columns needs no
    migration.

    status is the file's OWN word, stored verbatim ('Outdoor Duty', 'Weekly
    Off', 'C Off'), and code is the one letter the reports read:
        P present     O out-door duty   H half day
        L leave       A absent
        W weekly off  C c-off           Y holiday
        -  no data ('NA', or a blank cell)
    Both are kept on purpose: the CLASSIFICATION is a business rule (leave and
    absent are the only two that cost a day; present and out-door duty both
    earn one) and a rule that changes must be re-derivable from what the file
    actually said, without a re-upload.

    Re-uploading a month REPLACES that month's rows and leaves every other
    month alone - the same contract as pms_attendance_summary.
    """
    __tablename__ = "pms_attendance_day"
    __table_args__ = (
        # one row per employee per day is the file's own grain
        UniqueConstraint("work_date", "e_code", name="uq_pms_attday_date_ecode"),
        Index("ix_pms_attday_month", "period_month"),
        Index("ix_pms_attday_uid", "uid"),
    )

    id = Column(Integer, primary_key=True, index=True)
    period_month = Column(String(7), nullable=False, index=True)   # 'YYYY-MM'
    work_date = Column(Date, nullable=False, index=True)

    # ---- identity, the same three keys the summary is joined on ------------
    e_code = Column(String(50), nullable=False, index=True)        # users.user_id
    uid = Column(String(100), nullable=True, index=True)           # SE UID
    employee_name = Column(String(200), nullable=True)
    name_key = Column(String(200), nullable=True, index=True)      # squashed name

    # ---- the day itself ---------------------------------------------------
    status = Column(String(40), nullable=True)                     # the file's word
    code = Column(String(1), nullable=True, index=True)            # P O H L A W C Y -

    created_by = Column(String(50), nullable=True)
    created_at = Column(DateTime(timezone=True), default=now_ist)


class PmsAttBranchAlias(Base):
    """HR's OWN SPELLING of a branch -> the KALA branch it means.

    HR's attendance export names the branch in its own words, and those words
    are not always a KALA branch name: 'Gulberga' for Gulbarga, a shortened
    'Ch. Sambhaji Nagar Br', a branch renamed on their side and not on ours.
    Until now such a name resolved to nothing, the engineers in it were left
    without a branch, and the import said so in one lumped sentence nobody
    could act on.

    This is where the answer is kept. The branch review that opens after an HR
    upload asks WHICH KALA branch a name it could not resolve means, and the
    answer is stored here once: every later month resolves the same spelling on
    its own (see _att_branch_id). A hard-coded alias list (_ATT_BRANCH_ALIAS)
    is still consulted after this table, so the spellings already known keep
    working with nothing typed.

    name_key is the same squashed form _branch_name_key builds, so the dealer
    prefix and the punctuation cannot split one spelling into two rows.
    """
    __tablename__ = "pms_att_branch_alias"

    id = Column(Integer, primary_key=True, index=True)
    # squashed, letters and digits only — the lookup key
    name_key = Column(String(200), nullable=False, unique=True, index=True)
    hr_name = Column(String(200), nullable=True)      # as the file spells it
    branch_id = Column(String(100), nullable=False)   # e.g. '420435_1'
    created_by = Column(String(50), nullable=True)
    updated_by = Column(String(50), nullable=True)
    created_at = Column(DateTime(timezone=True), default=now_ist)
    updated_at = Column(DateTime(timezone=True), onupdate=now_ist)
