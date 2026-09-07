"""Welcome Letter module.

Flow: every 'Open SR Load Report' import calls sync_from_open_sr() — each
UNIQUE instance_id whose SR Sub-Type is 'CC' (Commissioning) is upserted into
welcome_letter_entries. The page lists those customers (email joined live from
the customers table, KVA/branch/commissioning joined from asset_detailed),
previews the master letter text with the master attachment library — the
sender ticks which of those files to attach — and sends the letter by email to
the address on the customers table.

A PENDING entry is retired once it goes stale — commissioning date older than
3 months, or no 'CC' row left for that instance in the Open SR data. See
_eligible(). A SENT letter is never retired. Nothing is ever deleted.
"""

import calendar
import hashlib
import os
import re
import smtplib
import threading
import time
import traceback
import uuid
from datetime import datetime
from email.mime.application import MIMEApplication
from email.mime.image import MIMEImage
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from app import letter_html, mail_utils
from pathlib import Path

from fastapi import HTTPException
from sqlalchemy import and_, func, or_, select
from sqlalchemy.orm import Session

from app.models.customer_model import AssetDetailed, Customer, OpenSRLoadReport
from app.models.user_model import User, UserBranchAccess, UserRole
from app.models.welcome_letter_model import (
    WelcomeLetterAttachment, WelcomeLetterEntry, WelcomeLetterMaster,
    WelcomeLetterModelRule,
)
from app.time_utils import now_ist

BRAND = "#2f3192"

DEFAULT_LETTER_TEXT = """Dear Valued Customer,

Thank You and Welcome!

Thank you for choosing Kirloskar Oil Engines Ltd. as your trusted partner for your power generation needs.

We warmly welcome you on behalf of Kala Care Global LLP, the Authorized Kirloskar Care Centre for Spare Parts, Services, Kirloskar Engines, Kirloskar Generators, and Allied Products.

Our dedicated team is committed to providing you with prompt and reliable support throughout the life of your genset. We are always available to guide you with:
•  Installation support
•  Customized service schedule as per your requirement
•  Preventive maintenance services and Annual Maintenance Contracts (AMC)
•  Service on demand
•  Genuine spare parts, consumables, K-Oil, K-Coolant
•  Technical support and troubleshooting for warranty and post warranty services

Should you have any questions or require assistance at any time, please do not hesitate to contact us.

To ensure optimum performance, maximum reliability, and extended service life of your generator, we recommend following the operating and maintenance guidelines provided in the Kirloskar Operation & Maintenance Manual, that is sent to your registered email ID. Adhering to the prescribed maintenance schedule also helps maintain warranty compliance.

The enclosed maintenance chart provides a quick reference to the recommended service intervals, preventive maintenance activities, and parts replacement schedule based on the running hours of your generator. We encourage you to keep this chart readily accessible for easy reference.

Thank you once again for your trust and confidence in Kirloskar and Kala Care Global LLP. We value your business and look forward to serving you for many years to come while building a lasting relationship founded on quality, reliability, and exceptional customer service.

Warm regards,
Team Kala Care Global LLP"""


# ================= IMPORT SYNC ================= #

def sync_from_open_sr(db: Session) -> int:
    """Upsert welcome_letter_entries from open_sr_load_reports rows whose
    SR Sub-Type is 'CC'. One row per unique instance_id (latest SR wins for
    the snapshot fields). Existing rows keep their letter/sent state; rows are
    never deleted here. Returns the number of new entries added."""
    cc_rows = (
        db.query(OpenSRLoadReport)
        .filter(OpenSRLoadReport.sr_sub_type == "CC",
                OpenSRLoadReport.instance_id.isnot(None),
                OpenSRLoadReport.instance_id != "")
        .order_by(OpenSRLoadReport.sr_created_date.desc())
        .all()
    )
    if not cc_rows:
        return 0

    # first row per instance_id = latest sr_created_date (NULLs come last)
    by_iid = {}
    for r in cc_rows:
        if r.instance_id not in by_iid:
            by_iid[r.instance_id] = r

    iids = list(by_iid.keys())
    existing = {
        e.instance_id: e
        for e in db.query(WelcomeLetterEntry)
        .filter(WelcomeLetterEntry.instance_id.in_(iids)).all()
    }
    cust_branch = {
        c.instance_id: c.branch_id
        for c in db.query(Customer.instance_id, Customer.branch_id)
        .filter(Customer.instance_id.in_(iids)).all()
    }

    added = 0
    for iid, sr in by_iid.items():
        data = {
            "service_request_no": sr.service_request_no,
            "sr_created_date": sr.sr_created_date,
            "sr_status": sr.status,
            "installation_site_address": sr.installation_site_address,
            "account": sr.account,
            "engine_app_code": sr.engine_app_code,
            "engine_serial_no": sr.engine_serial_no,
            "segment": sr.segment,
            "engine_series": sr.engine_series,
            "engine_model": sr.engine_model,
            "sr_type": sr.sr_type,
            "sr_sub_type": sr.sr_sub_type,
            "customer_mobile_no": sr.customer_mobile_no or sr.primary_phone_no,
            "branch_id": cust_branch.get(iid) or sr.branch_id,
        }
        entry = existing.get(iid)
        if entry:
            for k, v in data.items():
                # keep known values — a re-import must not blank out fields
                if v is not None and v != "":
                    setattr(entry, k, v)
        else:
            db.add(WelcomeLetterEntry(instance_id=iid, **data))
            added += 1
    db.commit()
    return added


# ================= BRANCH SCOPE ================= #

def allowed_branches(db: Session, user: User):
    """Branch codes this user may see. None = every branch (Master Admin).
    A Branch Admin sees their primary branch plus every branch granted in
    user_branch_access."""
    role = user.role.value if hasattr(user.role, "value") else str(user.role)
    if role == UserRole.MASTER_ADMIN.value:
        return None
    codes = {user.branch} if user.branch else set()
    codes.update(
        b for (b,) in db.query(UserBranchAccess.branch)
        .filter(UserBranchAccess.user_id == user.user_id).all() if b
    )
    return sorted(codes)


def _scope(query, column, allowed):
    """Restrict a query to the user's branches (no-op for Master Admin)."""
    if allowed is None:
        return query
    if not allowed:
        return query.filter(False)          # branch admin with no branch at all
    return query.filter(column.in_(allowed))


def _in_scope(branch_id, allowed) -> bool:
    return allowed is None or branch_id in allowed


# ================= HIDDEN SEGMENTS ================= #

# Segments that never appear on the Welcome Letter page. The rows stay in the
# database — sync_from_open_sr() keeps upserting them and a letter already sent
# keeps its record — they are simply never listed, counted or reported on.
HIDDEN_SEGMENTS = ("IND",)


def _visible(query):
    """Drop the hidden segments from any welcome_letter_entries query. Compared
    trimmed + upper-cased so ' ind ' is hidden as surely as 'IND'; a blank or
    NULL segment is always visible."""
    seg = func.upper(func.ltrim(func.rtrim(
        func.coalesce(WelcomeLetterEntry.segment, ""))))
    return query.filter(~seg.in_([s.upper() for s in HIDDEN_SEGMENTS]))


# ================= ELIGIBILITY (pending letters only) ================= #

# A welcome letter greets a NEW commissioning, so a PENDING one goes stale.
# Two rules retire it, both evaluated live against the source files:
#
#   1. AGE — the commissioning date on the Asset Detailed Report is older than
#      3 months. An instance with no asset row, or an asset row with no
#      commissioning date, is kept and shown as it is: nothing proves it is old.
#   2. NO LONGER CC — not one 'CC' row is left for that instance in the Open SR
#      data. Open SR rows are keyed (instance_id, service_request_no), so a
#      re-upload that re-types the commissioning SR (to 'A Check', say) updates
#      that very row and the reason the entry exists disappears with it. A
#      genset that keeps its CC row and merely picks up new PM / breakdown SRs
#      is untouched.
#
# A SENT letter is exempt from both — it is history, and the Reports tab must
# keep showing it however old the genset gets.
#
# Nothing is deleted. Exactly like HIDDEN_SEGMENTS, the row stays in
# welcome_letter_entries and is simply never listed, counted or reported, so a
# corrected Asset Detailed / Open SR file brings the customer straight back.

