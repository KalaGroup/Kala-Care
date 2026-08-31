import logging

# Hide harmless "ConnectionResetError: [WinError 10054]" spam on Windows
class _SuppressConnLost(logging.Filter):
    def filter(self, record):
        return "_call_connection_lost" not in record.getMessage()

logging.getLogger("asyncio").addFilter(_SuppressConnLost())

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.staticfiles import StaticFiles
from dotenv import load_dotenv
from pathlib import Path
import os
import threading
import time
from datetime import datetime

from app.database import engine, Base, test_connection, SessionLocal
from app.controllers.user_controller import UserController
from app.controllers.edit_customer_controller import EditCustomerController

from app.routes import (
    customer_routes,
    customer_bulk_export_routes,
    import_routes,
    campaign_routes,
    engagement_routes,
    user_routes,
    banner_routes,
    emp_per_routes,
    query_routes,
    edit_customer_routes,
    delete_routes,
    expenseAddingData_routes,
    TADA_routes,
    TADA_HO_routes,
    OE_routes,
    LVB_routes,
    branch_upload_limit_routes,
    HOExpenseDash_routes,
    BranchAdminExpenseDash_routes,
    diery_routes,
    branch_submit_limits_routes,
    Imprest_routes,
    TADA_bill_wise_routes,
    salesBM_routes,
    knowledge_book_routes,
    maintenance_routes,
    mom_routes,
    approval_routes,
    pms_routes,
    welcome_letter_routes,
    quotation_tracker_routes
)

# ---------------- LOAD ENV ---------------- #

BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR / ".env")

ALLOWED_ORIGIN = os.getenv("ALLOWED_ORIGIN")
# ---------------- IMPORT MODELS ---------------- #

from app.models import customer_model, campaign_model, engagement_model
from app.models import banner_model
from app.models import user_model
from app.models import login_activity_model
from app.models.user_model import User, UserBranchAccess
from app.models import maintenance_model
from app.models import mom_model
from app.models import approval_application_model
from app.models import pms_model
from app.models import welcome_letter_model
from app.time_utils import now_ist

# ---------------- CREATE UPLOAD DIRECTORIES ---------------- #

UPLOAD_DIR = BASE_DIR / "uploads"
BANNER_DIR = UPLOAD_DIR / "banners"

os.makedirs(BANNER_DIR, exist_ok=True)

# ---------------- CREATE DATABASE TABLES ---------------- #

# create_all creates any table that does not exist yet; it NEVER alters an
# existing table. Schema changes to existing tables (new columns, key/index
# changes) are applied manually via databaseSQl.txt in SSMS.
from sqlalchemy.exc import OperationalError
from app.performance_indexes import (
    ensure_performance_indexes, ensure_schema, ensure_table_renames
)

# Renamed tables MUST be renamed BEFORE create_all — otherwise create_all sees
# the new name missing and creates a second, EMPTY table, orphaning the data.
try:
    ensure_table_renames(engine)
except Exception as e:
    print(f"[table-rename] skipped: {e}")

print("Creating/Updating database tables...")
try:
    Base.metadata.create_all(bind=engine)
    print("Tables created/updated successfully!")
except OperationalError as e:
    # The app cannot run without its database, so this still aborts startup —
    # but the raw SQLAlchemy traceback is ~200 lines that never once name the
    # server being dialled. Say what was tried, and why it failed, first.
    from app import config as _cfg
    _bar = "=" * 72
    print(f"\n{_bar}\nSTARTUP FAILED - cannot reach the database\n{_bar}")
    print(f"  server   : {_cfg.DB_CONFIG['server']!r}")
    print(f"  database : {_cfg.DB_CONFIG['database']!r}")
    print(f"  user     : {_cfg.DB_CONFIG['username']!r}")
    print(f"  driver   : {_cfg.DB_CONFIG['driver']!r}")
    print(f"\n  {type(e.orig).__name__}: {e.orig}")
    print("\n  These come from DB_SERVER / DB_NAME / DB_USER / DB_PASSWORD in")
    print("  server/.env. Common causes:")
    print("    - 08001 'Server is not found' -> wrong DB_SERVER. A NAMED instance")
    print(r"      needs its instance name, e.g. localhost\SQLEXPRESS not localhost")
    print("    - 28000 'Login failed'        -> wrong DB_USER / DB_PASSWORD, or the")
    print("      instance is Windows-auth only / the sa login is disabled")
    print(_bar + "\n")
    raise SystemExit(1)

