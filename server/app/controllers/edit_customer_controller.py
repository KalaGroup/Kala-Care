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
            if edited_data.get('pan_number') is not None:
                existing_history.edited_pan_number = edited_data['pan_number']
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
                "pan_number": customer.pan_number,
                "location": customer.location
            }
            
            history_entry = CustomerEditHistory(
                customer_id=customer_id,
                instance_id=instance_id,
                
                # Original data (preserved forever)
                original_customer_name=original_data.get('customer_name'),
                original_phone_number=original_data.get('phone_number'),
                original_email=original_data.get('email'),
                original_pan_number=original_data.get('pan_number'),
                original_location=original_data.get('location'),
                
                # Edited data (from this edit)
                edited_customer_name=edited_data.get('customer_name', original_data['customer_name']),
                edited_phone_number=edited_data.get('phone_number', original_data['phone_number']),
                edited_email=edited_data.get('email', original_data['email']),
                edited_pan_number=edited_data.get('pan_number', original_data['pan_number']),
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
                "pan_number": customer.pan_number,
                "location": customer.location,
                "created_at": customer.created_at
            },
            "current_edited_data": {
                "customer_name": latest_edit.edited_customer_name if latest_edit else customer.customer_name,
                "phone_number": latest_edit.edited_phone_number if latest_edit else customer.phone_number,
                "email": latest_edit.edited_email if latest_edit else customer.email,
                "pan_number": latest_edit.edited_pan_number if latest_edit else customer.pan_number,
                "location": latest_edit.edited_location if latest_edit else customer.location
            } if latest_edit else None,
            "edit_history": [
                {
                    "id": h.id,
                    "edited_at": h.last_edited_at,
                    "user_id": h.user_id,
                    "user_name": h.user_name,
                    "edit_count": h.edit_count,
                    "edited_data": {
                        "customer_name": h.edited_customer_name,
                        "phone_number": h.edited_phone_number,
                        "email": h.edited_email,
                        "pan_number": h.edited_pan_number,
                        "location": h.edited_location
                    }
                }
                for h in history
            ],
            "last_edited_by": last_editor,
            "last_edited_at": latest_edit.last_edited_at if latest_edit else None,
            "total_edits": len(history)
        }
    
    def get_all_edited_customers(self, skip: int = 0, limit: int = 100) -> List[Dict[str, Any]]:
        """
        Get all customers that have been edited, with their edit info
        """
        # Get all distinct customer_ids from edit history
        edited_customer_ids = self.db.query(CustomerEditHistory.customer_id).distinct().all()
        edited_customer_ids = [c[0] for c in edited_customer_ids]
        
        result = []
        for customer_id in edited_customer_ids:
            customer_info = self.get_customer_with_edit_info(customer_id)
            if customer_info:
                result.append(customer_info)
        
        return result[skip:skip + limit]
    
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
        days_since_last_send = (datetime.now() - last_send).days
        return days_since_last_send >= 10
    
    def send_test_email(self, test_email: str = None) -> bool:
        """Send a test email to verify email configuration"""
        try:
            # Get email configuration
            smtp_server = os.getenv('SMTP_SERVER')
            smtp_port = int(os.getenv('SMTP_PORT', 587))
            smtp_username = os.getenv('SMTP_USERNAME')
            smtp_password = os.getenv('SMTP_PASSWORD')
            from_email = os.getenv('FROM_EMAIL', smtp_username)
            
            # Use provided test email or default from env
            recipient_email = test_email or os.getenv('TEST_RECIPIENT_EMAIL')
            
            # Validate all required fields
            missing_fields = []
            if not smtp_server:
                missing_fields.append("SMTP_SERVER")
            if not smtp_port:
                missing_fields.append("SMTP_PORT")
            if not smtp_username:
                missing_fields.append("SMTP_USERNAME")
            if not smtp_password:
                missing_fields.append("SMTP_PASSWORD")
            if not recipient_email:
                missing_fields.append("TEST_RECIPIENT_EMAIL")
                
            if missing_fields:
                logger.error(f"Missing email configuration: {', '.join(missing_fields)}")
                return False
            
            # Create test email
            current_time = datetime.now()
            subject = f"Test Email - Customer Edit History System - {current_time.strftime('%Y-%m-%d %H:%M:%S')}"
            html_body = f"""
            <html>
            <body>
                <h2>Test Email</h2>
                <p>This is a test email from the Customer Edit History System.</p>
                <p>If you're receiving this, the email configuration is working correctly.</p>
                <p><strong>Time sent:</strong> {current_time.strftime('%Y-%m-%d %H:%M:%S')}</p>
                <p><strong>Server:</strong> {smtp_server}</p>
                <p><strong>Configuration Status:</strong> ✅ Working</p>
            </body>
            </html>
            """
            
            text_body = f"""
            Test Email
            This is a test email from the Customer Edit History System.
            If you're receiving this, the email configuration is working correctly.
            Time sent: {current_time.strftime('%Y-%m-%d %H:%M:%S')}
            Server: {smtp_server}
            Configuration Status: Working
            """
            
            msg = MIMEMultipart('alternative')
            msg['Subject'] = subject
            msg['From'] = from_email
            msg['To'] = recipient_email
            
            part1 = MIMEText(text_body, 'plain')
            part2 = MIMEText(html_body, 'html')
            msg.attach(part1)
            msg.attach(part2)
            
            # Send email
            with smtplib.SMTP(smtp_server, smtp_port) as server:
                server.starttls()
                server.login(smtp_username, smtp_password)
                server.send_message(msg)
            
            return True
            
        except smtplib.SMTPAuthenticationError as e:
            logger.error(f"SMTP Authentication failed: {e}")
            print(f"SMTP Authentication failed! Please check your email credentials.")
            return False
        except Exception as e:
            logger.error(f"Error sending test email: {str(e)}")
            print(f"Error: {str(e)}")
            return False
    
    def get_last_10_days_edit_history(self) -> List[CustomerEditHistory]:
        """Get edit history entries from the last 10 days"""
        end_date = datetime.now()
        start_date = end_date - timedelta(days=10)
        
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
            'Original PAN Number', 'Original Location',
            'Edited Customer Name', 'Edited Phone Number', 'Edited Email',
            'Edited PAN Number', 'Edited Location',
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
                entry.original_pan_number or '',
                entry.original_location or '',
                entry.edited_customer_name or '',
                entry.edited_phone_number or '',
                entry.edited_email or '',
                entry.edited_pan_number or '',
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
    
    def send_last_10_days_edit_history_email(self, force_send: bool = False) -> bool:
        """
        Send email with last 10 days edit history to configured recipients
        Only sends if 10 days have passed since last send, unless force_send=True
        """
        try:
            # Check if we should send email
            if not self._should_send_email(force_send):
                last_send = self._get_last_email_send_date()
                days_since = (datetime.now() - last_send).days if last_send else 0
                return False
            
            # Calculate date range for last 10 days
            end_date = datetime.now()
            start_date = end_date - timedelta(days=10)
            
            # Get edit history for last 10 days
            history_entries = self.get_last_10_days_edit_history()
            
            if not history_entries:
                # Still update last send date to avoid checking every day
                self._save_last_email_send_date(end_date)
                return False
            
            # Get email configuration
            smtp_server = os.getenv('SMTP_SERVER')
            smtp_port = int(os.getenv('SMTP_PORT', 587))
            smtp_username = os.getenv('SMTP_USERNAME')
            smtp_password = os.getenv('SMTP_PASSWORD')
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
            
            msg = MIMEMultipart('alternative')
            msg['Subject'] = subject
            msg['From'] = from_email
            msg['To'] = ', '.join(recipient_emails)
            
            # Attach plain text and HTML versions
            part1 = MIMEText(text_body, 'plain')
            part2 = MIMEText(html_body, 'html')
            msg.attach(part1)
            msg.attach(part2)
            
            # Attach CSV file
            csv_part = MIMEBase('application', 'csv')
            csv_part.set_payload(csv_content.encode('utf-8-sig'))
            encoders.encode_base64(csv_part)
            csv_part.add_header(
                'Content-Disposition',
                f'attachment; filename="customer_edit_history_{start_date.strftime("%Y%m%d")}_to_{end_date.strftime("%Y%m%d")}.csv"'
            )
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
        """Generate professional HTML report with scrollable table and download option"""
        
        html = f"""
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <style>
                body {{
                    font-family: 'Segoe UI', Arial, sans-serif;
                    margin: 0;
                    padding: 20px;
                    background-color: #f5f5f5;
                }}
                .container {{
                    max-width: 100%;
                    background-color: white;
                    border-radius: 8px;
                    box-shadow: 0 2px 4px rgba(0,0,0,0.1);
                    overflow: hidden;
                }}
                .header {{
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    color: white;
                    padding: 20px 30px;
                }}
                .header h1 {{
                    margin: 0;
                    font-size: 24px;
                }}
                .info-bar {{
                    background-color: #f8f9fa;
                    padding: 15px 30px;
                    border-bottom: 1px solid #e0e0e0;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    flex-wrap: wrap;
                }}
                .info-item {{
                    margin: 5px 0;
                }}
                .info-label {{
                    font-weight: 600;
                    color: #555;
                }}
                .info-value {{
                    color: #333;
                    margin-left: 5px;
                }}
                .download-note {{
                    background-color: #e3f2fd;
                    padding: 10px 30px;
                    border-left: 4px solid #2196f3;
                    margin: 0;
                    font-size: 14px;
                    color: #1976d2;
                }}
                .table-wrapper {{
                    overflow-x: auto;
                    max-height: 500px;
                    overflow-y: auto;
                    margin: 20px 0;
                }}
                table {{
                    width: 100%;
                    border-collapse: collapse;
                    font-size: 13px;
                    min-width: 1200px;
                }}
                th {{
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    color: white;
                    padding: 12px 8px;
                    text-align: left;
                    font-weight: 600;
                    position: sticky;
                    top: 0;
                    z-index: 10;
                    white-space: nowrap;
                }}
                td {{
                    padding: 10px 8px;
                    border-bottom: 1px solid #e0e0e0;
                    white-space: nowrap;
                }}
                tr:hover {{
                    background-color: #f5f5f5;
                }}
                .footer {{
                    background-color: #f8f9fa;
                    padding: 15px 30px;
                    text-align: center;
                    color: #666;
                    font-size: 12px;
                    border-top: 1px solid #e0e0e0;
                }}
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>Customer Edit History Report</h1>
                </div>
                
                                <div class="info-bar">
                    <div class="info-item">
                        <span class="info-label">From Date:</span>
                        <span class="info-value">{start_date.strftime('%Y-%m-%d')}</span>
                    </div>
                    <div class="info-item">
                        <span class="info-label">To Date:</span>
                        <span class="info-value">{end_date.strftime('%Y-%m-%d')}</span>
                    </div>
                    <div class="info-item">
                        <span class="info-label">Total Rows:</span>
                        <span class="info-value">{len(entries)}</span>
                    </div>
                </div>
                
                <div class="download-note">
                    📎 <strong>CSV attachment included:</strong> A CSV file with all data has been attached to this email for easy downloading.
                </div>
                
                <div class="table-wrapper">
                    <table>
                        <thead>
                            <tr>
                                <th>ID</th>
                                <th>Customer ID</th>
                                <th>Instance ID</th>
                                <th>Original Name</th>
                                <th>Original Phone</th>
                                <th>Original Email</th>
                                <th>Original PAN</th>
                                <th>Original Location</th>
                                <th>Edited Name</th>
                                <th>Edited Phone</th>
                                <th>Edited Email</th>
                                <th>Edited PAN</th>
                                <th>Edited Location</th>
                                <th>User ID</th>
                                <th>User Name</th>
                                <th>Edit Count</th>
                                <th>Created At</th>
                                <th>Last Edited</th>
                            </tr>
                        </thead>
                        <tbody>
        """
        
        for entry in entries:
            html += f"""
                            <tr>
                                <td>{entry.id}</td>
                                <td>{entry.customer_id}</td>
                                <td>{entry.instance_id or '-'}</td>
                                <td>{entry.original_customer_name or '-'}</td>
                                <td>{entry.original_phone_number or '-'}</td>
                                <td>{entry.original_email or '-'}</td>
                                <td>{entry.original_pan_number or '-'}</td>
                                <td>{entry.original_location or '-'}</td>
                                <td>{entry.edited_customer_name or '-'}</td>
                                <td>{entry.edited_phone_number or '-'}</td>
                                <td>{entry.edited_email or '-'}</td>
                                <td>{entry.edited_pan_number or '-'}</td>
                                <td>{entry.edited_location or '-'}</td>
                                <td>{entry.user_id}</td>
                                <td>{entry.user_name}</td>
                                <td>{entry.edit_count}</td>
                                <td>{entry.created_at.strftime('%Y-%m-%d %H:%M') if entry.created_at else '-'}</td>
                                <td>{entry.last_edited_at.strftime('%Y-%m-%d %H:%M') if entry.last_edited_at else '-'}</td>
                            </tr>
            """
        
        html += f"""
                        </tbody>
                    </table>
                </div>
                
                <div class="footer">
                    <p>This report contains {len(entries)} record(s) from {start_date.strftime('%Y-%m-%d')} to {end_date.strftime('%Y-%m-%d')}</p>
                    <p>For data export, please use the attached CSV file.</p>
                </div>
            </div>
        </body>
        </html>
        """
        
        return html
    
    def _generate_professional_text_report(self, entries: List, start_date: datetime, end_date: datetime) -> str:
        """Generate professional plain text report"""
        
        report = f"""
{'=' * 80}
CUSTOMER EDIT HISTORY REPORT
{'=' * 80}

Report Period: {start_date.strftime('%Y-%m-%d')} to {end_date.strftime('%Y-%m-%d')}
Total Rows: {len(entries)}
Generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}

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