WELCOME_LETTER_MAX_AGE_MONTHS = 3


def _age_cutoff():
    """Start of the 3-month window — a commissioning date before this is stale.
    Counted in CALENDAR months (4 Sep -> 4 Jun), clamped to the last day of a
    short month (31 May -> 28/29 Feb). Recomputed per call: it moves daily."""
    now = now_ist()
    year, month = now.year, now.month - WELCOME_LETTER_MAX_AGE_MONTHS
    while month <= 0:
        month += 12
        year -= 1
    return datetime(year, month, min(now.day, calendar.monthrange(year, month)[1]))


def _eligible(query):
    """Drop stale PENDING entries from any welcome_letter_entries query.

    Applied everywhere the page counts or lists pending work — the table, the
    tab counts, the sidebar badge and the report's branch summary — so no two
    of them can disagree about what is still outstanding."""
    # asset_detailed is upserted one row per instance_id, so MAX() here is just
    # "that row's date" — the same value _asset_map() shows in the column.
    commissioned = (
        select(func.max(AssetDetailed.commissioning_date))
        .where(AssetDetailed.instance_id == WelcomeLetterEntry.instance_id)
        .correlate(WelcomeLetterEntry)
        .scalar_subquery()
    )
    still_cc = (
        select(1)
        .where(OpenSRLoadReport.instance_id == WelcomeLetterEntry.instance_id,
               OpenSRLoadReport.sr_sub_type == "CC")
        .correlate(WelcomeLetterEntry)
        .exists()
    )
    return query.filter(or_(
        WelcomeLetterEntry.letter_status == "SENT",
        and_(or_(commissioned.is_(None), commissioned >= _age_cutoff()), still_cc),
    ))


# ================= LIST ================= #

def _asset_map(db: Session, iids):
    """First asset_detailed row per instance_id → (kva, branch_id, branch_name,
    commissioning_date). Also used for the branch dropdown names."""
    out = {}
    if not iids:
        return out
    for i in range(0, len(iids), 1000):
        chunk = iids[i:i + 1000]
        rows = (
            db.query(AssetDetailed.instance_id, AssetDetailed.kva_rating,
                     AssetDetailed.branch_id, AssetDetailed.branch_name,
                     AssetDetailed.commissioning_date)
            .filter(AssetDetailed.instance_id.in_(chunk)).all()
        )
        for r in rows:
            if r.instance_id not in out:
                out[r.instance_id] = r
    return out


# Branch names barely ever change but the asset_detailed DISTINCT scan is
# expensive, so the map is cached process-wide for a couple of minutes.
_BRANCH_NAMES_CACHE = {"at": 0.0, "data": None}
_BRANCH_NAMES_TTL = 300.0


def _branch_names(db: Session, force: bool = False):
    """branch_id → short branch name, from the users table (canonical names
    like 'Belagavi'), topped up from asset_detailed for branches with no user."""
    cache = _BRANCH_NAMES_CACHE
    now = time.monotonic()
    if not force and cache["data"] is not None and now - cache["at"] < _BRANCH_NAMES_TTL:
        return cache["data"]

    names = {}
    for br, brn in db.query(User.branch, User.branch_name).distinct().all():
        if br and brn and br not in names:
            names[br] = brn
    for br, brn in (db.query(AssetDetailed.branch_id, AssetDetailed.branch_name)
                    .filter(AssetDetailed.branch_id.isnot(None)).distinct().all()):
        if br and br not in names:
            names[br] = (brn or "").replace("KALA Care Global LLP - ", "") or br

    cache["data"], cache["at"] = names, now
    return names


def _fmt_dt(dt):
    return dt.strftime("%Y-%m-%d %H:%M") if dt else None


def _fmt_d(dt):
    return dt.strftime("%Y-%m-%d") if dt else None


def _ref_no(entry: WelcomeLetterEntry) -> str:
    return f"WL/{entry.branch_id or 'HO'}/{entry.service_request_no or entry.instance_id}"


def _entry_dict(entry, asset, email, branch_names):
    br_id = entry.branch_id or (asset.branch_id if asset is not None else None)
    return {
        "id": entry.id,
        "instance_id": entry.instance_id,
        "service_request_no": entry.service_request_no,
        "sr_created_date": _fmt_dt(entry.sr_created_date),
        "sr_status": entry.sr_status,
        "installation_site_address": entry.installation_site_address,
        "account": entry.account,
        "engine_app_code": entry.engine_app_code,
        "engine_serial_no": entry.engine_serial_no,
        "segment": entry.segment,
        "engine_series": entry.engine_series,
        "engine_model": entry.engine_model,
        "sr_type": entry.sr_type,
        "sr_sub_type": entry.sr_sub_type,
        "customer_mobile_no": entry.customer_mobile_no,
        "email": email,
        "branch_id": br_id,
        "branch_name": branch_names.get(br_id, br_id),
        "kva_rating": asset.kva_rating if asset is not None else None,
        "commissioning_date": _fmt_d(asset.commissioning_date) if asset is not None else None,
        "letter_status": entry.letter_status,
        "ref_no": entry.ref_no,
        "sent_by": entry.sent_by,
        "sent_by_name": entry.sent_by_name,
        "sent_to_email": entry.sent_to_email,
        "sent_at": _fmt_dt(entry.sent_at),
        "attachments_sent": entry.attachments_sent,
    }


def list_entries(db: Session, branch=None, status=None, search=None, allowed=None):
    q = _eligible(_visible(_scope(
        db.query(WelcomeLetterEntry), WelcomeLetterEntry.branch_id, allowed)))
    if branch:
        q = q.filter(WelcomeLetterEntry.branch_id == branch)
    if status:
        q = q.filter(WelcomeLetterEntry.letter_status == status)
    # SQL Server sorts NULLs last on DESC by default (no NULLS LAST syntax)
    entries = q.order_by(WelcomeLetterEntry.sr_created_date.desc(),
                         WelcomeLetterEntry.id.desc()).all()

    iids = [e.instance_id for e in entries]
    assets = _asset_map(db, iids)
    emails = {}
    for i in range(0, len(iids), 1000):
        chunk = iids[i:i + 1000]
        for c in db.query(Customer.instance_id, Customer.email).filter(
                Customer.instance_id.in_(chunk)).all():
            emails[c.instance_id] = c.email
    branch_names = _branch_names(db)

    items = [_entry_dict(e, assets.get(e.instance_id), emails.get(e.instance_id),
                         branch_names) for e in entries]

    if search:
        s = search.strip().lower()
        items = [
            it for it in items
            if any(s in str(it.get(f) or "").lower() for f in (
                "account", "instance_id", "service_request_no", "engine_model",
                "engine_serial_no", "engine_app_code", "customer_mobile_no", "email"))
        ]

    # Counts + the branch dropdown cover only the branches this user may see.
    all_entries = _eligible(_visible(_scope(
        db.query(WelcomeLetterEntry.letter_status, WelcomeLetterEntry.branch_id),
        WelcomeLetterEntry.branch_id, allowed))).all()
    branches = sorted(
        ({"branch_id": bid, "branch_name": branch_names.get(bid, bid)}
         for bid in {b for _, b in all_entries if b}),
        key=lambda x: str(x["branch_name"]))
    return {
        "items": items,
        "total": len(all_entries),
        "pending": sum(1 for s, _ in all_entries if s == "PENDING"),
        "sent": sum(1 for s, _ in all_entries if s == "SENT"),
        "branches": branches,
        # The live 3-month cutoff, so the page can state the real date instead
        # of recomputing it in the browser and drifting from the server.
        "stale_before": _fmt_d(_age_cutoff()),
        "max_age_months": WELCOME_LETTER_MAX_AGE_MONTHS,
    }


def pending_count(db: Session, allowed=None) -> int:
    """Welcome letters still waiting to be sent, within the user's branches —
    drives the sidebar badge."""
    return _eligible(_visible(_scope(
        db.query(WelcomeLetterEntry.id).filter(WelcomeLetterEntry.letter_status == "PENDING"),
        WelcomeLetterEntry.branch_id, allowed))).count()


