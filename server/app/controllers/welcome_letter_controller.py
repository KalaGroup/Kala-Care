"""Welcome Letter module.

Flow: every 'Open SR Load Report' import calls sync_from_open_sr() — each
UNIQUE instance_id whose SR Sub-Type is 'CC' (Commissioning) is upserted into
welcome_letter_entries. The page lists those customers (email joined live from
the customers table, KVA/branch/commissioning joined from asset_detailed),
previews the master letter text with the master attachment library — the
sender ticks which of those files to attach — and sends the letter by email to
the address on the customers table.
"""

import os
import re
import smtplib
import threading
import time
import traceback
from datetime import datetime
from email.mime.application import MIMEApplication
from email.mime.image import MIMEImage
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from app import mail_utils
from pathlib import Path

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models.customer_model import AssetDetailed, Customer, OpenSRLoadReport
from app.models.user_model import User, UserBranchAccess, UserRole
from app.models.welcome_letter_model import (
    WelcomeLetterAttachment, WelcomeLetterEntry, WelcomeLetterMaster,
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
    q = _scope(db.query(WelcomeLetterEntry), WelcomeLetterEntry.branch_id, allowed)
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
    all_entries = _scope(
        db.query(WelcomeLetterEntry.letter_status, WelcomeLetterEntry.branch_id),
        WelcomeLetterEntry.branch_id, allowed).all()
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
    }


def pending_count(db: Session, allowed=None) -> int:
    """Welcome letters still waiting to be sent, within the user's branches —
    drives the sidebar badge."""
    return _scope(
        db.query(WelcomeLetterEntry.id).filter(WelcomeLetterEntry.letter_status == "PENDING"),
        WelcomeLetterEntry.branch_id, allowed).count()


# ================= LETTER PREVIEW / SEND ================= #

def _master_row(db: Session) -> WelcomeLetterMaster:
    row = db.query(WelcomeLetterMaster).order_by(WelcomeLetterMaster.id).first()
    if not row:
        row = WelcomeLetterMaster(letter_text=DEFAULT_LETTER_TEXT)
        db.add(row)
        db.commit()
        db.refresh(row)
    return row


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
        # The sender picks which of these actually go out with this letter.
        # id + name only: selecting the model would drag every file blob along
        "default_attachments": [
            {"id": a.id, "file_name": a.file_name, "file_size": a.file_size}
            for a in db.query(WelcomeLetterAttachment.id, WelcomeLetterAttachment.file_name,
                              WelcomeLetterAttachment.file_size)
            .order_by(WelcomeLetterAttachment.id).all()
        ],
    }


# ---- letterhead bands (client/public) embedded as inline CID images ----
LETTER_BANDS = {"header": "letter-header-band.png", "footer": "letter-footer-band.png"}
_BAND_CACHE = {}


def _band_bytes(which: str):
    """PNG bytes of the letterhead header/footer band, cached after first read.
    Looked up in the client's public folder (and dist, for a built deploy)."""
    if which in _BAND_CACHE:
        return _BAND_CACHE[which]
    from app.config import BASE_DIR

    name = LETTER_BANDS[which]
    for folder in (BASE_DIR.parent / "client" / "public",
                   BASE_DIR.parent / "client" / "dist",
                   BASE_DIR / "assets"):
        path = folder / name
        try:
            if path.exists():
                _BAND_CACHE[which] = path.read_bytes()
                return _BAND_CACHE[which]
        except OSError:
            continue
    print(f"[welcome-letter] letterhead band {name} not found — sending without it")
    _BAND_CACHE[which] = None
    return None


_BULLET_RE = re.compile(r"^[•●\-\*]\s+")

_P_STYLE = "font-size:13.5px;line-height:1.6;color:#1f2937;margin:0 0 9px"
_UL_STYLE = ("font-size:13.5px;line-height:1.55;color:#1f2937;"
             "margin:0 0 9px;padding-left:22px")


def _render_letter_body(letter_text: str) -> str:
    """Master letter text → email-safe HTML.

    Lines starting with a bullet character become a real <ul> (even when they
    follow an intro sentence in the same paragraph), **text** becomes bold, and
    a short standalone line ending in '!' is the welcome heading.
    """
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


def _letter_html(letter_text: str, entry: WelcomeLetterEntry, asset, ref_no: str,
                 branch_name: str) -> str:
    """Full letterhead email: header band, letter body, footer band. Table-based
    and inline-styled so Outlook renders it the same as Gmail."""
    has_header = _band_bytes("header") is not None
    has_footer = _band_bytes("footer") is not None
    header_row = (
        '<tr><td style="padding:0"><img src="cid:wlheader" width="660" alt="KALA Care · Kirloskar care"'
        ' style="display:block;width:100%;max-width:660px;height:auto;border:0"></td></tr>'
    ) if has_header else ""
    footer_row = (
        '<tr><td style="padding:0"><img src="cid:wlfooter" width="660" alt="KALA Care Global LLP"'
        ' style="display:block;width:100%;max-width:660px;height:auto;border:0"></td></tr>'
    ) if has_footer else ""

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
          <td class="wl-pad" style="padding:2px 38px 0">
            <div class="wl-meta" style="text-align:left;font-size:13px;line-height:1.55;color:#1f2937">
              Ref No: {ref_no}<br>
              Date: {now_ist().strftime('%d-%m-%Y')}
            </div>
          </td>
        </tr>
        <tr>
          <td class="wl-pad wl-ink" style="padding:2px 38px 2px;color:#1f2937">
            {_render_letter_body(letter_text)}
          </td>
        </tr>
        {footer_row}
      </table>
    </td></tr>
  </table>
