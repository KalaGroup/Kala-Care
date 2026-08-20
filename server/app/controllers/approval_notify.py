"""Approval Application notifications & PDF export.

- When a record is FINALLY approved, the creator gets an email with every
  detail, the full approval trail (who acted at each step + remarks, including
  auto-skip notes) and the attached documents.
- The same content is available as a PDF download for approved records
  (reportlab for the body; attachment PDFs merged with pypdf; images embedded
  as extra pages).
"""

import os
import smtplib
import threading
import traceback
from email.mime.application import MIMEApplication
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from html import escape as _esc
from io import BytesIO

from app import mail_utils
from app.controllers.approval_richtext import (
    has_table, html_flowables, inline_table_borders, is_rich_html, sanitize_rich_html,
)

BRAND = "#2f3192"

# Rows whose value is markup (a table pasted from Excel) and must NOT be escaped
# on the way into the mail — they are sanitized instead. Everything else is
# escaped, so a stray '<' in a remark can never break the layout.
HTML_VALUE_LABELS = {"Purpose of Approval"}

CATEGORY_LABELS = {
    "spares": "Spares", "services": "Services", "spares_services": "Spares & Services",
}
TYPE_LABELS = {"discounting": "Discounting", "credit": "Credit", "expense": "Expense",
               "discounting_credit": "Discounting & Credit", "other": "Other"}


def _fmt_amount(v):
    if v in (None, ""):
        return "-"
    try:
        return f"Rs. {float(v):,.2f}"
    except (TypeError, ValueError):
        return str(v)


def _fmt_dt(iso):
    if not iso:
        return "-"
    return str(iso).replace("T", " ")[:16]


def details_rows(app: dict):
    """(label, value) pairs shown in the email and the PDF, per type."""
    is_expense = app.get("request_type") == "expense"
    rows = [
        ("Approval No.", app.get("app_no") or "-"),
        ("Type", TYPE_LABELS.get(app.get("request_type"), app.get("request_type"))),
        ("Category", CATEGORY_LABELS.get(app.get("category"), app.get("category") or "-")),
        ("Branch", f"{app.get('branch') or ''} {('- ' + app['branch_name']) if app.get('branch_name') else ''}".strip()),
        ("Created By", f"{app.get('created_by_name') or app.get('created_by')} - {app.get('created_by')}"),
        ("Created At", _fmt_dt(app.get("created_at"))),
        ("Purpose of Approval", app.get("description") or "-"),
    ]
    if not is_expense:
        rows += [
            ("Customer Name", app.get("customer_name") or "-"),
            ("Instance ID", app.get("instance_id") or "-"),
            ("SR No.", app.get("sr_no") or "-"),
            ("Invoice", app.get("invoice_no") or "-"),
            ("Delivery Challan", app.get("delivery_challan") or "-"),
        ]
    else:
        rows += [
            ("SR Number", app.get("sr_no") or "-"),
            ("Expense Type", app.get("expense_type") or "-"),
            ("Expense Amount", _fmt_amount(app.get("expense_amount"))),
        ]
    rows += [
        ("Quotation Number", app.get("quotation_no") or "-"),
        ("Quotation Amount", _fmt_amount(app.get("quotation_amount"))),
    ]
    if app.get("request_type") in ("discounting", "discounting_credit"):
        rows.append(("Discounting %", f"{app['discount_percent']}%" if app.get("discount_percent") is not None else "-"))
    if app.get("request_type") in ("credit", "discounting_credit"):
        rows.append(("Credit Period", f"{app['credit_days']} days" if app.get("credit_days") is not None else "-"))
    if app.get("remark"):
        rows.append(("Remark", app.get("remark")))
    # Expense settlement block — only the parts that were filled in
    if is_expense:
        if app.get("paid_by_name") or app.get("paid_by_mode"):
            rows.append(("Paid By", " - ".join(
                [p for p in (app.get("paid_by_name"), app.get("paid_by_mode")) if p]) or "-"))
        if app.get("reimburse_to") or app.get("reimburse_mode"):
            rows.append(("Reimburse To", " - ".join(
                [p for p in (app.get("reimburse_to"), app.get("reimburse_mode")) if p]) or "-"))
        if app.get("reimburse_bank_details"):
            rows.append(("Bank Details", app.get("reimburse_bank_details")))
    return rows