# ================= LETTER PREVIEW / SEND ================= #

def _master_row(db: Session) -> WelcomeLetterMaster:
    row = db.query(WelcomeLetterMaster).order_by(WelcomeLetterMaster.id).first()
    if not row:
        row = WelcomeLetterMaster(letter_text=DEFAULT_LETTER_TEXT)
        db.add(row)
        db.commit()
        db.refresh(row)
    return row


# ================= AUTOMATIC ATTACHMENTS ================= #

KIND_DEFAULT = "DEFAULT"
KIND_MODEL = "MODEL"


def _is_default(kind) -> bool:
    """Rows uploaded before the DEFAULT/MODEL split have kind NULL and were all
    defaults, so NULL reads as DEFAULT everywhere."""
    return (kind or KIND_DEFAULT) == KIND_DEFAULT


def _norm_model(value) -> str:
    """Engine models are matched case- and space-insensitively — the Open SR
    file is not consistent about either."""
    return " ".join(str(value or "").split()).upper()


def _model_rule_map(db: Session):
    """normalised engine model -> attachment_id."""
    return {
        _norm_model(m): aid
        for m, aid in db.query(WelcomeLetterModelRule.engine_model,
                               WelcomeLetterModelRule.attachment_id).all()
        if _norm_model(m)
    }


def auto_attachments(db: Session, entry: WelcomeLetterEntry):
    """Exactly the files this letter goes out with, in the order the customer
    sees them: every DEFAULT attachment first, then the one mapped to this
    customer's engine model (if any).

    Nothing here is chosen by the sender — the preview shows this list read
    only. id/name/size only: selecting the model would drag the blobs along.
    """
    rows = (db.query(WelcomeLetterAttachment.id, WelcomeLetterAttachment.file_name,
                     WelcomeLetterAttachment.file_size, WelcomeLetterAttachment.kind)
            .order_by(WelcomeLetterAttachment.id).all())
    by_id = {r.id: r for r in rows}

    out = [{"id": r.id, "file_name": r.file_name, "file_size": r.file_size,
            "source": "default"} for r in rows if _is_default(r.kind)]

    model = _norm_model(entry.engine_model)
    att_id = _model_rule_map(db).get(model) if model else None
    row = by_id.get(att_id) if att_id else None
    if row is not None and not any(a["id"] == row.id for a in out):
        out.append({"id": row.id, "file_name": row.file_name,
                    "file_size": row.file_size, "source": "model",
                    "engine_model": entry.engine_model})
    return out


def model_attachment_for(db: Session, engine_model: str, with_content: bool = False):
    """The file mapped to one engine model in the shared master, or found=False.

    This is how a DRIVE letter reaches the same mapping the welcome letter uses:
    a letter format with use_model_attachments on calls this for the customer's
    engine model and attaches whatever comes back. `with_content` returns the
    bytes base64-encoded, because the drive letter carries its attachments
    inline rather than by id.
    """
    key = _norm_model(engine_model)
    if not key:
        return {"success": True, "found": False}
    att_id = _model_rule_map(db).get(key)
    if not att_id:
        return {"success": True, "found": False}

    row = (db.query(WelcomeLetterAttachment.id, WelcomeLetterAttachment.file_name,
                    WelcomeLetterAttachment.file_size,
                    WelcomeLetterAttachment.content_type)
           .filter(WelcomeLetterAttachment.id == att_id).first())
    if not row:
        return {"success": True, "found": False}

    out = {"success": True, "found": True, "id": row.id, "file_name": row.file_name,
           "file_size": row.file_size, "content_type": row.content_type,
           "engine_model": str(engine_model).strip()}
    if with_content:
        import base64
        # goes through the hot cache, so the second letter on the same model is free
        data, name, ctype, _etag = attachment_file(db, att_id)
        out["file_name"] = name
        out["content_type"] = ctype
        out["file_size"] = len(data)
        out["content"] = base64.b64encode(data).decode("ascii")
    return out


def letter_payload(db: Session, entry_id: int, allowed=None):
    entry = db.query(WelcomeLetterEntry).filter(WelcomeLetterEntry.id == entry_id).first()
    if not entry:
        raise HTTPException(status_code=404, detail="Welcome letter record not found")
    if not _in_scope(entry.branch_id, allowed):
        raise HTTPException(status_code=403, detail="This customer belongs to another branch")

    assets = _asset_map(db, [entry.instance_id])
    asset = assets.get(entry.instance_id)
    # Only the email is needed — never select the whole customer row
    email = db.query(Customer.email).filter(
        Customer.instance_id == entry.instance_id).scalar()
    branch_names = _branch_names(db)

    return {
        "success": True,
        "entry": _entry_dict(entry, asset, email, branch_names),
        "letter_text": _master_row(db).letter_text or DEFAULT_LETTER_TEXT,
        "ref_no": entry.ref_no or _ref_no(entry),
        # False = the letterhead PNGs are missing on the server, so the emailed
        # letter would go out with no logo. The preview warns instead.
        "letterhead_ok": letterhead_ok(),
        # Everything this letter will carry, worked out by the server: the
        # master defaults plus the file mapped to this customer's engine model.
        # The preview shows it read only — the sender no longer curates it.
        "attachments": auto_attachments(db, entry),
    }


# ---- letterhead bands embedded as inline CID images ----
LETTER_BANDS = {"header": "letter-header-band.png", "footer": "letter-footer-band.png"}
LETTER_WIDTH = 660          # px the sheet renders at, in the mail and on screen
_BAND_CACHE = {}
_BAND_PATHS = {}            # which -> the file the band was actually read from


def _band_dirs():
    """Every folder the letterhead bands could realistically live in.

    server/assets holds the EMAIL copies (1320px wide instead of the 2480px
    print originals) so it is searched first. The rest are fallbacks: a source
    checkout keeps the bands under client/public, a built deploy under
    client/dist, and a packaged backend.exe has a __file__ that points into a
    PyInstaller temp folder — so the executable's own folder and its parents
    are searched too. Getting this wrong is why a letter goes out with no
    letterhead at all.
    """
    import sys

    from app.config import BASE_DIR

    roots, seen = [], []
    exe_dir = Path(sys.executable).resolve().parent
    meipass = getattr(sys, "_MEIPASS", None)     # PyInstaller's unpack folder
    bases = [BASE_DIR, BASE_DIR.parent, exe_dir, *list(exe_dir.parents)[:3], Path.cwd()]
    if meipass:
        bases.insert(0, Path(meipass))
    for base in bases:
        for folder in (base / "assets", base / "client" / "public",
                       base / "client" / "dist", base):
            key = str(folder).lower()
            if key not in seen:
                seen.append(key)
                roots.append(folder)
    return roots


def _band_bytes(which: str):
    """PNG bytes of the letterhead header/footer band, cached after first read."""
    if which in _BAND_CACHE:
        return _BAND_CACHE[which]
    name = LETTER_BANDS[which]
    for folder in _band_dirs():
        path = folder / name
        try:
            if path.is_file():
                _BAND_CACHE[which] = path.read_bytes()
                _BAND_PATHS[which] = str(path)
                print(f"[welcome-letter] letterhead {which} band: {path} "
                      f"({len(_BAND_CACHE[which]) // 1024} KB)")
                return _BAND_CACHE[which]
        except OSError:
            continue
    print(f"[welcome-letter] letterhead band {name} NOT FOUND — letters will go out "
          f"WITHOUT the logo. Searched: "
          + " | ".join(str(d) for d in _band_dirs()[:8]))
    _BAND_CACHE[which] = None
    return None


def _png_size(data):
    """(width, height) read straight out of a PNG's IHDR chunk — no imaging
    library needed. Outlook sizes an inline image from the <img> width/height
    ATTRIBUTES (it ignores the CSS), so the letter has to know them."""
    if not data or len(data) < 24 or data[:8] != b"\x89PNG\r\n\x1a\n":
        return None
    return int.from_bytes(data[16:20], "big"), int.from_bytes(data[20:24], "big")