</body>
</html>"""


def _send_email_async(to_email, subject, html, attachments, cc_emails=None):
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
            # mixed → [ related → (html + letterhead images) , file attachments ]
            # The letterhead bands MUST live in the 'related' part, otherwise
            # cid: references do not resolve and mail clients show broken images.
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
            related.attach(MIMEText(html, "html", "utf-8"))
            for cid, which in (("wlheader", "header"), ("wlfooter", "footer")):
                band = _band_bytes(which)
                if not band:
                    continue
                img = MIMEImage(band, _subtype="png")
                img.add_header("Content-ID", f"<{cid}>")
                img.add_header("Content-Disposition", "inline",
                               filename=LETTER_BANDS[which])
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

    assets = _asset_map(db, [entry.instance_id])
    asset = assets.get(entry.instance_id)
    branch_names = _branch_names(db)
    br_id = entry.branch_id or (asset.branch_id if asset is not None else None)
    ref_no = _ref_no(entry)

    # Attachment bytes come from the database (no files on disk). This is the
    # one place blobs are actually needed, so they are fetched only here — and
    # only for the files the sender ticked on the preview.
    picked = _picked_attachment_ids(attachment_ids)
    att_q = db.query(WelcomeLetterAttachment.file_name, WelcomeLetterAttachment.file_data)
    if picked is not None:
        if not picked:
            att_q = att_q.filter(False)          # sender ticked nothing
        else:
            att_q = att_q.filter(WelcomeLetterAttachment.id.in_(picked))
    attachments = [
        (name, data) for name, data in
        att_q.order_by(WelcomeLetterAttachment.id).all() if data
    ]

    html = _letter_html(_master_row(db).letter_text or DEFAULT_LETTER_TEXT,
                        entry, asset, ref_no, branch_names.get(br_id, br_id) or "-")
    _send_email_async(email, "Welcome to the KALA Care Family — Kala Care Global LLP",
                      html, attachments, cc_emails=cc_list)

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


# ================= REPORT ================= #

def report(db: Session, branch=None, user=None, allowed=None):
    # branch accepts a comma-separated list of branch_ids (multi-select filter),
    # itself capped by the branches this user may see.
    branch_ids = [b for b in (branch or "").split(",") if b.strip()]
    if allowed is not None:
        branch_ids = [b for b in branch_ids if b in allowed]
    q = _scope(db.query(WelcomeLetterEntry).filter(WelcomeLetterEntry.letter_status == "SENT"),
               WelcomeLetterEntry.branch_id, allowed)
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
    bq = _scope(db.query(WelcomeLetterEntry.branch_id, WelcomeLetterEntry.letter_status),
                WelcomeLetterEntry.branch_id, allowed).all()
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

def get_master(db: Session):
    return {
        "success": True,
        "letter_text": _master_row(db).letter_text or DEFAULT_LETTER_TEXT,
        "default_attachments": [
            {"id": a.id, "file_name": a.file_name, "file_size": a.file_size,
             "created_at": _fmt_dt(a.created_at)}
            for a in db.query(
                WelcomeLetterAttachment.id, WelcomeLetterAttachment.file_name,
                WelcomeLetterAttachment.file_size, WelcomeLetterAttachment.created_at,
            ).order_by(WelcomeLetterAttachment.id).all()
        ],
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
            file_size=len(data), uploaded_by=user_id,
        )
        db.add(att)
        db.flush()
        added.append({"id": att.id, "file_name": att.file_name, "file_size": att.file_size})
    db.commit()
    return {"success": True, "added": added, "count": len(added),
            "message": f"{len(added)} attachment(s) added"}


def delete_default_attachment(db: Session, att_id: int):
    att = db.query(WelcomeLetterAttachment).filter(WelcomeLetterAttachment.id == att_id).first()
    if not att:
        raise HTTPException(status_code=404, detail="Attachment not found")
    db.delete(att)
    db.commit()
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


def attachment_file(db: Session, item_id: int):
    """(bytes, file_name, content_type) of a stored attachment — read straight
    from the database."""
    import mimetypes

    row = db.query(WelcomeLetterAttachment).filter(
        WelcomeLetterAttachment.id == item_id).first()
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
    return data, row.file_name, ctype