# Ensure performance indexes for the hot list/dashboard queries. Idempotent
# (IF NOT EXISTS) — after the first run this is a fast no-op on every startup.
# Top up columns the models expect but create_all can't add to existing tables
# (e.g. asset_detailed.emission_norm), backfilling from extra_data on first add.
try:
    ensure_schema(engine)
except Exception as e:
    print(f"[schema] skipped: {e}")
try:
    ensure_performance_indexes(engine)
except Exception as e:
    print(f"[perf-indexes] skipped: {e}")

# Kits used to live on the part rows (maintenance_parts.alt_*). Lift any code
# that has not been converted yet into the standalone maintenance_kits tables.
# Idempotent — each code is flagged with kits_migrated once it has been done.
try:
    from app.controllers.maintenance_controller import backfill_kits as _backfill_kits

    _db = SessionLocal()
    try:
        _n = _backfill_kits(_db)
        if _n:
            print(f"✅ Migrated kits for {_n} application code(s)")
    finally:
        _db.close()
except Exception as e:
    print(f"[kit-backfill] skipped: {e}")

# EFSR rows imported before task_assigned_date existed keep that date only in
# their extra_data JSON. Lift it into the real column so the Employee
# Productivity report's Allocate SR column can use it. Idempotent.
try:
    from app.controllers.import_controller import backfill_efsr_task_assigned as _efsr_bf

    _db = SessionLocal()
    try:
        _n = _efsr_bf(_db)
        if _n:
            print(f"✅ Backfilled EFSR task-assigned date for {_n} SR(s)")
        # Same story for Task End Date — the SR Allocation report counts its
        # Closed SR on it, so old rows need it lifted out of extra_data too.
        from app.controllers.import_controller import backfill_efsr_task_end as _efsr_end_bf
        _ne = _efsr_end_bf(_db)
        if _ne:
            print(f"✅ Backfilled EFSR task-end date for {_ne} SR(s)")
        from app.controllers.import_controller import backfill_cdi_activity_end as _cdi_bf
        _m = _cdi_bf(_db)
        if _m:
            print(f"✅ Backfilled CDI activity-end date for {_m} row(s)")
        # The Customer Delight Index report groups by the CDI file's BRANCH
        # NAME - the one branch column that file has. Lifts it out of the
        # dynamic JSON into its column and drops the now-duplicate key.
        from app.controllers.import_controller import backfill_cdi_branch_name as _cdi_bn
        _b = _cdi_bn(_db)
        if _b:
            print(f"✅ Moved CDI branch name into its column for {_b} row(s)")
    finally:
        _db.close()
except Exception as e:
    print(f"[efsr-backfill] skipped: {e}")

# Welcome Letter attachments are stored IN the database. Pull any file left on
# disk by the earlier build into its row and delete the legacy folder.
# Idempotent — a no-op once nothing has a stored_path.
try:
    from app.controllers.welcome_letter_controller import migrate_files_to_db as _wl_migrate

    _db = SessionLocal()
    try:
        _wl_migrate(_db)
    finally:
        _db.close()
except Exception as e:
    print(f"[welcome-letter-files] skipped: {e}")

# ---------------- FASTAPI APP ---------------- #

# orjson serializes large JSON payloads several times faster than the standard
# library, producing byte-identical data for clients. Guarded import so the
# app (and the PyInstaller build) still runs fine without the package.
try:
    from fastapi.responses import ORJSONResponse as _DefaultResponse
    import orjson  # noqa: F401 — verify it's actually importable
    print("✅ orjson enabled for fast JSON responses")
