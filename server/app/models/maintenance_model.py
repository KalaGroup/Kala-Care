from sqlalchemy import (
    Column, Integer, String, DateTime, ForeignKey, Boolean
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base
from app.time_utils import now_ist


class MaintenanceAppCode(Base):
    """A genset application code (one engine configuration).

    Parent of its part lines AND of its kits. The application code is unique;
    re-importing a code deletes the existing record and re-inserts it from the
    uploaded file.
    """
    __tablename__ = "maintenance_app_codes"

    id = Column(Integer, primary_key=True, index=True)
    app_code = Column(String(60), nullable=False, unique=True, index=True)
    system_app_code = Column(String(80), nullable=True)
    segment = Column(String(40), nullable=True)
    engine_model = Column(String(120), nullable=True)
    kva = Column(String(20), nullable=True)
    emission = Column(String(40), nullable=True)
    created_by = Column(String(50), nullable=True)
    updated_by = Column(String(50), nullable=True)
    created_at = Column(DateTime(timezone=True), default=now_ist)
    updated_at = Column(DateTime(timezone=True), onupdate=now_ist)
    # Set once the code's legacy kit data (stored on its part rows as alt_*) has
    # been lifted into maintenance_kits. Guards the one-time startup backfill so
    # kits the user later deletes are never resurrected.
    kits_migrated = Column(Boolean, nullable=False, default=False)

    parts = relationship(
        "MaintenancePart",
        back_populates="app",
        cascade="all, delete-orphan",
        order_by="MaintenancePart.sort_order",
    )
    kits = relationship(
        "MaintenanceKit",
        back_populates="app",
        cascade="all, delete-orphan",
        order_by="MaintenanceKit.sort_order",
    )


class MaintenanceKit(Base):
    """A maintenance kit under an application code — an INDEPENDENT record.

    A kit is built by copying part lines, but it is never linked back to them:
    editing a service part does not change the kit's copy, the same part can be
    copied into any number of kits, and a kit's own part lines can be edited or
    extended on their own (see MaintenanceKitPart).
    """
    __tablename__ = "maintenance_kits"

    id = Column(Integer, primary_key=True, index=True)
    app_code_id = Column(
        Integer, ForeignKey("maintenance_app_codes.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    kit_number = Column(String(120), nullable=True)
    kit_desc = Column(String(400), nullable=True)
    qty = Column(String(20), nullable=True)
    action = Column(String(10), nullable=True)          # R / C / T
    service_hours = Column(String(20), nullable=True)
    sort_order = Column(Integer, nullable=True, default=0)
    created_by = Column(String(50), nullable=True)
    updated_by = Column(String(50), nullable=True)
    created_at = Column(DateTime(timezone=True), default=now_ist)
    updated_at = Column(DateTime(timezone=True), onupdate=now_ist)

    app = relationship("MaintenanceAppCode", back_populates="kits")
    parts = relationship(
        "MaintenanceKitPart",
        back_populates="kit",
        cascade="all, delete-orphan",
        order_by="MaintenanceKitPart.sort_order",
    )


class MaintenanceKitPart(Base):
    """One part line that belongs to a kit — a standalone COPY.

    Snapshotted from a service part when the kit was built (or typed straight
    into the kit). It carries no foreign key to maintenance_parts on purpose.
    """
    __tablename__ = "maintenance_kit_parts"

    id = Column(Integer, primary_key=True, index=True)
    kit_id = Column(
        Integer, ForeignKey("maintenance_kits.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    part_number = Column(String(120), nullable=True)
    part_desc = Column(String(400), nullable=True)
    qty = Column(String(20), nullable=True)
    action = Column(String(10), nullable=True)          # R / C / T
    service_hours = Column(String(20), nullable=True)
    sort_order = Column(Integer, nullable=True, default=0)

    kit = relationship("MaintenanceKit", back_populates="parts")


class MaintenancePart(Base):
    """A single part / consumable line under an application code.

    `service_hours` binds the part to a service type (e.g. 500 -> B-Check), since the
    source file's "Service schedules" column is blank.

    The alt_* columns are the LEGACY kit storage (kit data written onto the part
    row). Kits now live in maintenance_kits; these columns are kept only so the
    original uploaded file's shape survives and the one-time backfill can read it.
    """
    __tablename__ = "maintenance_parts"

    id = Column(Integer, primary_key=True, index=True)
    app_code_id = Column(
        Integer, ForeignKey("maintenance_app_codes.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    part_number = Column(String(120), nullable=True)
    part_desc = Column(String(400), nullable=True)
    qty = Column(String(20), nullable=True)
    action = Column(String(10), nullable=True)          # R / C / T
    alt_part_no = Column(String(120), nullable=True)
    alt_desc = Column(String(400), nullable=True)
    alt_qty = Column(String(20), nullable=True)
    alt_action = Column(String(10), nullable=True)
    alt_service_hours = Column(String(20), nullable=True)
    service_hours = Column(String(20), nullable=True)
    consumable = Column(String(40), nullable=True)
    schedule = Column(String(120), nullable=True)
    sort_order = Column(Integer, nullable=True, default=0)

    app = relationship("MaintenanceAppCode", back_populates="parts")


class MaintenancePartCodeChange(Base):
    """Audit of part-code edits on a code's SERVICE parts (kits are ignored).

    Backend-only — nothing serializes or serves this table to the frontend.
    One row per part line, keyed by the line's current code: when the same
    line's code is edited again the row is updated in place, so only the LAST
    previous code is kept, along with how many times the code has changed and
    who changed it last.
    """
    __tablename__ = "maintenance_part_code_changes"

    id = Column(Integer, primary_key=True, index=True)
    app_code = Column(String(60), nullable=False, index=True)
    part_number = Column(String(120), nullable=False, index=True)   # current code
    last_part_number = Column(String(120), nullable=True)           # code it replaced
    part_desc = Column(String(400), nullable=True)
    change_count = Column(Integer, nullable=False, default=1)
    changed_by = Column(String(50), nullable=True)
    changed_at = Column(DateTime(timezone=True), default=now_ist, onupdate=now_ist)


class MaintenanceService(Base):
    """Service-type catalogue (B-Check, 1500 Hrs, ...).

    Seeded once. Only `name` is user-editable; renaming reflects everywhere because
    parts bind to a service by `hours`, not by name.
    """
    __tablename__ = "maintenance_services"

    id = Column(Integer, primary_key=True, index=True)
    key = Column(String(30), nullable=False, unique=True, index=True)   # sv500, sv1500, ...
    name = Column(String(150), nullable=False)
    short = Column(String(40), nullable=True)
    hours = Column(String(20), nullable=False)
    note = Column(String(400), nullable=True)
    created_at = Column(DateTime(timezone=True), default=now_ist)
    updated_at = Column(DateTime(timezone=True), onupdate=now_ist)


class MaintenanceActivity(Base):
    """One look-up of an application code on the Service Selection screen.

    Records who (employee / user_id) opened which code and when — feeds the
    Search Activity report.
    """
    __tablename__ = "maintenance_activity"

    id = Column(Integer, primary_key=True, index=True)
    app_code = Column(String(60), nullable=False, index=True)
    employee = Column(String(120), nullable=True)
    user_id = Column(String(50), nullable=True)
    engine_model = Column(String(120), nullable=True)
    segment = Column(String(40), nullable=True)
    created_at = Column(DateTime(timezone=True), default=now_ist, index=True)