def trail_rows(app: dict):
    """Approval flow lines: (step, who, when, remark). ONLY the levels that
    actually took part appear — the creator (with their level), the levels
    that approved, the auto-approve note and a rejection. Skipped levels and
    the levels after the final action are NOT listed."""
    out = []

    creator_lvl = (app.get("created_by_level") or "l1").upper()
    out.append((
        f"Created - {creator_lvl}",
        app.get("created_by_name") or app.get("created_by") or "-",
        _fmt_dt(app.get("created_at")),
        app.get("remark") or "-",
    ))
    if app.get("auto_approved"):
        out.append(("Auto Approved",
                    "Within the creator's own authority limit — no approver action needed",
                    _fmt_dt(app.get("created_at")), "-"))
    for lvl, label in (("l2", "L2 Approval"), ("l3", "L3 Approval"),
                       ("l4", "L4 - HOD Approval"), ("l5", "L5 - COO Approval")):
        by = app.get(f"{lvl}_action_by_name") or app.get(f"{lvl}_action_by")
        if by:
            out.append((label, by, _fmt_dt(app.get(f"{lvl}_action_at")),
                        app.get(f"{lvl}_action_remark") or "-"))
    if app.get("status") == "rejected":
        level = (app.get("rejected_at_level") or "").upper()
        out.append((
            "REJECTED",
            f"{app.get('rejected_by_name') or app.get('rejected_by')}" + (f" - {level}" if level else ""),
            _fmt_dt(app.get("rejected_at")),
            app.get("rejected_remark") or "-",
        ))
    return out


# ---------------- EMAIL ---------------- #

def _cell_value(label, value):
    """Purpose keeps its markup (sanitized); every other value is escaped."""
    if label in HTML_VALUE_LABELS:
        return inline_table_borders(sanitize_rich_html(value)) or "-"
    return _esc(str(value), quote=False)


def _detail_row(label, value):
    """Normal rows are label | value. A purpose pasted from Excel gets the FULL
    width instead (label above, table below) — squeezed into the value column a
    wide sheet would be unreadable. The table scrolls sideways in webmail; in
    Outlook it simply renders at its natural width."""
    lbl_td = ("padding:6px 10px;border:1px solid #e5e7eb;font-weight:bold;"
              "background:#f9fafb;white-space:nowrap")
    val_td = "padding:6px 10px;border:1px solid #e5e7eb"
    if label in HTML_VALUE_LABELS and has_table(value):
        inner = inline_table_borders(sanitize_rich_html(value))
        return (f"<tr><td colspan='2' style='{val_td};background:#f9fafb;font-weight:bold'>{_esc(label)}</td></tr>"
                f"<tr><td colspan='2' style='{val_td}'>"
                f"<div style='overflow-x:auto;max-width:100%'>{inner}</div></td></tr>")
    return (f"<tr><td style='{lbl_td}'>{_esc(label)}</td>"
            f"<td style='{val_td}'>{_cell_value(label, value)}</td></tr>")