except ImportError:
    _DefaultResponse = None

app = FastAPI(
    title="KALA Care API",
    **({"default_response_class": _DefaultResponse} if _DefaultResponse else {}),
)

# ---------------- STATIC FILES ---------------- #

app.mount("/api/uploads", StaticFiles(directory=str(UPLOAD_DIR)), name="uploads")

# ---------------- BACKFILL ---------------- #

def backfill_primary_branches(db):
    """One-time backfill: ensure every existing user has at least one
    UserBranchAccess row marked as primary. Safe to run on every startup —
    only inserts rows for users that don't already have one."""
    try:
        users = db.query(User).all()
        inserted = 0
        for u in users:
            exists = db.query(UserBranchAccess).filter_by(user_id=u.user_id).first()
            if not exists:
                db.add(UserBranchAccess(
                    user_id=u.user_id,
                    branch=u.branch,
                    branch_name=u.branch_name,
                    is_primary=True
                ))
                inserted += 1
        db.commit()
        if inserted > 0:
            print(f"✅ Backfilled {inserted} primary branch access rows")
    except Exception as e:
        db.rollback()
        print(f"❌ Backfill error: {e}")

# ---------------- EMAIL FUNCTIONS ---------------- #

def get_report_window(today):
    """
    Return (start_date, end_date) for the report based on today's date,
    or None if today is not a send day.

      10th -> 1st..10th  (plus the 31st of the previous month if it had 31 days)
      20th -> 11th..20th
      end  -> 21st..30th  (or 21st..last-day for February: 28th/29th)
    """
    import calendar
    y, m, d = today.year, today.month, today.day
    last_day = calendar.monthrange(y, m)[1]              # 28 / 29 / 30 / 31
    end_send_day = 30 if last_day >= 30 else last_day    # Feb -> 28 or 29

    # ----- 10th send: 1st..10th, plus leftover 31st of previous month -----
    if d == 10:
        pm, py = (12, y - 1) if m == 1 else (m - 1, y)
        prev_last = calendar.monthrange(py, pm)[1]
        start = datetime(py, pm, 31) if prev_last == 31 else datetime(y, m, 1)
        return start, datetime(y, m, 10, 23, 59, 59)

    # ----- 20th send: 11th..20th -----
    if d == 20:
        return datetime(y, m, 11), datetime(y, m, 20, 23, 59, 59)

    # ----- end-of-month send: 21st..30th  (or 21st..28th/29th for Feb) -----
    if d == end_send_day:
        return datetime(y, m, 21), datetime(y, m, end_send_day, 23, 59, 59)

    return None


def scheduled_10_day_report_sender():
    """Send the edit-history report on the 10th, 20th and end-of-month at 9:00 AM."""
    while True:
        try:
            now = now_ist()
            if now.hour == 9 and now.minute == 0:
                window = get_report_window(now)
                if window:
                    start_date, end_date = window
                    db = SessionLocal()
                    controller = EditCustomerController(db)
                    controller.send_last_10_days_edit_history_email(
                        force_send=True,
                        start_date=start_date,
                        end_date=end_date,
                    )
                    db.close()
                    time.sleep(3600)  # avoid re-sending within the same hour
                else:
                    time.sleep(60)
            else:
                time.sleep(60)
        except Exception as e:
            print(f"Email scheduler error: {e}")
            time.sleep(300)

# ---------------- STARTUP EVENT ---------------- #

@app.on_event("startup")
def startup():
    if test_connection():
        print("✅ Database Connected Successfully")
        
        db = SessionLocal()
        
        try:
            # Create admin user
            UserController.initialize_admin_user(db)
            
            # Backfill multi-branch access for existing users (one-time migration)
            backfill_primary_branches(db)
            
            # Start email scheduler
            email_thread = threading.Thread(target=scheduled_10_day_report_sender, daemon=True)
            email_thread.start()
            print("✅ Email scheduler started (reports on 10th, 20th, 30th at 9:00 AM)")
            
        finally:
            db.close()
    else:
        print("❌ Database Connection Failed")