def _band_cids():
    """A fresh Content-ID per message. Outlook is known to leave a cid: image
    unresolved when the id is a bare word reused across mails, so each band gets
    a unique RFC-shaped addr-spec id instead."""
    token = uuid.uuid4().hex
    return {which: f"wl{which}.{token}@kalacare" for which in LETTER_BANDS}


def _band_row(which: str, cid: str, alt: str) -> str:
    """The <tr> holding one letterhead band, or '' when the file is missing."""
    data = _band_bytes(which)
    if not data:
        return ""
    size = _png_size(data)
    h_attr = f' height="{round(size[1] * LETTER_WIDTH / size[0])}"' if size else ""
    # font-size/line-height 0 on the cell kills the stray gap Outlook leaves
    # under an image; height:auto lets responsive clients override the attribute
    return (
        f'<tr><td style="padding:0;font-size:0;line-height:0">'
        f'<img src="cid:{cid}" width="{LETTER_WIDTH}"{h_attr} alt="{alt}" border="0" '
        f'style="display:block;width:100%;max-width:{LETTER_WIDTH}px;height:auto;'
        f'border:0;outline:none;text-decoration:none">'
        f'</td></tr>'
    )


def letterhead_ok() -> bool:
    """Whether the server can actually find both bands — surfaced on the preview
    so a missing file is noticed before letters go out without the logo."""
    return _band_bytes("header") is not None and _band_bytes("footer") is not None


_BULLET_RE = re.compile(r"^[•●\-\*]\s+")

# The letter is justified (business-letter typography). A line that ends in a
# forced <br> — "Warm regards," — counts as a last line and is left alone, in
# browsers and in Word/Outlook alike.
_P_STYLE = ("font-size:13.5px;line-height:1.6;color:#1f2937;margin:0 0 9px;"
            "text-align:justify;text-justify:inter-word")
_UL_STYLE = ("font-size:13.5px;line-height:1.55;color:#1f2937;"
             "margin:0 0 9px;padding-left:22px;text-align:justify;"
             "text-justify:inter-word")


def _render_letter_body(letter_text: str) -> str:
    """Master letter text → email-safe HTML.

    Lines starting with a bullet character become a real <ul> (even when they
    follow an intro sentence in the same paragraph), **text** becomes bold, and
    a short standalone line ending in '!' is the welcome heading.

    Since the Master Setup box became a WYSIWYG editor the text is normally
    HTML, and goes through letter_html instead — which re-sanitises it (the
    database is not a trust boundary) and stamps the letter's inline styles on
    every tag. The marker rules below still serve every master text saved
    before that.
    """
    if letter_html.looks_like_html(letter_text):
        return letter_html.render_html(letter_text)

    def inline(s: str) -> str:
        return re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", s)

    out, para, items = [], [], []

    def flush_para():
        if para:
            out.append(f"<p style='{_P_STYLE}'>" + "<br>".join(para) + "</p>")
            para.clear()

    def flush_items():
        if items:
            lis = "".join(f"<li style='margin:0 0 6px'>{x}</li>" for x in items)
            out.append(f"<ul style='{_UL_STYLE}'>{lis}</ul>")
            items.clear()

    for block in re.split(r"\n{2,}", (letter_text or "").strip()):
        lines = [ln.strip() for ln in block.split("\n") if ln.strip()]
        if not lines:
            continue
        for ln in lines:
            if _BULLET_RE.match(ln):
                flush_para()
                items.append(inline(_BULLET_RE.sub("", ln)))
            elif len(lines) == 1 and ln.endswith("!") and len(ln) < 60:
                flush_items()
                out.append(f"<p class='wl-head' style='font-size:15px;font-weight:bold;"
                           f"color:{BRAND};margin:0 0 8px'>{inline(ln)}</p>")
            else:
                flush_items()
                para.append(inline(ln))
        flush_para()
        flush_items()
    # the last block's bottom margin would double the gap above the footer band
    if out:
        out[-1] = re.sub(r"margin:0 0 \d+px", "margin:0", out[-1], count=1)
    return "".join(out)


def _letter_html(letter_text: str, ref_no: str, cids: dict) -> str:
    """Full letterhead email: header band, letter body, footer band. Table-based
    and inline-styled so Outlook renders it the same as Gmail."""
    header_row = _band_row("header", cids["header"], "KALA Care · Kirloskar care")
    footer_row = _band_row("footer", cids["footer"], "KALA Care Global LLP")

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<!-- The letter is stationery: it must stay on white paper in every client,
     including Gmail / Outlook / Apple Mail dark mode. -->