def _email_html(app: dict, attachments):
    det = "".join(_detail_row(l, v) for l, v in details_rows(app))
    # Remark gets the widest column — approval remarks can be long text
    trail = "".join(
        f"<tr><td style='padding:6px 10px;border:1px solid #e5e7eb;font-weight:bold;background:#f9fafb;width:18%'>{s}</td>"
        f"<td style='padding:6px 10px;border:1px solid #e5e7eb;width:26%'>{w}</td>"
        f"<td style='padding:6px 10px;border:1px solid #e5e7eb;width:14%;white-space:nowrap'>{t}</td>"
        f"<td style='padding:6px 10px;border:1px solid #e5e7eb;width:42%;word-break:break-word'>{_esc(str(r))}</td></tr>"
        for s, w, t, r in ((_esc(str(a)), _esc(str(b)), _esc(str(c)), d) for a, b, c, d in trail_rows(app))
    )
    files = "".join(f"<li>{_esc(name)}</li>" for name, _, _ in attachments) or "<li>No documents attached</li>"
    rejected = app.get("status") == "rejected"
    head_bg = "#d97706" if rejected else BRAND   # rejected = AMBER (not red)
    outcome = "REJECTED" if rejected else "APPROVED"
    outcome_color = "#d97706" if rejected else "#059669"
    sub_line = (f"{app.get('app_no')} was rejected by "
                f"{app.get('rejected_by_name') or app.get('rejected_by') or '-'}"
                if rejected else f"{app.get('app_no')} has completed all approvals")
    body_line = (f"Your approval application <b>{app.get('app_no')}</b> has been "
                 f"<b style='color:{outcome_color}'>{outcome}</b>."
                 + (f" Reason: <b>{app.get('rejected_remark') or '-'}</b>." if rejected else " Full details below."))
    # Which stage finalized the record and by whom — includes the self /
    # auto-approve case (set by the controller before sending). Rendered as a
    # one-cell table so Outlook shows the tinted box correctly.
    final_note = app.get("final_action_note")
    note_bg = "#fef3c7" if rejected else "#ecfdf5"
    final_line = (
        f"<table role='presentation' width='100%' cellpadding='0' cellspacing='0' border='0'"
        f" style='border-collapse:collapse;width:100%'><tr>"
        f"<td bgcolor='{note_bg}' style='background:{note_bg};color:{outcome_color};"
        f"font-size:13px;font-weight:bold;padding:8px 10px;border-radius:8px'>"
        f"{final_note}</td></tr></table>"
    ) if final_note else ""
    # Table-based layout with everything inline-styled: Outlook desktop (Word
    # rendering engine) ignores max-width/opacity on divs and breaks div
    # layouts, so the whole mail is nested tables — renders the same in
    # Outlook, Gmail and mobile clients (border-radius degrades gracefully).
    return f"""
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
           style="border-collapse:collapse">
      <tr><td align="center" style="padding:8px 0">
        <table role="presentation" width="680" cellpadding="0" cellspacing="0" border="0"
               style="border-collapse:collapse;width:680px;max-width:680px;font-family:Segoe UI,Arial,sans-serif">
          <tr>
            <td bgcolor="{head_bg}" style="background:{head_bg};color:#ffffff;padding:14px 18px;border-radius:10px 10px 0 0">
              <h2 style="margin:0;font-size:17px;color:#ffffff">Approval Application - {outcome}</h2>
              <p style="margin:4px 0 0;font-size:12px;color:#e5e7eb">{sub_line}</p>
            </td>
          </tr>
          <tr>
            <td style="border:1px solid #e5e7eb;border-top:0;padding:16px 18px;border-radius:0 0 10px 10px">
              <p style="font-size:13px;margin:0 0 8px">Dear {app.get('created_by_name') or app.get('created_by')},</p>
              <p style="font-size:13px;margin:0 0 8px">{body_line}</p>
              {final_line}
              <h3 style="font-size:14px;margin:14px 0 6px">Application Details</h3>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
                     style="border-collapse:collapse;font-size:12.5px;width:100%">{det}</table>
              <h3 style="font-size:14px;margin:14px 0 6px">Approval Flow</h3>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
                     style="border-collapse:collapse;font-size:12.5px;width:100%">
                <tr>
                  <th bgcolor="{BRAND}" style='padding:6px 10px;border:1px solid #e5e7eb;background:{BRAND};color:#ffffff;text-align:left'>Step</th>
                  <th bgcolor="{BRAND}" style='padding:6px 10px;border:1px solid #e5e7eb;background:{BRAND};color:#ffffff;text-align:left'>Approved By / Note</th>
                  <th bgcolor="{BRAND}" style='padding:6px 10px;border:1px solid #e5e7eb;background:{BRAND};color:#ffffff;text-align:left'>When</th>
                  <th bgcolor="{BRAND}" style='padding:6px 10px;border:1px solid #e5e7eb;background:{BRAND};color:#ffffff;text-align:left'>Remark</th>
                </tr>
                {trail}
              </table>
              <h3 style="font-size:14px;margin:14px 0 6px">Attached Documents</h3>
              <ul style="font-size:12.5px;margin:4px 0;padding-left:20px">{files}</ul>
              <p style="font-size:11px;color:#6b7280;margin:16px 0 0">This is an automated message from KALA Care - Approval Application.</p>
            </td>
          </tr>
        </table>
      </td></tr>
    </table>
    """


