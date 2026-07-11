"""App-wide time standard: ALL timestamps are stored as NAIVE IST datetimes.

- `now_ist()` replaces `datetime.utcnow()` / `datetime.now()` everywhere a
  timestamp is generated or "today"/cutoff logic runs.
- `to_ist()` normalizes datetimes that arrive timezone-aware (e.g. the
  frontend's `new Date().toISOString()` produces `...Z` = UTC) to naive IST.
- A global before_flush hook in `app.database` applies `to_ist()` to every
  ORM-bound datetime, so no controller has to remember to convert.
"""
from datetime import datetime, timezone, timedelta

IST = timezone(timedelta(hours=5, minutes=30))


def now_ist() -> datetime:
    """Current India wall-clock time as a naive datetime (storage standard)."""
    return datetime.now(IST).replace(tzinfo=None)


def to_ist(dt):
    """Normalize a datetime to naive IST.

    Aware datetimes (any timezone, e.g. UTC from the frontend) are converted
    to IST and made naive; naive datetimes are assumed to already be IST and
    returned unchanged. None passes through.
    """
    if dt is None:
        return None
    if getattr(dt, "tzinfo", None) is not None:
        return dt.astimezone(IST).replace(tzinfo=None)
    return dt
