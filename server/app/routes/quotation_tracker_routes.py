"""Open Quotation Tracker — endpoints for the branch-wise service quotation and
invoicing summary. See app/controllers/quotation_tracker_controller.py for what the
report reads and how the two files are joined.

ACCESS: the Master Admin always, plus any user the Master Admin has ticked
"Open Quotation Tracker Access" for in Profile. Resolved from the DB on every
call — the role that arrives in a header is client-supplied and must never
decide access on its own.
"""

from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Query
from fastapi.concurrency import run_in_threadpool
from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.controllers import quotation_tracker_controller as qtc
from app.models.user_model import User, UserRole

router = APIRouter(prefix="/quotation-tracker", tags=["quotation-tracker"])


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def _require_access(db: Session, user_id: Optional[str]) -> User:
    user = db.query(User).filter(User.user_id == (user_id or "")).first() if user_id else None
    if not user or getattr(user, "is_deleted", False) or user.is_blocked:
        raise HTTPException(status_code=403,
                            detail="You do not have access to the Open Quotation Tracker")
    role = user.role.value if hasattr(user.role, "value") else str(user.role)
    if role != UserRole.MASTER_ADMIN.value and not bool(user.can_access_quotation_tracker):
        raise HTTPException(status_code=403,
                            detail="You do not have access to the Open Quotation Tracker")
    return user


@router.get("/report")
async def get_report(
    date_from: Optional[str] = Query(None, alias="from"),
    date_to: Optional[str] = Query(None, alias="to"),
    user_id: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    """The sheet: one row per branch for the period, plus the grand total.

    from / to are inclusive YYYY-MM-DD dates. Left out, the period is this
    financial year to date (Indian FY, 1 April).

    Runs in a worker thread: it is two grouped aggregates against a remote SQL
    Server, and the event loop must not sit on them.
    """
    _require_access(db, user_id)
    try:
        return await run_in_threadpool(qtc.build_report, db, date_from, date_to)
    except HTTPException:
        raise
    except Exception as e:
        # Say WHAT went wrong. An unhandled exception is turned into a bare 500
        # by Starlette's ServerErrorMiddleware, which sits OUTSIDE the CORS
        # middleware — so that response carries no Access-Control-Allow-Origin,
        # the browser blocks it, and the page can only report "Network Error"
        # with nothing to act on. An HTTPException is handled INSIDE the CORS
        # layer, so the reason actually reaches the page.
        raise HTTPException(status_code=500,
                            detail=f"Could not build the report: {e}") from e


@router.get("/data-status")
async def get_data_status(
    user_id: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    """Row count, last upload and date span of each source file — so a figure
    that looks wrong can be checked against what was actually loaded."""
    _require_access(db, user_id)
    try:
        return await run_in_threadpool(qtc.data_status, db)
    except HTTPException:
        raise
    except Exception as e:
        # Same reason as above: a bare 500 reaches the browser without CORS
        # headers and reads as a network failure.
        raise HTTPException(status_code=500,
                            detail=f"Could not read the upload status: {e}") from e