def _submitted_html(app: dict, attachments, pending_label: str, pending_names):
    """The mail that goes out the moment an NFA is SUBMITTED — the creator and
    everyone they put in To / CC learn it was filed and where it is waiting."""
    det = "".join(_detail_row(l, v) for l, v in details_rows(app))
    files = "".join(f"<li>{_esc(name)}</li>" for name, _, _ in attachments) or "<li>No documents attached</li>"
    # No pending level = the record finalized at submit (rights master with no
    # measurable ask), so the box states that instead of naming an approver.
    if pending_label:
        waiting = ", ".join(pending_names) if pending_names else "the next available approver"
        line = f"Now waiting for {_esc(pending_label)} action by: {_esc(waiting)}"
    else:
        line = "This application was approved at submit — no further action is needed."
    note = (f"<table role='presentation' width='100%' cellpadding='0' cellspacing='0' border='0'"
            f" style='border-collapse:collapse;width:100%'><tr>"
            f"<td bgcolor='#eff6ff' style='background:#eff6ff;color:{BRAND};font-size:13px;"
            f"font-weight:bold;padding:8px 10px;border-radius:8px'>{line}</td></tr></table>")
    return f"""
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
           style="border-collapse:collapse">
      <tr><td align="center" style="padding:8px 0">
        <table role="presentation" width="680" cellpadding="0" cellspacing="0" border="0"
               style="border-collapse:collapse;width:680px;max-width:680px;font-family:Segoe UI,Arial,sans-serif">
          <tr>
            <td bgcolor="{BRAND}" style="background:{BRAND};color:#ffffff;padding:14px 18px;border-radius:10px 10px 0 0">
              <h2 style="margin:0;font-size:17px;color:#ffffff">Approval Application - SUBMITTED</h2>
              <p style="margin:4px 0 0;font-size:12px;color:#e5e7eb">
                {_esc(str(app.get('app_no') or ''))} has been created and sent for approval</p>
            </td>
          </tr>
          <tr>
            <td style="border:1px solid #e5e7eb;border-top:0;padding:16px 18px;border-radius:0 0 10px 10px">
              <p style="font-size:13px;margin:0 0 8px">Dear {_esc(str(app.get('created_by_name') or app.get('created_by')))},</p>
              <p style="font-size:13px;margin:0 0 8px">
                Your approval application <b>{_esc(str(app.get('app_no') or ''))}</b> has been
                <b>submitted</b> and has entered the approval flow. You will get another mail
                once it is finally approved or rejected.
              </p>
              {note}
              <h3 style="font-size:14px;margin:14px 0 6px">Application Details</h3>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
                     style="border-collapse:collapse;font-size:12.5px;width:100%">{det}</table>
              <h3 style="font-size:14px;margin:14px 0 6px">Attached Documents</h3>
              <ul style="font-size:12.5px;margin:4px 0;padding-left:20px">{files}</ul>
              <p style="font-size:11px;color:#6b7280;margin:16px 0 0">This is an automated message from KALA Care - Approval Application.</p>
            </td>
          </tr>
        </table>
      </td></tr>
    </table>
    """


