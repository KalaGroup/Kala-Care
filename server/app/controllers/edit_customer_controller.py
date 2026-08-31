from sqlalchemy.orm import Session
from sqlalchemy import desc
from typing import Dict, Any, Optional, List
from datetime import datetime, timedelta
import os
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from email.mime.base import MIMEBase
from email import encoders
import logging
from pathlib import Path
import csv
from io import StringIO

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

from app.models.edit_customer_model import CustomerEditHistory
from app.schemas import edit_customer_schema
from app.models.customer_model import Customer
from app.models.user_model import User
from app.time_utils import now_ist
from app import mail_utils

class EditCustomerController:
    def __init__(self, db: Session):
        self.db = db
        self.last_send_file = Path("/tmp/last_email_send_date.txt")  # File to track last send
    
    def create_or_update_edit_history(
        self,
        customer_id: int,
        edited_data: Dict[str, Any],
        user_id: str,
        user_name: str
    ) -> CustomerEditHistory:
        """
        Create new edit history or update existing one
        Original data is preserved from the first edit
        """
        # Get customer
        customer = self.db.query(Customer).filter(Customer.id == customer_id).first()
        if not customer:
            return None
        
        instance_id = customer.instance_id
        
        # Check if edit history already exists
        existing_history = self.db.query(CustomerEditHistory).filter(
            CustomerEditHistory.customer_id == customer_id
        ).first()
        
        if existing_history:
            # Update existing history - only update edited fields
            if edited_data.get('customer_name') is not None:
                existing_history.edited_customer_name = edited_data['customer_name']
            if edited_data.get('phone_number') is not None:
                existing_history.edited_phone_number = edited_data['phone_number']
            if edited_data.get('email') is not None:
                existing_history.edited_email = edited_data['email']
            if edited_data.get('location') is not None:
                existing_history.edited_location = edited_data['location']
            
            # Update user info and count
            existing_history.user_id = user_id
            existing_history.user_name = user_name
            existing_history.edit_count += 1
            
            self.db.commit()
            self.db.refresh(existing_history)
            
            return existing_history
        else:
            # Create new history entry with original data preserved
            original_data = {
                "customer_name": customer.customer_name,
                "phone_number": customer.phone_number,
                "email": customer.email,
                "location": customer.location
            }

            history_entry = CustomerEditHistory(
                customer_id=customer_id,
                instance_id=instance_id,

                # Original data (preserved forever)
                original_customer_name=original_data.get('customer_name'),
                original_phone_number=original_data.get('phone_number'),
                original_email=original_data.get('email'),
                original_location=original_data.get('location'),

                # Edited data (from this edit)
                edited_customer_name=edited_data.get('customer_name', original_data['customer_name']),
                edited_phone_number=edited_data.get('phone_number', original_data['phone_number']),
                edited_email=edited_data.get('email', original_data['email']),
                edited_location=edited_data.get('location', original_data['location']),
                
                # User info
                user_id=user_id,
                user_name=user_name,
                
                is_original_preserved=True,
                edit_count=1
            )
            
            self.db.add(history_entry)
            self.db.commit()
            self.db.refresh(history_entry)
            
            return history_entry
    
    def get_customer_edit_history(
        self,
        customer_id: int,
        page: int = 1,
        limit: int = 20
    ) -> Dict[str, Any]:
        """
        Get edit history for a specific customer
        """
        query = self.db.query(CustomerEditHistory).filter(
            CustomerEditHistory.customer_id == customer_id
        ).order_by(desc(CustomerEditHistory.last_edited_at))
        
        total = query.count()
        
        # Pagination
        offset = (page - 1) * limit
        items = query.offset(offset).limit(limit).all()
        
        return {
            "total": total,
            "page": page,
            "limit": limit,
            "items": items
        }
    
    def get_customer_with_edit_info(self, customer_id: int) -> Dict[str, Any]:
        """
        Get customer details along with their edit information
        Shows original data (from customer table) and current edited data (from edit history)
        """
        customer = self.db.query(Customer).filter(Customer.id == customer_id).first()
        
        if not customer:
            return None
        
        # Get edit history
        history = self.db.query(CustomerEditHistory).filter(
            CustomerEditHistory.customer_id == customer_id
        ).order_by(desc(CustomerEditHistory.last_edited_at)).all()
        
        # Get the latest edit (for current edited data)
        latest_edit = history[0] if history else None
        
        # Get user info for latest edit
        last_editor = None
        if latest_edit:
            user = self.db.query(User).filter(User.user_id == latest_edit.user_id).first()
            if user:
                last_editor = {
                    "user_id": user.user_id,
                    "name": user.name,
                    "role": user.role
                }
        
        return {
            "original_customer": {
                "id": customer.id,
                "instance_id": customer.instance_id,
                "customer_name": customer.customer_name,
                "phone_number": customer.phone_number,
                "email": customer.email,
                "location": customer.location,
                "created_at": customer.created_at
            },
            "current_edited_data": {
                "customer_name": latest_edit.edited_customer_name if latest_edit else customer.customer_name,
                "phone_number": latest_edit.edited_phone_number if latest_edit else customer.phone_number,
                "email": latest_edit.edited_email if latest_edit else customer.email,
                "location": latest_edit.edited_location if latest_edit else customer.location
            } if latest_edit else None,
            "edit_history": [
                {
                    "id": h.id,
                    "edited_at": h.last_edited_at,
                    "user_id": h.user_id,
                    "user_name": h.user_name,
                    "edit_count": h.edit_count,
                    "is_done": bool(h.is_done),
                    "is_deleted": bool(h.is_deleted),
                    "edited_data": {
                        "customer_name": h.edited_customer_name,
                        "phone_number": h.edited_phone_number,
                        "email": h.edited_email,
                        "location": h.edited_location
                    }
                }
                for h in history
                if not h.is_deleted  # hide soft-deleted rows
            ],
            "last_edited_by": last_editor,
            "last_edited_at": latest_edit.last_edited_at if latest_edit else None,
            "total_edits": len(history)
        }
    
    def get_all_edited_customers(self, skip: int = 0, limit: int = 100) -> List[Dict[str, Any]]:
        """
        Get all customers that have been edited, with their edit info.
        Soft-deleted rows (is_deleted = True) are excluded.

        Batched to avoid the previous N+1 (which ran 3 queries per customer via
        get_customer_with_edit_info). We now fetch the customers, their full edit
        history and the latest-editor users in a handful of chunked queries and
        assemble the SAME per-customer dicts in Python. Output is identical.
        """
        # Only customer_ids that still have at least one non-deleted edit row
        edited_customer_ids = [
            c[0] for c in self.db.query(CustomerEditHistory.customer_id).filter(
                CustomerEditHistory.is_deleted == False
            ).distinct().all()
        ]
        if not edited_customer_ids:
            return []

        CHUNK = 1000  # SQL Server caps IN() at ~2100 parameters

        # 1) All original customers, by id
        customers_by_id: Dict[int, Any] = {}
        for i in range(0, len(edited_customer_ids), CHUNK):
            chunk = edited_customer_ids[i:i + CHUNK]
            for c in self.db.query(Customer).filter(Customer.id.in_(chunk)).all():
                customers_by_id[c.id] = c

        # 2) ALL edit history (deleted + non-deleted) for these customers, newest
        #    first — grouped per customer (mirrors get_customer_with_edit_info,
        #    which sorts each customer's history by last_edited_at desc).
        history_by_customer: Dict[int, List[CustomerEditHistory]] = {}
        for i in range(0, len(edited_customer_ids), CHUNK):
            chunk = edited_customer_ids[i:i + CHUNK]
            rows = self.db.query(CustomerEditHistory).filter(
                CustomerEditHistory.customer_id.in_(chunk)
            ).order_by(desc(CustomerEditHistory.last_edited_at)).all()
            for h in rows:
                history_by_customer.setdefault(h.customer_id, []).append(h)

        # 3) The latest-editor users, by user_id
        latest_user_ids = list({
            hist[0].user_id
            for hist in history_by_customer.values()
            if hist and hist[0].user_id
        })
        users_by_id: Dict[str, Any] = {}
        for i in range(0, len(latest_user_ids), CHUNK):
            chunk = latest_user_ids[i:i + CHUNK]
            for u in self.db.query(User).filter(User.user_id.in_(chunk)).all():
                users_by_id[u.user_id] = u

        # 4) Assemble the same dicts get_customer_with_edit_info would return
        result: List[Dict[str, Any]] = []
        for customer_id in edited_customer_ids:
            customer = customers_by_id.get(customer_id)
            if not customer:
                continue

            history = history_by_customer.get(customer_id, [])
            visible = [h for h in history if not h.is_deleted]
            if not visible:  # keep only customers that still have visible history
                continue

            latest_edit = history[0] if history else None
            last_editor = None
            if latest_edit:
                u = users_by_id.get(latest_edit.user_id)
                if u:
                    last_editor = {
                        "user_id": u.user_id,
                        "name": u.name,
                        "role": u.role,
                    }

            result.append({
                "original_customer": {
                    "id": customer.id,
                    "instance_id": customer.instance_id,
                    "customer_name": customer.customer_name,
                    "phone_number": customer.phone_number,
                    "email": customer.email,
                    "location": customer.location,
                    "created_at": customer.created_at
                },
                "current_edited_data": {
                    "customer_name": latest_edit.edited_customer_name,
                    "phone_number": latest_edit.edited_phone_number,
                    "email": latest_edit.edited_email,
                    "location": latest_edit.edited_location
                } if latest_edit else None,
                "edit_history": [
                    {
                        "id": h.id,
                        "edited_at": h.last_edited_at,
                        "user_id": h.user_id,
                        "user_name": h.user_name,
                        "edit_count": h.edit_count,
                        "is_done": bool(h.is_done),
                        "is_deleted": bool(h.is_deleted),
                        "edited_data": {
                            "customer_name": h.edited_customer_name,
                            "phone_number": h.edited_phone_number,
                            "email": h.edited_email,
                            "location": h.edited_location
                        }
                    }
                    for h in visible
                ],
                "last_edited_by": last_editor,
                "last_edited_at": latest_edit.last_edited_at if latest_edit else None,
                "total_edits": len(history)
            })

        return result[skip:skip + limit]
    
    def set_edit_history_done(self, history_id: int, is_done: bool) -> Optional[CustomerEditHistory]:
        """Mark an edit-history row as done / not done."""
        entry = self.db.query(CustomerEditHistory).filter(
            CustomerEditHistory.id == history_id
        ).first()
        if not entry:
            return None
        entry.is_done = is_done
        self.db.commit()
        self.db.refresh(entry)
        return entry

    def soft_delete_edit_history(self, history_id: int) -> Optional[CustomerEditHistory]:
        """Soft delete: keep the row in the DB but hide it from the frontend."""
        entry = self.db.query(CustomerEditHistory).filter(
            CustomerEditHistory.id == history_id
        ).first()
        if not entry:
            return None
        entry.is_deleted = True
        self.db.commit()
        self.db.refresh(entry)
        return entry

    def _get_last_email_send_date(self) -> Optional[datetime]:
        """Get the last date when email was sent"""
        try:
            if self.last_send_file.exists():
                with open(self.last_send_file, 'r') as f:
                    date_str = f.read().strip()
                    return datetime.fromisoformat(date_str)
        except Exception as e:
            logger.error(f"Error reading last send date: {e}")
        return None
    
    def _save_last_email_send_date(self, date: datetime):
        """Save the last email send date"""
        try:
            self.last_send_file.parent.mkdir(parents=True, exist_ok=True)
            with open(self.last_send_file, 'w') as f:
                f.write(date.isoformat())
        except Exception as e:
            logger.error(f"Error saving last send date: {e}")
    
    def _should_send_email(self, force_send: bool = False) -> bool:
        """Check if we should send email based on 10-day frequency"""
        if force_send:
            return True
        
        last_send = self._get_last_email_send_date()
        if not last_send:
            return True
        
        # Check if 10 days have passed since last send
        days_since_last_send = (now_ist() - last_send).days
        return days_since_last_send >= 10
    
    def get_last_10_days_edit_history(self) -> List[CustomerEditHistory]:
        """Get edit history entries from the last 10 days"""
        end_date = now_ist()
        start_date = end_date - timedelta(days=11)
        
        history_entries = self.db.query(CustomerEditHistory).filter(
            CustomerEditHistory.created_at >= start_date,
            CustomerEditHistory.created_at <= end_date
        ).order_by(desc(CustomerEditHistory.created_at)).all()
        
        return history_entries
    
    def _generate_csv_attachment(self, entries: List[CustomerEditHistory]) -> tuple:
        """Generate CSV file from entries and return as attachment"""
        output = StringIO()
        writer = csv.writer(output)
        
        # Write headers
        writer.writerow([
            'ID', 'Customer ID', 'Instance ID',
            'Original Customer Name', 'Original Phone Number', 'Original Email',
            'Original Location',
            'Edited Customer Name', 'Edited Phone Number', 'Edited Email',
            'Edited Location',
            'User ID', 'User Name', 'Is Original Preserved', 'Edit Count',
            'Created At', 'Last Edited At'
        ])

        # Write data rows
        for entry in entries:
            writer.writerow([
                entry.id,
                entry.customer_id,
                entry.instance_id or '',
                entry.original_customer_name or '',
                entry.original_phone_number or '',
                entry.original_email or '',
                entry.original_location or '',
                entry.edited_customer_name or '',
                entry.edited_phone_number or '',
                entry.edited_email or '',
                entry.edited_location or '',
                entry.user_id,
                entry.user_name,
                'Yes' if entry.is_original_preserved else 'No',
                entry.edit_count,
                entry.created_at.strftime('%Y-%m-%d %H:%M:%S') if entry.created_at else '',
                entry.last_edited_at.strftime('%Y-%m-%d %H:%M:%S') if entry.last_edited_at else ''
            ])
        
        # Create attachment
        csv_content = output.getvalue()
        output.close()
        
        return csv_content
    
    def send_last_10_days_edit_history_email(self, force_send: bool = False,
                                             start_date: datetime = None,
                                             end_date: datetime = None) -> bool:
        """
        Send email with last 10 days edit history to configured recipients
        Only sends if 10 days have passed since last send, unless force_send=True
        """
        try:
            # Check if we should send email
            if not self._should_send_email(force_send):
                last_send = self._get_last_email_send_date()
                days_since = (now_ist() - last_send).days if last_send else 0
                return False
            
            # Use the reporting window passed in; fall back to the last 11 days
            if end_date is None:
                end_date = now_ist()
            if start_date is None:
                start_date = end_date - timedelta(days=11)

            # Get edit history within the window
            history_entries = self.db.query(CustomerEditHistory).filter(
                CustomerEditHistory.created_at >= start_date,
                CustomerEditHistory.created_at <= end_date
            ).order_by(desc(CustomerEditHistory.created_at)).all()
            
            if not history_entries:
                # Still update last send date to avoid checking every day
                self._save_last_email_send_date(end_date)
                return False
            
            # Get email configuration
            smtp_server = os.getenv('SMTP_SERVER')
            smtp_port = int(os.getenv('SMTP_PORT', 587))
            smtp_username = os.getenv('SMTP_USERNAME')
            smtp_password = mail_utils.smtp_password('SMTP_PASSWORD')
            recipient_emails_raw = os.getenv('REPORT_RECIPIENT_EMAILS', '')
            from_email = os.getenv('FROM_EMAIL', smtp_username)
            
            # Validate required fields
            missing_fields = []
            if not smtp_server:
                missing_fields.append("SMTP_SERVER")
            if not smtp_port:
                missing_fields.append("SMTP_PORT")
            if not smtp_username:
                missing_fields.append("SMTP_USERNAME")
            if not smtp_password:
                missing_fields.append("SMTP_PASSWORD")
            if not recipient_emails_raw:
                missing_fields.append("REPORT_RECIPIENT_EMAILS")
                
            if missing_fields:
                logger.error(f"Missing email configuration: {', '.join(missing_fields)}")
                print(f"Missing: {', '.join(missing_fields)}")
                return False
            
            # Clean recipient emails - handle multiple emails separated by commas
            recipient_emails = [email.strip() for email in recipient_emails_raw.split(',') if email.strip()]
            
            if not recipient_emails:
                logger.error("No valid recipient emails found")
                print("No valid recipient emails found")
                return False
            
            # Generate CSV attachment
            csv_content = self._generate_csv_attachment(history_entries)
            
            # Generate professional HTML report
            html_body = self._generate_professional_html_report(history_entries, start_date, end_date)
            text_body = self._generate_professional_text_report(history_entries, start_date, end_date)
            
            # Create email
            subject = f"Customer Edit History Report - {start_date.strftime('%Y-%m-%d')} to {end_date.strftime('%Y-%m-%d')}"

            # Root MUST be 'mixed' so the CSV is a real attachment in Outlook.
            # A 'multipart/alternative' root makes Outlook treat the CSV as an
            # alternative *body* and hide it (Gmail is lenient, which is why it
            # showed there but not in Outlook).
            msg = MIMEMultipart('mixed')
            msg['Subject'] = subject
            msg['From'] = mail_utils.from_header(from_email)
            msg['Reply-To'] = mail_utils.reply_to(from_email)
            msg['To'] = ', '.join(recipient_emails)
            msg['MIME-Version'] = '1.0'

            # text + HTML are the two "alternatives" — they live together inside
            # their own multipart/alternative, which is the FIRST child of the
            # mixed root. Outlook picks the HTML; plain-text clients fall back.
            body = MIMEMultipart('alternative')
            body.attach(MIMEText(text_body, 'plain', 'utf-8'))
            body.attach(MIMEText(html_body, 'html', 'utf-8'))
            msg.attach(body)

            # CSV attachment — sibling of the body on the mixed root.
            csv_filename = f'customer_edit_history_{start_date.strftime("%Y%m%d")}_to_{end_date.strftime("%Y%m%d")}.csv'
            csv_part = MIMEBase('text', 'csv')                      # text/csv → Excel opens it
            csv_part.set_payload(csv_content.encode('utf-8-sig'))
            encoders.encode_base64(csv_part)
            # Outlook reads the filename from BOTH headers — set the name on the
            # Content-Type too, else it can arrive as a nameless "ATT00001" file.
            csv_part.add_header('Content-Type', 'text/csv', name=csv_filename)
            csv_part.add_header('Content-Disposition', 'attachment', filename=csv_filename)
            msg.attach(csv_part)
            
            # Send email
            with smtplib.SMTP(smtp_server, smtp_port) as server:
                server.starttls()
                server.login(smtp_username, smtp_password)
                server.send_message(msg)
            
            # Save the send date
            self._save_last_email_send_date(end_date)
            
            logger.info(f"Email sent successfully with {len(history_entries)} rows to {len(recipient_emails)} recipients")
            return True
            
        except smtplib.SMTPAuthenticationError as e:
            logger.error(f"SMTP Authentication failed: {e}")
            print(f"SMTP Authentication failed! Please check your email credentials.")
            return False
        except Exception as e:
            logger.error(f"Error sending email: {str(e)}")
            print(f"Error: {str(e)}")
            return False
    
    def _generate_professional_html_report(self, entries: List, start_date: datetime, end_date: datetime) -> str:
        """Outlook- AND Gmail-compatible HTML report.

        All 18 columns are kept. In each EDITED column the value is shown only
        when it differs from the matching ORIGINAL column; if unchanged it shows
        "-", so the columns that actually changed stand out at a glance. Changed
        cells get a green, medium-weight style.
        """
        td_s = "padding:10px 8px;border-bottom:1px solid #e0e0e0;white-space:nowrap;font-size:13px;color:#333333;"
        # A changed edited cell — green + medium weight so edits pop out.
        td_changed = "padding:10px 8px;border-bottom:1px solid #e0e0e0;white-space:nowrap;font-size:13px;color:#1d6f42;font-weight:500;"
        th_s = "padding:12px 8px;text-align:left;font-weight:600;color:#ffffff;white-space:nowrap;font-size:13px;"
        # Gradient for Gmail + solid background-color for Outlook (white text stays visible in both).
        grad = "background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);background-color:#764ba2;"

        # Edited value only when it differs from the original; else "-".
        # Both are normalised (None -> '', trimmed) so "None vs empty" isn't a change.
        def diff(original, edited):
            o = '' if original is None else str(original).strip()
            e = '' if edited is None else str(edited).strip()
            if o == e:
                return '-'
            return e if e else '-'

        headers = ['ID', 'Customer ID', 'Instance ID', 'Original Name', 'Original Phone',
                   'Original Email', 'Original Location', 'Edited Name',
                   'Edited Phone', 'Edited Email', 'Edited Location',
                   'User ID', 'User Name', 'Edit Count', 'Created At', 'Last Edited']
        ths = "".join(f'<td bgcolor="#764ba2" style="{grad}{th_s}">{h}</td>' for h in headers)

        rows_html = ""
        for entry in entries:
            # (value, is_edited_column). Edited columns are compared to their original;
            # unchanged ones become "-" via diff().
            cells = [
                (entry.id, False),
                (entry.customer_id, False),
                (entry.instance_id or '-', False),
                (entry.original_customer_name or '-', False),
                (entry.original_phone_number or '-', False),
                (entry.original_email or '-', False),
                (entry.original_location or '-', False),
                (diff(entry.original_customer_name, entry.edited_customer_name), True),
                (diff(entry.original_phone_number, entry.edited_phone_number), True),
                (diff(entry.original_email, entry.edited_email), True),
                (diff(entry.original_location, entry.edited_location), True),
                (entry.user_id, False),
                (entry.user_name, False),
                (entry.edit_count, False),
                (entry.created_at.strftime('%Y-%m-%d %H:%M') if entry.created_at else '-', False),
                (entry.last_edited_at.strftime('%Y-%m-%d %H:%M') if entry.last_edited_at else '-', False),
            ]
            tds = ""
            for value, is_edited in cells:
                # Only an edited column that actually changed (not "-") gets the green style.
                style = td_changed if (is_edited and value != '-') else td_s
                tds += f'<td style="{style}">{value}</td>'
            rows_html += f'<tr>{tds}</tr>'

        html = f"""<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <!--[if mso]><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml><![endif]-->
    <style>
        tr:hover td {{ background-color:#f5f5f5; }}
    </style>
</head>
<body style="margin:0;padding:20px;background-color:#f5f5f5;font-family:'Segoe UI',Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:100%;background-color:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 4px rgba(0,0,0,0.1);">
        <tr>
            <td bgcolor="#764ba2" style="{grad}color:#ffffff;padding:20px 30px;">
                <h1 style="margin:0;font-size:24px;color:#ffffff;">Customer Edit History Report</h1>
            </td>
        </tr>
        <tr>
            <td style="background-color:#f8f9fa;padding:15px 30px;border-bottom:1px solid #e0e0e0;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                    <tr>
                        <td style="font-size:14px;color:#333333;padding:5px 0;"><span style="font-weight:600;color:#555555;">From Date:</span> {start_date.strftime('%Y-%m-%d')}</td>
                        <td align="center" style="font-size:14px;color:#333333;padding:5px 0;"><span style="font-weight:600;color:#555555;">To Date:</span> {end_date.strftime('%Y-%m-%d')}</td>
                        <td align="right" style="font-size:14px;color:#333333;padding:5px 0;"><span style="font-weight:600;color:#555555;">Total Rows:</span> {len(entries)}</td>
                    </tr>
                </table>
            </td>
        </tr>
        <tr>
            <td style="background-color:#e3f2fd;padding:10px 30px;border-left:4px solid #2196f3;font-size:14px;color:#1976d2;">
                📎 <strong>CSV attachment included:</strong> A CSV file with all data has been attached to this email for easy downloading.
            </td>
        </tr>
        <tr>
            <td style="padding:20px 30px;">
                <div style="max-height:500px;overflow:auto;">
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;font-size:13px;min-width:1200px;">
                        <thead>
                            <tr>{ths}</tr>
                        </thead>
                        <tbody>
                            {rows_html}
                        </tbody>
                    </table>
                </div>
            </td>
        </tr>
        <tr>
            <td style="background-color:#f8f9fa;padding:15px 30px;text-align:center;color:#666666;font-size:12px;border-top:1px solid #e0e0e0;">
                <p style="margin:4px 0;">This report contains {len(entries)} record(s) from {start_date.strftime('%Y-%m-%d')} to {end_date.strftime('%Y-%m-%d')}</p>
                <p style="margin:4px 0;">For data export, please use the attached CSV file.</p>
            </td>
        </tr>
    </table>
</body>
</html>"""

        return html
    
    def _generate_professional_text_report(self, entries: List, start_date: datetime, end_date: datetime) -> str:
        """Generate professional plain text report"""
        
        report = f"""
{'=' * 80}
CUSTOMER EDIT HISTORY REPORT
{'=' * 80}

Report Period: {start_date.strftime('%Y-%m-%d')} to {end_date.strftime('%Y-%m-%d')}
Total Rows: {len(entries)}
Generated: {now_ist().strftime('%Y-%m-%d %H:%M:%S')}

{'=' * 80}

A CSV file with complete data has been attached to this email.

Summary:
- From Date: {start_date.strftime('%Y-%m-%d')}
- To Date: {end_date.strftime('%Y-%m-%d')}
- Total Records: {len(entries)}

{'=' * 80}

For complete data with all columns, please refer to the attached CSV file.

This email was sent automatically by the Customer Edit History System.
{'=' * 80}
"""
        
        return report