# ---------------- COMPRESSION ---------------- #
# Transparently gzip large JSON responses (e.g. the big performance/followup
# payloads). Responses smaller than minimum_size are left uncompressed so we
# don't waste CPU on tiny bodies. This changes nothing about the response
# content — clients decode it automatically.
app.add_middleware(GZipMiddleware, minimum_size=1024)

# ---------------- CORS ---------------- #

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://kalapms.com:8383",
        "http://www.kalapms.com:8383",
        "https://kalapms.com:8383",
        "https://www.kalapms.com:8383",
        "http://kalapms.com",
        "https://kalapms.com",
        "http://kalacare.kalapms.com",
        "https://kalacare.kalapms.com",
        ALLOWED_ORIGIN
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-Total-Count"], 
)

# ---------------- ROUTES ---------------- #

# Registered BEFORE customer_routes: FastAPI matches in registration order,
# and /customers/{customer_id} in that router would otherwise swallow
# /customers/bulk-export.
app.include_router(customer_bulk_export_routes.router, prefix="/api")
app.include_router(customer_routes.router, prefix="/api")
app.include_router(import_routes.router, prefix="/api")
app.include_router(campaign_routes.router, prefix="/api/v1")
app.include_router(engagement_routes.router, prefix="/api/v1")
app.include_router(user_routes.router)
app.include_router(banner_routes.router, prefix="/api")
app.include_router(emp_per_routes.router)
app.include_router(query_routes.router)
app.include_router(edit_customer_routes.router, prefix="/api/v1")
app.include_router(delete_routes.router)
app.include_router(expenseAddingData_routes.router, prefix="/api")
app.include_router(TADA_routes.router, prefix="/api")
app.include_router(TADA_HO_routes.router, prefix="/api")
app.include_router(OE_routes.router, prefix="/api")
app.include_router(LVB_routes.router, prefix="/api")
app.include_router(branch_upload_limit_routes.router, prefix="/api")
app.include_router(HOExpenseDash_routes.router, prefix="/api")
app.include_router(BranchAdminExpenseDash_routes.router, prefix="/api")
app.include_router(diery_routes.router, prefix="/api")
app.include_router(branch_submit_limits_routes.router, prefix="/api")
app.include_router(Imprest_routes.router, prefix="/api")
app.include_router(TADA_bill_wise_routes.router, prefix="/api")
app.include_router(salesBM_routes.router, prefix="/api")
app.include_router(knowledge_book_routes.router, prefix="/api")
app.include_router(maintenance_routes.router, prefix="/api")
app.include_router(mom_routes.router, prefix="/api")
app.include_router(approval_routes.router, prefix="/api")
app.include_router(pms_routes.router, prefix="/api")
app.include_router(welcome_letter_routes.router, prefix="/api")
app.include_router(quotation_tracker_routes.router, prefix="/api")

# ---------------- ROOT ---------------- #

@app.get("/")
def root():
    return {"message": "KALA Care API running successfully"}

# ---------------- HEALTH CHECK ---------------- #

@app.get("/health")
def health_check():
    return {
        "status": "healthy",
        "uploads": {
            "upload_dir_exists": UPLOAD_DIR.exists(),
            "banner_dir_exists": BANNER_DIR.exists()
        }
    }

# ---------------- TEST APIs ---------------- #

@app.get("/api/test")
def test_get():
    return {"message": "GET test successful"}

@app.post("/api/test")
def test_post():
    return {"message": "POST test successful"}

# ---------------- DEBUG PATH ---------------- #

@app.get("/debug-path")
async def debug_path(request: Request):
    return {
        "full_path": str(request.url),
        "path": request.url.path,
        "headers": dict(request.headers)
    }