def _send_submitted(to_email, app: dict, attachments, cc_emails, pending_label, pending_names):
    smtp_server = os.getenv("SMTP_SERVER")
    smtp_port = int(os.getenv("SMTP_PORT", 587))
    smtp_username = os.getenv("SMTP_USERNAME")
    smtp_password = os.getenv("SMTP_PASSWORD")
    from_email = os.getenv("FROM_EMAIL", smtp_username)
    to_list = [e for e in dict.fromkeys(
        to_email if isinstance(to_email, (list, tuple)) else [to_email]) if e]
    if not (smtp_server and smtp_username and smtp_password and to_list):
        print("[approval-email] SMTP not configured or no recipient — submit mail skipped")
        return
    cc_emails = [e for e in dict.fromkeys(cc_emails or []) if e and e not in to_list]

    msg = MIMEMultipart()
    msg["Subject"] = f"SUBMITTED: {app.get('app_no')} — sent for approval"
    msg["From"] = mail_utils.from_header(from_email)
    msg["Reply-To"] = mail_utils.reply_to(from_email)
    msg["To"] = ", ".join(to_list)
    if cc_emails:
        msg["Cc"] = ", ".join(cc_emails)
    msg.attach(MIMEText(_submitted_html(app, attachments, pending_label, pending_names), "html", "utf-8"))

    for name, _ctype, data in attachments:
        try:
            part = MIMEApplication(data, Name=name)
            part["Content-Disposition"] = f'attachment; filename="{name}"'
            msg.attach(part)
        except Exception as e:
            print(f"[approval-email] attachment {name} skipped: {e}")

    with smtplib.SMTP(smtp_server, smtp_port) as server:
        server.starttls()
        server.login(smtp_username, smtp_password)
        server.send_message(msg)
    print(f"[approval-email] submitted {app.get('app_no')} -> {', '.join(to_list)} (cc: {len(cc_emails)})")


def send_submitted_email_async(to_email, app: dict, attachments, cc_emails=None,
                               pending_label="the next level", pending_names=None):
    """Fire-and-forget: submitting an NFA must never wait on (or fail because
    of) SMTP."""
    def _run():
        try:
            _send_submitted(to_email, app, attachments, cc_emails, pending_label, pending_names or [])
        except Exception:
            print("[approval-email] submit mail failed:")
            traceback.print_exc()
    threading.Thread(target=_run, daemon=True).start()


def _send_email(to_email, app: dict, attachments, cc_emails=None):
    """to_email: one address or a list. attachments: (name, ctype, bytes)."""
    smtp_server = os.getenv("SMTP_SERVER")
    smtp_port = int(os.getenv("SMTP_PORT", 587))
    smtp_username = os.getenv("SMTP_USERNAME")
    smtp_password = os.getenv("SMTP_PASSWORD")
    from_email = os.getenv("FROM_EMAIL", smtp_username)
    to_list = [e for e in dict.fromkeys(
        to_email if isinstance(to_email, (list, tuple)) else [to_email]) if e]
    if not (smtp_server and smtp_username and smtp_password and to_list):
        print("[approval-email] SMTP not configured or no recipient — skipped")
        return

    # CC: everyone who approved along the trail + any manually added emails
    cc_emails = [e for e in dict.fromkeys(cc_emails or []) if e and e not in to_list]

    outcome = "REJECTED" if app.get("status") == "rejected" else "APPROVED"
    msg = MIMEMultipart()
    msg["Subject"] = f"{outcome}: {app.get('app_no')} — Approval Application"
    msg["From"] = mail_utils.from_header(from_email)
    msg["Reply-To"] = mail_utils.reply_to(from_email)
    msg["To"] = ", ".join(to_list)
    if cc_emails:
        msg["Cc"] = ", ".join(cc_emails)
    msg.attach(MIMEText(_email_html(app, attachments), "html", "utf-8"))

    for name, _ctype, data in attachments:
        try:
            part = MIMEApplication(data, Name=name)
            part["Content-Disposition"] = f'attachment; filename="{name}"'
            msg.attach(part)
        except Exception as e:
            print(f"[approval-email] attachment {name} skipped: {e}")

    with smtplib.SMTP(smtp_server, smtp_port) as server:
        server.starttls()
        server.login(smtp_username, smtp_password)
        server.send_message(msg)
    print(f"[approval-email] sent {app.get('app_no')} -> {', '.join(to_list)} (cc: {len(cc_emails)})")


def send_final_approval_email_async(to_email, app: dict, attachments, cc_emails=None):
    """Fire-and-forget so approving / rejecting never waits on SMTP.
    The outcome (approved / rejected) is read from the record's status."""
    def _run():
        try:
            _send_email(to_email, app, attachments, cc_emails)
        except Exception:
            print("[approval-email] send failed:")
            traceback.print_exc()
    threading.Thread(target=_run, daemon=True).start()


# ---------------- PDF ---------------- #

