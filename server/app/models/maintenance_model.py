from sqlalchemy import (
    Column, Integer, String, DateTime, ForeignKey
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base
from app.time_utils import now_ist


class MaintenanceAppCode(Base):
    """A genset application code (one engine configuration).

    Parent of its part lines. The application code is unique; re-importing a code
    deletes the existing record and re-inserts it from the uploaded file.
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
    created_at = Column(DateTime(timezone=True), default=now_ist)
    updated_at = Column(DateTime(timezone=True), onupdate=now_ist)

    parts = relationship(
        "MaintenancePart",
        back_populates="app",
        cascade="all, delete-orphan",
        order_by="MaintenancePart.sort_order",
    )


class MaintenancePart(Base):
    """A single part / consumable line under an application code.

    `service_hours` binds the part to a service type (e.g. 500 -> B-Check), since the
    source file's "Service schedules" column is blank.
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