<meta name="color-scheme" content="light only">
<meta name="supported-color-schemes" content="light only">
<title>Welcome Letter</title>
<style>
  :root {{ color-scheme: light only; supported-color-schemes: light only; }}
  body {{ margin:0; padding:0; width:100% !important; background:#f3f4f6; }}
  img {{ border:0; outline:none; text-decoration:none; -ms-interpolation-mode:bicubic; }}
  table {{ border-collapse:collapse !important; }}

  /* Keep the paper white and the ink dark when the client flips to dark mode.
     [data-ogsc]/[data-ogsb] are Outlook.com's dark-mode rewrites. */
  @media (prefers-color-scheme: dark) {{
    .wl-page   {{ background:#f3f4f6 !important; }}
    .wl-sheet  {{ background:#ffffff !important; }}
    .wl-ink, .wl-ink p, .wl-ink li, .wl-ink ul {{ color:#1f2937 !important; }}
    .wl-head   {{ color:{BRAND} !important; }}
    .wl-meta   {{ color:#1f2937 !important; }}
  }}
  [data-ogsc] .wl-page  {{ background:#f3f4f6 !important; }}
  [data-ogsb] .wl-sheet, [data-ogsc] .wl-sheet {{ background:#ffffff !important; }}
  [data-ogsc] .wl-ink, [data-ogsc] .wl-ink p,
  [data-ogsc] .wl-ink li, [data-ogsc] .wl-ink ul {{ color:#1f2937 !important; }}
  [data-ogsc] .wl-head {{ color:{BRAND} !important; }}
  [data-ogsc] .wl-meta {{ color:#1f2937 !important; }}

  /* Phones: full-bleed sheet with tighter side padding */
  @media only screen and (max-width:620px) {{
    .wl-shell {{ width:100% !important; max-width:100% !important; }}
    .wl-pad   {{ padding-left:20px !important; padding-right:20px !important; }}
    .wl-gutter{{ padding-left:0 !important; padding-right:0 !important; }}
    .wl-ink p, .wl-ink li, .wl-ink ul {{ font-size:14px !important; line-height:1.65 !important; }}
    .wl-head  {{ font-size:16px !important; }}
  }}
</style>
</head>
<body class="wl-page" bgcolor="#f3f4f6"
      style="margin:0;padding:0;background:#f3f4f6;-webkit-text-size-adjust:100%">
  <table role="presentation" class="wl-page" width="100%" cellpadding="0" cellspacing="0" border="0"
         bgcolor="#f3f4f6" style="background:#f3f4f6;width:100%">
    <tr><td class="wl-gutter" align="center" style="padding:14px 8px">
      <table role="presentation" class="wl-shell wl-sheet" width="660" cellpadding="0" cellspacing="0"
             border="0" bgcolor="#ffffff"
             style="width:660px;max-width:660px;background:#ffffff;
                    font-family:Segoe UI,Arial,Helvetica,sans-serif">
        {header_row}
        <tr>
          <td class="wl-pad" style="padding:2px 48px 0">
            <div class="wl-meta" style="text-align:left;font-size:13px;line-height:1.55;color:#1f2937">
              Ref No: {ref_no}<br>
              Date: {now_ist().strftime('%d-%m-%Y')}
            </div>
          </td>
        </tr>
        <tr>
          <td class="wl-pad wl-ink" style="padding:2px 48px 2px;color:#1f2937;text-align:justify">
            {_render_letter_body(letter_text)}
          </td>
        </tr>
        {footer_row}
      </table>
    </td></tr>
  </table>
</body>
</html>"""


def _plain_text(letter_text: str, ref_no: str) -> str:
    """The text/plain half of the mail. A multipart/alternative with a real text
    part is what keeps a letter out of the spam folder, and it is what a client
    that refuses HTML shows instead of a blank message."""
    if letter_html.looks_like_html(letter_text):
        body = letter_html.render_text(letter_text)
    else:
        body = re.sub(r"\*\*(.+?)\*\*", r"\1", (letter_text or "").strip())
        body = "\n".join(_BULLET_RE.sub("- ", ln) for ln in body.split("\n"))
    return (f"Ref No: {ref_no}\n"
            f"Date: {now_ist().strftime('%d-%m-%Y')}\n\n{body}\n")


def _send_email_async(to_email, subject, html, text, attachments, cids, cc_emails=None):
    """attachments: list of (file_name, bytes) read from the DB. Fire-and-forget."""
    def _run():
        try:
            smtp_server = os.getenv("SMTP_SERVER")
            smtp_port = int(os.getenv("SMTP_PORT", 587))
            smtp_username = os.getenv("SMTP_USERNAME")
            smtp_password = mail_utils.smtp_password("SMTP_PASSWORD")
            from_email = os.getenv("FROM_EMAIL", smtp_username)
            if not (smtp_server and smtp_username and smtp_password and to_email):
                print("[welcome-letter] SMTP not configured or no recipient — email skipped")
                return
            # mixed → [ related → [ alternative → (text, html) , letterhead
            # images ] , file attachments ]. The letterhead bands MUST live in
            # the 'related' part next to the HTML that references them, or the
            # cid: links do not resolve and Outlook / Gmail show no logo.
            msg = MIMEMultipart("mixed")
            msg["Subject"] = subject
            # Without a display name the inbox shows the address' local part
            # ("kalacares"); FROM_NAME is what the customer actually sees.
            msg["From"] = mail_utils.from_header(from_email)
            msg["To"] = to_email
            msg["Reply-To"] = mail_utils.reply_to(from_email)
            if cc_emails:
                msg["Cc"] = ", ".join(cc_emails)

            related = MIMEMultipart("related")
            alternative = MIMEMultipart("alternative")
            alternative.attach(MIMEText(text or "", "plain", "utf-8"))
            alternative.attach(MIMEText(html, "html", "utf-8"))
            related.attach(alternative)
            for which, cid in cids.items():
                band = _band_bytes(which)
                if not band:
                    continue
                img = MIMEImage(band, _subtype="png")
                img.add_header("Content-ID", f"<{cid}>")
                # inline, and NOT given a filename: a named part is what makes
                # Gmail list the letterhead as a downloadable attachment
                # instead of drawing it in the letter.
                img.add_header("Content-Disposition", "inline")
                related.attach(img)
            msg.attach(related)

            for name, data in attachments:
                try:
                    part = MIMEApplication(data, Name=name)
                    part["Content-Disposition"] = f'attachment; filename="{name}"'
                    msg.attach(part)
                except Exception as e:
                    print(f"[welcome-letter] attachment {name} skipped: {e}")
            all_recipients = [to_email] + (cc_emails or [])
            with smtplib.SMTP(smtp_server, smtp_port) as server:
                server.starttls()
                server.login(smtp_username, smtp_password)
                server.send_message(msg, to_addrs=all_recipients)
            print(f"[welcome-letter] sent -> {to_email} (cc: {', '.join(cc_emails) if cc_emails else '-'})")
        except Exception:
            print("[welcome-letter] email send failed:")
            traceback.print_exc()
    threading.Thread(target=_run, daemon=True).start()


def _picked_attachment_ids(raw):
    """'3,7,9' → [3, 7, 9]. None means the client sent no selection at all, in
    which case every master attachment goes out (previous behaviour)."""
    if raw is None:
        return None
    ids = []
    for part in re.split(r"[,\s]+", str(raw)):
        part = part.strip()
        if part.isdigit():
            ids.append(int(part))
    return ids


def send_letter(db: Session, entry_id: int, user_id: str, override_email: str = None,
                cc_emails: str = None, attachment_ids: str = None, allowed=None):
    entry = db.query(WelcomeLetterEntry).filter(WelcomeLetterEntry.id == entry_id).first()
    if not entry:
        raise HTTPException(status_code=404, detail="Welcome letter record not found")
    if not _in_scope(entry.branch_id, allowed):
        raise HTTPException(status_code=403, detail="This customer belongs to another branch")
    if entry.letter_status == "SENT":
        raise HTTPException(status_code=400, detail="Welcome letter already sent for this customer")

    # Recipient email comes from the customers table by default; a
    # manually-typed/edited email overrides it and is saved back onto the
    # customer record for next time.
    cust = db.query(Customer).filter(Customer.instance_id == entry.instance_id).first()
    email = (cust.email or "").strip() if cust else ""
    if override_email and override_email.strip():
        email = override_email.strip()
        if cust and email:
            cust.email = email
    if not email:
        raise HTTPException(status_code=400,
                            detail="No email ID on the customer record — update the customer first")

    # Any number of CC addresses, however the client separated them. Blanks,
    # duplicates and the To-address itself are dropped so nobody gets two copies.
    cc_list, _cc_seen = [], {email.lower()}
    for _e in re.split(r"[,;\s]+", cc_emails or ""):
        _e = _e.strip()
        if not _e or "@" not in _e or _e.lower() in _cc_seen:
            continue
        _cc_seen.add(_e.lower())
        cc_list.append(_e)

    user = db.query(User).filter(User.user_id == user_id).first() if user_id else None

    ref_no = _ref_no(entry)

    # Attachment bytes come from the database (no files on disk). This is the
    # one place blobs are actually needed, so they are fetched only here — and
    # only for the files the sender ticked on the preview.
    # What goes out is decided HERE, not by the client: every DEFAULT master
    # attachment plus the one mapped to this customer's engine model. The
    # `attachments` query parameter is accepted and ignored so an old cached
    # frontend cannot send a letter with the wrong files.
    attachments = []
    for a in auto_attachments(db, entry):
        try:
            data, name, _ctype, _etag = attachment_file(db, a["id"])
        except HTTPException:
            continue                    # deleted from Master Setup meanwhile
        attachments.append((name, data))

    letter_text = _master_row(db).letter_text or DEFAULT_LETTER_TEXT
    cids = _band_cids()
    html = _letter_html(letter_text, ref_no, cids)
    _send_email_async(email, "Welcome to the KALA Care Family — Kala Care Global LLP",
                      html, _plain_text(letter_text, ref_no), attachments, cids,
                      cc_emails=cc_list)

    entry.letter_status = "SENT"
    entry.ref_no = ref_no
    entry.sent_by = user_id
    entry.sent_by_name = user.name if user else user_id
    entry.sent_to_email = email
    entry.sent_at = now_ist()
    entry.attachments_sent = len(attachments)
    db.commit()

    return {"success": True, "message": f"Welcome letter sent to {email}",
            "ref_no": ref_no, "sent_at": _fmt_dt(entry.sent_at),
            "sent_by_name": entry.sent_by_name}


_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def save_customer_email(db: Session, entry_id: int, email: str, allowed=None):
    """Write an address typed in the preview's To box straight onto the customer
    record. The sender is usually filling in an email the customers table never
    had, and that is worth keeping whether or not the letter goes out — sending
    saves it too, but only if the send actually happens."""
    entry = db.query(WelcomeLetterEntry).filter(WelcomeLetterEntry.id == entry_id).first()
    if not entry:
        raise HTTPException(status_code=404, detail="Welcome letter record not found")
    if not _in_scope(entry.branch_id, allowed):
        raise HTTPException(status_code=403, detail="This customer belongs to another branch")

    email = (email or "").strip()
    if not _EMAIL_RE.match(email):
        raise HTTPException(status_code=400, detail="Enter a valid email address")

    cust = db.query(Customer).filter(Customer.instance_id == entry.instance_id).first()
    if not cust:
        raise HTTPException(
            status_code=404,
            detail=f"No customer record for Instance ID {entry.instance_id} — "
                   f"the address cannot be saved, but the letter can still be sent")
    previous = (cust.email or "").strip()
    if previous.lower() == email.lower():
        return {"success": True, "email": email, "changed": False,
                "message": "Already the customer's email"}
    cust.email = email
    db.commit()
    return {
        "success": True, "email": email, "changed": True, "previous": previous or None,
        "message": ("Email added to the customer record" if not previous
                    else "Customer email updated"),
    }


# ================= REPORT ================= #

def report(db: Session, branch=None, user=None, allowed=None):
    # branch accepts a comma-separated list of branch_ids (multi-select filter),
    # itself capped by the branches this user may see.
    branch_ids = [b for b in (branch or "").split(",") if b.strip()]
    if allowed is not None:
        branch_ids = [b for b in branch_ids if b in allowed]
    q = _visible(_scope(
        db.query(WelcomeLetterEntry).filter(WelcomeLetterEntry.letter_status == "SENT"),
        WelcomeLetterEntry.branch_id, allowed))
    if branch_ids:
        q = q.filter(WelcomeLetterEntry.branch_id.in_(branch_ids))
    if user:
        q = q.filter(WelcomeLetterEntry.sent_by == user)
    sent = q.order_by(WelcomeLetterEntry.sent_at.desc()).all()

    branch_names = _branch_names(db)
    iids = [e.instance_id for e in sent]
    assets = _asset_map(db, iids)

    # Fallback for letters sent before the per-letter attachment pick existed
    att_count = db.query(WelcomeLetterAttachment.id).count()
    sender_branch = {
        uid: bn for uid, bn in db.query(User.user_id, User.branch_name).all()
    }

    sent_items = []
    user_agg = {}
    for e in sent:
        asset = assets.get(e.instance_id)
        sent_items.append({
            "id": e.id,
            "ref_no": e.ref_no,
            "sent_at": _fmt_dt(e.sent_at),
            "sent_by": e.sent_by,
            "sent_by_name": e.sent_by_name,
            "account": e.account,
            "instance_id": e.instance_id,
            "branch_id": e.branch_id,
            "branch_name": branch_names.get(e.branch_id, e.branch_id),
            "kva_rating": asset.kva_rating if asset is not None else None,
            "attachments": e.attachments_sent if e.attachments_sent is not None else att_count,
            "sent_to_email": e.sent_to_email,
        })
        key = e.sent_by_name or e.sent_by or "-"
        agg = user_agg.setdefault(key, {"user": key, "count": 0, "last_sent": None,
                                        "branch_name": None})
        agg["count"] += 1
        if e.sent_at and (agg["last_sent"] is None or _fmt_dt(e.sent_at) > agg["last_sent"]):
            agg["last_sent"] = _fmt_dt(e.sent_at)
        if agg["branch_name"] is None and e.sent_by:
            agg["branch_name"] = sender_branch.get(e.sent_by)

    # branch-wise summary over ALL entries (respects branch filter + user scope)
    bq = _eligible(_visible(_scope(
        db.query(WelcomeLetterEntry.branch_id, WelcomeLetterEntry.letter_status),
        WelcomeLetterEntry.branch_id, allowed))).all()
    br_agg = {}
    for bid, st in bq:
        if not bid or (branch_ids and bid not in branch_ids):
            continue
        a = br_agg.setdefault(bid, {"branch_id": bid,
                                    "branch_name": branch_names.get(bid, bid),
                                    "total": 0, "sent": 0})
        a["total"] += 1
        if st == "SENT":
            a["sent"] += 1
    branch_summary = sorted(br_agg.values(), key=lambda x: str(x["branch_name"]))
    for b in branch_summary:
        b["pending"] = b["total"] - b["sent"]
        b["pct"] = round(b["sent"] / b["total"] * 100) if b["total"] else 0

    # User dropdown — a Branch Admin only sees senders from their own branches
    uq = db.query(User).filter(User.is_deleted == False, User.is_blocked == False)  # noqa: E712
    if allowed is not None:
        scoped_ids = {
            uid for (uid,) in db.query(UserBranchAccess.user_id)
            .filter(UserBranchAccess.branch.in_(allowed or [""])).all()
        }
        uq = uq.filter((User.branch.in_(allowed or [""])) | (User.user_id.in_(scoped_ids or [""])))
    users = [
        {"user_id": u.user_id, "name": u.name, "branch": u.branch, "branch_name": u.branch_name}
        for u in uq.order_by(User.name).all()
    ]
    return {
        "success": True,
        "sent": sent_items,
        "user_wise": sorted(user_agg.values(), key=lambda x: -x["count"]),
        "branch_wise": branch_summary,
        "users": users,
    }


# ================= MASTER SETUP ================= #

# The asset_detailed DISTINCT is a full scan of a big table on a REMOTE SQL
# Server, and the mapping dropdown is rebuilt on every /master call. Engine
# models barely change, so the list is cached process-wide for a few minutes —
# same treatment as _branch_names().
_ENGINE_MODELS_CACHE = {"at": 0.0, "data": None}
_ENGINE_MODELS_TTL = 300.0


def _all_engine_models(db: Session, force: bool = False):
    """Every engine model worth offering in the mapping dropdown:

      * the models on welcome letter customers (hidden segments excluded, so
        the list matches the page), plus
      * every DISTINCT model in the Asset Detailed file — the master is shared
        with drive letters, whose customers may never have had a CC service
        request and so never reach welcome_letter_entries.

    Compared through _norm_model(), so the same model spelled with different
    case or spacing in the two files is offered once.
    """
    cache = _ENGINE_MODELS_CACHE
    now = time.monotonic()
    if not force and cache["data"] is not None and now - cache["at"] < _ENGINE_MODELS_TTL:
        return cache["data"]

    seen, out = set(), []

    def add(value):
        key = _norm_model(value)
        if key and key not in seen:
            seen.add(key)
            out.append(str(value).strip())

    for (m,) in _visible(
        db.query(WelcomeLetterEntry.engine_model)
        .filter(WelcomeLetterEntry.engine_model.isnot(None),
                WelcomeLetterEntry.engine_model != "")
    ).distinct().all():
        add(m)

    for (m,) in (db.query(AssetDetailed.engine_model)
                 .filter(AssetDetailed.engine_model.isnot(None),
                         AssetDetailed.engine_model != "")
                 .distinct().all()):
        add(m)

    out.sort(key=str.upper)
    cache["data"], cache["at"] = out, now
    return out


_MODEL_INFO_CACHE = {"at": 0.0, "data": None}


def _clean_kva(value) -> str:
    """KVA ratings arrive as '125', '125.0', '125 KVA', … — shown as the bare
    number when the string is numeric, otherwise as typed."""
    s = " ".join(str(value or "").split())
    if not s:
        return ""
    m = re.match(r"^(\d+(?:\.\d+)?)(?:\s*KVA)?$", s, re.IGNORECASE)
    if not m:
        return s
    num = float(m.group(1))
    return str(int(num)) if num == int(num) else m.group(1)


def _kva_sort_key(v):
    try:
        return (0, float(v), "")
    except (TypeError, ValueError):
        return (1, 0.0, str(v).upper())


def _model_info(db: Session, force: bool = False):
    """normalised engine model -> the distinct KVA ratings and emission norms
    its assets carry, read from the Asset Detailed file — the one import that
    has an EMISSION NORM column. Printed under each model in the mapping
    dropdown and matched by its KVA / emission-norm filters; a model the asset
    file has never seen simply shows neither. One model can legitimately carry
    several KVAs / norms (one row per asset), so both are lists."""
    cache = _MODEL_INFO_CACHE
    now = time.monotonic()
    if not force and cache["data"] is not None and now - cache["at"] < _ENGINE_MODELS_TTL:
        return cache["data"]

    raw = {}
    for model, kva, norm in (
        db.query(AssetDetailed.engine_model, AssetDetailed.kva_rating,
                 AssetDetailed.emission_norm)
        .filter(AssetDetailed.engine_model.isnot(None),
                AssetDetailed.engine_model != "")
        .distinct().all()
    ):
        key = _norm_model(model)
        if not key:
            continue
        slot = raw.setdefault(key, {"kvas": {}, "norms": {}})
        kva = _clean_kva(kva)
        if kva:
            slot["kvas"].setdefault(kva.upper(), kva)
        norm = " ".join(str(norm or "").split())
        if norm:
            slot["norms"].setdefault(norm.upper(), norm)

    data = {
        key: {"kvas": sorted(slot["kvas"].values(), key=_kva_sort_key),
              "norms": sorted(slot["norms"].values(), key=str.upper)}
        for key, slot in raw.items()
    }
    cache["data"], cache["at"] = data, now
    return data


def _model_rule_rows(db: Session):
    """Every mapping, grouped under the attachment it points at."""
    atts = {
        a.id: a for a in db.query(
            WelcomeLetterAttachment.id, WelcomeLetterAttachment.file_name,
            WelcomeLetterAttachment.file_size, WelcomeLetterAttachment.created_at,
            WelcomeLetterAttachment.kind,
        ).all()
    }
    grouped = {}
    for r in (db.query(WelcomeLetterModelRule)
              .order_by(WelcomeLetterModelRule.engine_model).all()):
        att = atts.get(r.attachment_id)
        if att is None:
            continue                    # the file was deleted — rule is dead
        g = grouped.setdefault(r.attachment_id, {
            "attachment_id": att.id, "file_name": att.file_name,
            "file_size": att.file_size, "created_at": _fmt_dt(att.created_at),
            "engine_models": [],
        })
        g["engine_models"].append({"id": r.id, "engine_model": r.engine_model})
    return sorted(grouped.values(), key=lambda g: str(g["file_name"]).upper())


def get_master(db: Session):
    rows = db.query(
        WelcomeLetterAttachment.id, WelcomeLetterAttachment.file_name,
        WelcomeLetterAttachment.file_size, WelcomeLetterAttachment.created_at,
        WelcomeLetterAttachment.kind,
    ).order_by(WelcomeLetterAttachment.id).all()
    model_rules = _model_rule_rows(db)
    # A model already mapped is not offered again — that is what stops one
    # engine model being pointed at two different charts.
    taken = {_norm_model(m["engine_model"])
             for g in model_rules for m in g["engine_models"]}
    available = [m for m in _all_engine_models(db) if _norm_model(m) not in taken]
    info = _model_info(db)
    no_info = {"kvas": [], "norms": []}
    return {
        "success": True,
        "letter_text": _master_row(db).letter_text or DEFAULT_LETTER_TEXT,
        # every letter gets these
        "default_attachments": [
            {"id": a.id, "file_name": a.file_name, "file_size": a.file_size,
             "created_at": _fmt_dt(a.created_at)}
            for a in rows if _is_default(a.kind)
        ],
        # engine model -> attachment
        "model_attachments": model_rules,
        "available_models": available,
        # the same models with the KVA / emission norm the Asset Detailed file
        # knows for each — what the dropdown prints under a model and what its
        # filters match on. A separate key so an older client build that still
        # reads plain strings keeps working.
        "available_model_info": [
            {"model": m, **info.get(_norm_model(m), no_info)} for m in available
        ],
        "assigned_model_count": len(taken),
    }


def save_letter_text(db: Session, text: str, user_id):
    row = _master_row(db)
    row.letter_text = text
    row.updated_by = user_id
    db.commit()
    return {"success": True, "message": "Letter text saved"}


def _safe_name(name: str) -> str:
    return re.sub(r"[^A-Za-z0-9._ ()\-–]", "_", name or "file")


MAX_ATTACHMENT_MB = 20


def _read_upload(upload_file):
    """Read an UploadFile fully into memory — attachments are stored in the
    database, never written to disk."""
    data = upload_file.file.read()
    if not data:
        raise HTTPException(status_code=400,
                            detail=f"{upload_file.filename or 'File'} is empty")
    if len(data) > MAX_ATTACHMENT_MB * 1024 * 1024:
        raise HTTPException(
            status_code=400,
            detail=f"{upload_file.filename} is larger than {MAX_ATTACHMENT_MB} MB")
    return data


def add_default_attachments(db: Session, upload_files, user_id):
    """Add one or more files to the master attachment library in a single
    call. The sender ticks which of them go out with each letter."""
    files = [f for f in (upload_files or []) if f is not None and f.filename]
    if not files:
        raise HTTPException(status_code=400, detail="Choose at least one file to upload")
    added = []
    for f in files:
        data = _read_upload(f)
        att = WelcomeLetterAttachment(
            file_name=_safe_name(f.filename), file_data=data,
            content_type=f.content_type or "application/octet-stream",
            file_size=len(data), uploaded_by=user_id, kind=KIND_DEFAULT,
        )
        db.add(att)
        db.flush()
        added.append({"id": att.id, "file_name": att.file_name, "file_size": att.file_size})
    db.commit()
    return {"success": True, "added": added, "count": len(added),
            "message": f"{len(added)} attachment(s) added"}


def rename_attachment(db: Session, att_id: int, new_name: str):
    """Rename a master attachment. The bytes are untouched — only the name the
    customer sees on the mail changes."""
    att = db.query(WelcomeLetterAttachment).filter(
        WelcomeLetterAttachment.id == att_id).first()
    if not att:
        raise HTTPException(status_code=404, detail="Attachment not found")
    name = _safe_name((new_name or "").strip())
    if not name or name in (".", "_", "file"):
        raise HTTPException(status_code=400, detail="Enter a file name")
    # The recipient's mail client picks the app to open a file from its
    # extension, so a rename must never drop or change it.
    old_ext = os.path.splitext(att.file_name or "")[1]
    if old_ext and not name.lower().endswith(old_ext.lower()):
        name = os.path.splitext(name)[0] + old_ext
    att.file_name = name
    db.commit()
    _cache_drop(att_id)          # the name is baked into the cached ETag
    return {"success": True, "id": att.id, "file_name": name,
            "message": "File name updated"}


def _split_models(raw):
    """'4R1040TA, 6R1080TA' or a JSON-ish list from the client -> clean list."""
    if raw is None:
        return []
    if isinstance(raw, (list, tuple)):
        parts = raw
    else:
        parts = str(raw).split(",")
    out, seen = [], set()
    for p in parts:
        p = " ".join(str(p or "").split())
        key = _norm_model(p)
        if not key or key in seen:
            continue
        seen.add(key)
        out.append(p)
    return out


def _reject_taken(db: Session, models, ignore_rule_ids=()):
    """A model may belong to ONE mapping only — that is the whole point of the
    dropdown dropping it once used."""
    taken = {
        _norm_model(m): m
        for (m, rid) in db.query(WelcomeLetterModelRule.engine_model,
                                 WelcomeLetterModelRule.id).all()
        if rid not in ignore_rule_ids
    }
    clash = [m for m in models if _norm_model(m) in taken]
    if clash:
        raise HTTPException(
            status_code=400,
            detail=f"Already mapped to another attachment: {', '.join(clash[:5])}")


def add_model_attachment(db: Session, upload_file, engine_models, user_id):
    """Upload ONE file and map the chosen engine models to it. Customers on
    those models get this file on top of the default attachments."""
    models = _split_models(engine_models)
    if not models:
        raise HTTPException(status_code=400, detail="Choose at least one engine model")
    if upload_file is None or not upload_file.filename:
        raise HTTPException(status_code=400, detail="Choose a file to upload")
    _reject_taken(db, models)

    data = _read_upload(upload_file)
    att = WelcomeLetterAttachment(
        file_name=_safe_name(upload_file.filename), file_data=data,
        content_type=upload_file.content_type or "application/octet-stream",
        file_size=len(data), uploaded_by=user_id, kind=KIND_MODEL,
    )
    db.add(att)
    db.flush()
    for m in models:
        db.add(WelcomeLetterModelRule(engine_model=m, attachment_id=att.id,
                                      created_by=user_id))
    db.commit()
    return {"success": True, "attachment_id": att.id, "file_name": att.file_name,
            "engine_models": models,
            "message": f"{att.file_name} mapped to {len(models)} engine model(s)"}


def add_models_to_attachment(db: Session, att_id: int, engine_models, user_id):
    """Point more engine models at an attachment that is already mapped."""
    att = db.query(WelcomeLetterAttachment).filter(
        WelcomeLetterAttachment.id == att_id).first()
    if not att:
        raise HTTPException(status_code=404, detail="Attachment not found")
    models = _split_models(engine_models)
    if not models:
        raise HTTPException(status_code=400, detail="Choose at least one engine model")
    _reject_taken(db, models)
    for m in models:
        db.add(WelcomeLetterModelRule(engine_model=m, attachment_id=att_id,
                                      created_by=user_id))
    db.commit()
    return {"success": True, "engine_models": models,
            "message": f"{len(models)} engine model(s) added to {att.file_name}"}


def delete_model_rule(db: Session, rule_id: int):
    """Unmap ONE engine model. The file stays — other models may still use it —
    unless that was its last mapping, in which case it is nothing but dead
    weight and goes too."""
    rule = db.query(WelcomeLetterModelRule).filter(
        WelcomeLetterModelRule.id == rule_id).first()
    if not rule:
        raise HTTPException(status_code=404, detail="Mapping not found")
    att_id = rule.attachment_id
    db.delete(rule)
    db.flush()
    left = db.query(WelcomeLetterModelRule).filter(
        WelcomeLetterModelRule.attachment_id == att_id).count()
    if left == 0:
        att = db.query(WelcomeLetterAttachment).filter(
            WelcomeLetterAttachment.id == att_id,
            WelcomeLetterAttachment.kind == KIND_MODEL).first()
        if att:
            db.delete(att)
            _cache_drop(att_id)
    db.commit()
    return {"success": True, "attachment_removed": left == 0,
            "message": f"{rule.engine_model} unmapped"}


def delete_model_attachment(db: Session, att_id: int):
    """Delete a model-wise attachment and every engine model mapped to it."""
    att = db.query(WelcomeLetterAttachment).filter(
        WelcomeLetterAttachment.id == att_id).first()
    if not att:
        raise HTTPException(status_code=404, detail="Attachment not found")
    db.query(WelcomeLetterModelRule).filter(
        WelcomeLetterModelRule.attachment_id == att_id).delete(
        synchronize_session=False)
    db.delete(att)
    db.commit()
    _cache_drop(att_id)
    return {"success": True}


def delete_default_attachment(db: Session, att_id: int):
    att = db.query(WelcomeLetterAttachment).filter(WelcomeLetterAttachment.id == att_id).first()
    if not att:
        raise HTTPException(status_code=404, detail="Attachment not found")
    db.query(WelcomeLetterModelRule).filter(
        WelcomeLetterModelRule.attachment_id == att_id).delete(
        synchronize_session=False)
    db.delete(att)
    db.commit()
    _cache_drop(att_id)
    return {"success": True}


def migrate_files_to_db(db: Session) -> int:
    """One-time: pull any attachment still living on disk (legacy stored_path)
    into the database, then remove the uploads/welcome_letter folder. Runs on
    every startup and is a no-op once nothing has a stored_path."""
    import shutil
    from app.config import UPLOAD_DIR

    moved = 0
    rows = (db.query(WelcomeLetterAttachment)
            .filter(WelcomeLetterAttachment.stored_path.isnot(None)).all())
    for row in rows:
        if row.file_data:
            row.stored_path = None
            continue
        path = UPLOAD_DIR / row.stored_path
        try:
            if path.exists():
                data = path.read_bytes()
                row.file_data = data
                row.file_size = len(data)
                row.content_type = row.content_type or "application/octet-stream"
                moved += 1
        except OSError as e:
            print(f"[welcome-letter] could not read {path}: {e}")
            continue
        row.stored_path = None
    if moved:
        db.commit()
        print(f"[welcome-letter] moved {moved} attachment(s) from disk into the database")
    elif db.dirty:
        db.commit()

    # Nothing references disk anymore — drop the folder for good.
    legacy_dir = UPLOAD_DIR / "welcome_letter"
    if legacy_dir.exists():
        still_on_disk = (db.query(WelcomeLetterAttachment)
                         .filter(WelcomeLetterAttachment.stored_path.isnot(None)).count())
        if still_on_disk == 0:
            try:
                shutil.rmtree(legacy_dir)
                print("[welcome-letter] removed the legacy uploads/welcome_letter folder")
            except OSError as e:
                print(f"[welcome-letter] could not remove {legacy_dir}: {e}")
    return moved


# ---- hot attachment cache ----
# The same handful of master files is opened over and over, by every sender, and
# each one is a multi-megabyte VARBINARY on a REMOTE SQL Server — a ~5 second
# round trip. Their bytes never change in place (a file is added, renamed or
# deleted, never rewritten), so they are safe to keep in memory; the cache is
# dropped explicitly on rename and delete.
_FILE_CACHE = {}                                  # id -> (data, name, ctype, etag)
_FILE_CACHE_LRU = []                              # ids, least recently used first
_FILE_CACHE_MAX_BYTES = 32 * 1024 * 1024
_FILE_CACHE_LOCK = threading.Lock()


def _cache_get(item_id):
    with _FILE_CACHE_LOCK:
        hit = _FILE_CACHE.get(item_id)
        if hit is not None:
            _FILE_CACHE_LRU.remove(item_id)
            _FILE_CACHE_LRU.append(item_id)
        return hit


def _cache_put(item_id, value):
    with _FILE_CACHE_LOCK:
        if item_id in _FILE_CACHE:
            _FILE_CACHE_LRU.remove(item_id)
        _FILE_CACHE[item_id] = value
        _FILE_CACHE_LRU.append(item_id)
        total = sum(len(v[0]) for v in _FILE_CACHE.values())
        while total > _FILE_CACHE_MAX_BYTES and len(_FILE_CACHE_LRU) > 1:
            total -= len(_FILE_CACHE.pop(_FILE_CACHE_LRU.pop(0))[0])


def _cache_drop(item_id=None):
    """Forget one attachment (renamed / deleted), or the lot."""
    with _FILE_CACHE_LOCK:
        if item_id is None:
            _FILE_CACHE.clear()
            _FILE_CACHE_LRU.clear()
        elif item_id in _FILE_CACHE:
            _FILE_CACHE.pop(item_id)
            _FILE_CACHE_LRU.remove(item_id)


def _attachment_etag(item_id, file_name, size) -> str:
    return '"wl%s"' % hashlib.md5(
        f"{item_id}|{file_name}|{size}".encode("utf-8")).hexdigest()[:20]


def attachment_etag(db: Session, item_id: int):
    """The ETag of a stored attachment WITHOUT pulling its bytes — answering a
    conditional GET must not cost the same as serving the file. None when the
    stored size is unknown, in which case the caller just serves the file."""
    hit = _cache_get(item_id)
    if hit is not None:
        return hit[3]
    row = (db.query(WelcomeLetterAttachment.file_name, WelcomeLetterAttachment.file_size)
           .filter(WelcomeLetterAttachment.id == item_id).first())
    if not row:
        raise HTTPException(status_code=404, detail="File not found")
    return _attachment_etag(item_id, row.file_name, row.file_size) if row.file_size else None


def attachment_file(db: Session, item_id: int):
    """(bytes, file_name, content_type, etag) of a stored attachment.

    Served from the in-process cache when it is warm. On a miss only the three
    columns that matter are selected — querying the model would make SQLAlchemy
    build an identity-mapped entity around the blob on every single view.
    """
    import mimetypes

    hit = _cache_get(item_id)
    if hit is not None:
        return hit

    row = (db.query(WelcomeLetterAttachment.file_data,
                    WelcomeLetterAttachment.file_name,
                    WelcomeLetterAttachment.content_type)
           .filter(WelcomeLetterAttachment.id == item_id).first())
    if not row:
        raise HTTPException(status_code=404, detail="File not found")
    data = row.file_data
    if not data:
        raise HTTPException(status_code=404, detail="No file stored for this item")
    # A generic octet-stream makes the browser DOWNLOAD the file instead of
    # showing it, so fall back to the type implied by the file name.
    ctype = row.content_type
    if not ctype or ctype == "application/octet-stream":
        ctype = mimetypes.guess_type(row.file_name or "")[0] or "application/octet-stream"
    value = (data, row.file_name, ctype,
             _attachment_etag(item_id, row.file_name, len(data)))
    if len(data) <= _FILE_CACHE_MAX_BYTES:
        _cache_put(item_id, value)
    return value