def build_approval_pdf(app: dict, attachments) -> bytes:
    """Branded PDF: header band + footer with page numbers on every page,
    application details, an approval-flow table where every remark gets a
    FULL-WIDTH row (long remarks display properly), then the attached
    documents (images as pages, PDF attachments merged at the end)."""
    from datetime import datetime
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
    from reportlab.lib.units import mm
    from reportlab.platypus import (
        Image as RLImage, PageBreak, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle,
    )

    styles = getSampleStyleSheet()
    h2 = ParagraphStyle("h2", parent=styles["Heading2"], fontSize=11.5,
                        textColor=colors.HexColor(BRAND), spaceBefore=4, spaceAfter=3)
    body = ParagraphStyle("body", parent=styles["Normal"], fontSize=9.5, leading=13)
    small = ParagraphStyle("small", parent=styles["Normal"], fontSize=8.5,
                           leading=11, textColor=colors.HexColor("#4b5563"))

    app_no = app.get("app_no") or "-"
    outcome = "REJECTED" if app.get("status") == "rejected" else "APPROVED"
    generated = datetime.now().strftime("%d %b %Y %I:%M %p")

    # Company logo (client/public/logo.png) drawn at the left of the header
    from pathlib import Path
    logo_path = Path(__file__).resolve().parents[3] / "client" / "public" / "logo.png"

    def _decor(canvas, doc_):
        """White header with the company logo + blue text, footer on every page."""
        canvas.saveState()
        w, h = A4
        text_color = colors.HexColor("#d97706" if outcome == "REJECTED" else BRAND)
        # white band with a thin brand underline
        canvas.setFillColor(colors.white)
        canvas.rect(0, h - 21 * mm, w, 21 * mm, fill=1, stroke=0)
        canvas.setFillColor(text_color)
        canvas.rect(0, h - 21 * mm, w, 0.8 * mm, fill=1, stroke=0)

        text_x = 15 * mm
        if logo_path.exists():
            try:
                from reportlab.lib.utils import ImageReader
                logo = ImageReader(str(logo_path))
                lw, lh = logo.getSize()
                draw_h = 13 * mm
                draw_w = draw_h * lw / lh
                canvas.drawImage(logo, 15 * mm, h - 18 * mm, width=draw_w, height=draw_h,
                                 preserveAspectRatio=True, mask="auto")
                text_x = 15 * mm + draw_w + 5 * mm
            except Exception as e:
                print(f"[approval-pdf] logo skipped: {e}")

        canvas.setFillColor(text_color)
        canvas.setFont("Helvetica-Bold", 12.5)
        canvas.drawString(text_x, h - 10 * mm, "KALA Care - Approval Application")
        canvas.setFont("Helvetica", 9)
        canvas.drawString(
            text_x, h - 16 * mm,
            f"{app_no}  |  {TYPE_LABELS.get(app.get('request_type'), '')}  |  {CATEGORY_LABELS.get(app.get('category'), '')}",
        )
        canvas.setFont("Helvetica-Bold", 11)
        canvas.drawRightString(w - 15 * mm, h - 13 * mm, outcome)
        canvas.setFillColor(colors.HexColor("#6b7280"))
        canvas.setFont("Helvetica", 7.5)
        canvas.drawString(15 * mm, 8 * mm, f"Generated on {generated}")
        canvas.drawRightString(w - 15 * mm, 8 * mm, f"Page {canvas.getPageNumber()}")
        canvas.restoreState()

    buf = BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, topMargin=26 * mm, bottomMargin=16 * mm,
                            leftMargin=15 * mm, rightMargin=15 * mm)
    build_kwargs = {"onFirstPage": _decor, "onLaterPages": _decor}
    story = [Paragraph("Application Details", h2)]

    grey = colors.HexColor("#d1d5db")
    soft = colors.HexColor("#f3f4f6")

    # A purpose pasted from Excel is lifted OUT of the details grid and drawn as
    # its own block below it. Nested inside a table cell a table cannot split,
    # so anything taller than the remaining page is silently lost; standing on
    # its own it flows across pages, repeats its header row, and gets the full
    # page width instead of the 135mm value column.
    label_w, value_w = 45 * mm, 135 * mm
    rich_purpose = None
    det_data = []
    for l, v in details_rows(app):
        if l in HTML_VALUE_LABELS and has_table(v):
            rich_purpose = (l, v)
            continue
        # a purpose with only bold / line breaks stays in the grid, but still
        # has to be PARSED — escaping it would print the tags themselves
        value = (html_flowables(v, body, value_w - 8)
                 if l in HTML_VALUE_LABELS and is_rich_html(v)
                 else Paragraph(_esc(str(v), quote=False).replace("\n", "<br/>"), body))
        det_data.append([Paragraph(f"<b>{_esc(l)}</b>", body), value])
    det = Table(det_data, colWidths=[label_w, value_w])
    det.setStyle(TableStyle([
        ("GRID", (0, 0), (-1, -1), 0.5, grey),
        ("BACKGROUND", (0, 0), (0, -1), soft),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]))
    story += [det, Spacer(1, 8)]
    if rich_purpose:
        story.append(Paragraph(rich_purpose[0], h2))
        story += html_flowables(rich_purpose[1], body, doc.width)
        story.append(Spacer(1, 8))
    story.append(Paragraph("Approval Flow", h2))

    # Two rows per step: [Step | Approved By | When] then a FULL-WIDTH remark
    # row underneath — long remarks wrap across the entire page width.
    white_body = ParagraphStyle("wbody", parent=body, textColor=colors.white)
    tr_data = [[Paragraph("<b>Step</b>", white_body), Paragraph("<b>Approved By / Note</b>", white_body),
                Paragraph("<b>When</b>", white_body)]]
    tr_style = [
        ("GRID", (0, 0), (-1, -1), 0.5, grey),
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor(BRAND)),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]
    r = 1
    for s, w_, t, rem in trail_rows(app):
        # escaped: a '<' typed into a remark would break Paragraph's parser
        tr_data.append([Paragraph(f"<b>{_esc(str(s))}</b>", body),
                        Paragraph(_esc(str(w_)), body), Paragraph(_esc(str(t)), body)])
        r += 1
        tr_data.append([Paragraph(f"<b>Remark:</b> {_esc(str(rem))}", small), "", ""])
        tr_style.append(("SPAN", (0, r), (-1, r)))
        tr_style.append(("BACKGROUND", (0, r), (-1, r), colors.HexColor("#fafafa")))
        r += 1
    tr = Table(tr_data, colWidths=[55 * mm, 85 * mm, 40 * mm])
    tr.setStyle(TableStyle(tr_style))
    story += [tr, Spacer(1, 8), Paragraph("Attached Documents", h2)]

    if attachments:
        for name, _c, _d in attachments:
            story.append(Paragraph(f"• {name}", body))
    else:
        story.append(Paragraph("No documents attached", body))

    # Image attachments become their own pages inside the same PDF
    image_types = ("image/png", "image/jpeg", "image/jpg", "image/gif", "image/bmp", "image/webp")
    for name, ctype, data in attachments:
        if (ctype or "").lower() in image_types:
            try:
                img = RLImage(BytesIO(data))
                max_w, max_h = 170 * mm, 220 * mm
                ratio = min(max_w / img.imageWidth, max_h / img.imageHeight, 1)
                img.drawWidth = img.imageWidth * ratio
                img.drawHeight = img.imageHeight * ratio
                story += [PageBreak(), Paragraph(f"Attachment: {name}", h2), Spacer(1, 4), img]
            except Exception as e:
                print(f"[approval-pdf] image {name} skipped: {e}")

    doc.build(story, **build_kwargs)
    base_pdf = buf.getvalue()

    # Merge PDF attachments after the report pages
    pdf_atts = [(n, d) for n, c, d in attachments
                if (c or "").lower() == "application/pdf" or n.lower().endswith(".pdf")]
    if not pdf_atts:
        return base_pdf
    try:
        from pypdf import PdfReader, PdfWriter
        writer = PdfWriter()
        writer.append(PdfReader(BytesIO(base_pdf)))
        for name, data in pdf_atts:
            try:
                writer.append(PdfReader(BytesIO(data)))
            except Exception as e:
                print(f"[approval-pdf] pdf {name} skipped: {e}")
        out = BytesIO()
        writer.write(out)
        return out.getvalue()
    except Exception as e:
        print(f"[approval-pdf] merge skipped: {e}")
        return base_pdf
