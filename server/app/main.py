import logging

# Hide harmless "ConnectionResetError: [WinError 10054]" spam on Windows
class _SuppressConnLost(logging.Filter):
    def filter(self, record):
        return "_call_connection_lost" not in record.getMessage()

logging.getLogger("asyncio").addFilter(_SuppressConnLost())

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
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
    maintenance_routes
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

# ---------------- CREATE UPLOAD DIRECTORIES ---------------- #

UPLOAD_DIR = BASE_DIR / "uploads"
BANNER_DIR = UPLOAD_DIR / "banners"

os.makedirs(BANNER_DIR, exist_ok=True)

# ---------------- CREATE DATABASE TABLES ---------------- #

print("Creating/Updating database tables...")
Base.metadata.create_all(bind=engine)
print("Tables created/updated successfully!")

# ---------------- FASTAPI APP ---------------- #

app = FastAPI(
    title="KALA Care API",
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
            now = datetime.now()
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