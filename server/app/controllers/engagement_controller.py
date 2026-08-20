from sqlalchemy.orm import Session, joinedload
from sqlalchemy import and_, or_, func, desc
from fastapi import HTTPException
from datetime import datetime, timedelta
from typing import List, Optional, Dict, Any
import json
import os
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from dotenv import load_dotenv

from app.models.customer_model import Customer, AssetService, LMSData, AssetDetailed, AMCAgreement
from app.models.campaign_model import Campaign
from app.models.letter_model import LetterSendRecord
from app.models.engagement_model import FollowUp, Activity, RR
from app.schemas import engagement_schema
from app.models.non_followup_model import NonFollowUp

import time
import threading
from app.time_utils import now_ist
from app import mail_utils

# ---- Non-campaign list cache (kills the per-page full-dataset recomputation) ----
_NC_CACHE = {
    "signature": None,   # detects active-campaign changes
    "built_at": 0.0,
    "orders": {},        # {True: [customer_id...], False: [customer_id...]}
    "rows": {},          # {customer_id: {...row dict...}}
}
_NC_CACHE_LOCK = threading.Lock()
_NC_CACHE_TTL = 60.0     # seconds; explicit invalidation handles immediate correctness


def invalidate_non_campaign_cache():
    """Call after any non_followup write or campaign asset change."""
    with _NC_CACHE_LOCK:
        _NC_CACHE["signature"] = None
        _NC_CACHE["built_at"] = 0.0

# Load environment variables
load_dotenv()

# Display name of the synthetic "pseudo-drive" backed by non_followups rows
# with campaign_id NULL (Post Warranty follow-ups).
POST_WARRANTY_NAME = "Post Warranty"

class EngagementController:
    def __init__(self, db: Session):
        self.db = db
        # Email configuration from environment variables
        self.smtp_server = os.getenv("SMTP_SERVER", "smtp.gmail.com")
        self.smtp_port = int(os.getenv("SMTP_PORT", "587"))
        self.sender_email = os.getenv("COMPANY_EMAIL")  # Company email as sender
        self.sender_password = os.getenv("COMPANY_EMAIL_PASSWORD")
    
    # ==================== Follow-up Flags ====================
    
    FOLLOWUP_FLAGS = {
    "C1": 15,  # 15 days
    "C2": 30,  # 30 days
    "C3": 45,  # 45 days
    "C4": 60,  # 60 days
    "C5": 75,  # 75 days
    "C6": 90,  # 90 days
    "C7": 90  # 90 days (same as C6)
    }
    
    # ==================== Flag Update Based on Latest Follow-up ====================
    
    def _calculate_flag_from_days(self, days_diff: int) -> str:
        """Calculate flag based on days difference"""
        if days_diff <= 0:
            return "C1"
        elif days_diff <= 15:
            return "C1"
        elif days_diff <= 30:
            return "C2"
        elif days_diff <= 45:
            return "C3"
        elif days_diff <= 60:
            return "C4"
        elif days_diff <= 75:
            return "C5"
        elif days_diff <= 90:
            return "C6"
        else:
            return "C7"
    
    def _flag_for_next_date(self, next_date, fallback_flag=None):
        """Flag derived LIVE from days until next_followup_date (C1..C7) at
        read time — so C3 becomes C2 becomes C1 as the date approaches, on
        every page load, without relying on a background updater."""
        if not next_date:
            return fallback_flag
        today = now_ist().replace(hour=0, minute=0, second=0, microsecond=0)
        nd = next_date
        if isinstance(nd, datetime):
            nd = nd.replace(hour=0, minute=0, second=0, microsecond=0)
        else:
            nd = datetime.combine(nd, datetime.min.time())
        return self._calculate_flag_from_days((nd - today).days)

    def _update_single_followup_flag(self, today: datetime, followup: FollowUp) -> int:
        """
        Update a single follow-up's flag based on its next_followup_date.
        Returns 1 if updated, 0 otherwise.
        The caller already passes the latest follow-up for the customer, so the
        old per-row "is this the latest?" query is removed (kills the N+1).
        """
        # Skip if no next_followup_date
        if not followup.next_followup_date:
            return 0
        
        # Skip if completed or rejected
        if followup.status in ['completed', 'not_connected']:
            return 0
        
        old_flag = followup.followup_flag
        
        # Normalize next_followup_date to date only
        next_date = followup.next_followup_date
        if isinstance(next_date, datetime):
            next_date = next_date.replace(hour=0, minute=0, second=0, microsecond=0)
        else:
            next_date = datetime.combine(next_date, datetime.min.time())
        
        # Calculate days difference
        days_diff = (next_date - today).days
        
        # Determine new flag
        new_flag = self._calculate_flag_from_days(days_diff)
        
        # Update if changed
        if new_flag and new_flag != old_flag:
            followup.followup_flag = new_flag
            return 1
        
        return 0
    
    def update_latest_followup_flags(self, customer_id: Optional[int] = None) -> Dict[str, Any]:
        """
        Update flags only for the latest (most recent) follow-up of each customer
        based on its next_followup_date.
        
        Args:
            customer_id: Optional - if provided, update only for specific customer
        """
        today = now_ist().replace(hour=0, minute=0, second=0, microsecond=0)
        updated_count = 0
        
        if customer_id:
            # Get latest follow-up for specific customer
            latest_followup = self.db.query(FollowUp).filter(
                FollowUp.customer_id == customer_id,
                FollowUp.status.notin_(['completed', 'rejected'])
            ).order_by(desc(FollowUp.followup_date)).first()
            
            if latest_followup:
                updated_count += self._update_single_followup_flag(today, latest_followup)
        else:
            # Get all customers with their latest follow-up
            # Subquery to get latest followup per customer
            subquery = self.db.query(
                FollowUp.customer_id,
                func.max(FollowUp.followup_date).label('latest_date')
            ).filter(
                FollowUp.status.notin_(['completed', 'rejected'])
            ).group_by(FollowUp.customer_id).subquery()
            
            latest_followups = self.db.query(FollowUp).join(
                subquery,
                and_(
                    FollowUp.customer_id == subquery.c.customer_id,
                    FollowUp.followup_date == subquery.c.latest_date
                )
            ).all()
            
            seen_customers = set()  # on followup_date ties, keep one per customer (preserves prior behavior)
            for followup in latest_followups:
                if followup.customer_id in seen_customers:
                    continue
                seen_customers.add(followup.customer_id)
                updated_count += self._update_single_followup_flag(today, followup)
        
        if updated_count > 0:
            self.db.commit()
        
        return {
            "message": f"Updated {updated_count} latest follow-up flags",
            "updated_count": updated_count,
            "timestamp": now_ist().isoformat()
        }
    
    def _normalize_id(self, value):
        """Normalize ID to string without .0 if it's a float, handle None values"""
        if value is None:
            return None
        
        # Convert to string first
        str_value = str(value).strip()
        
        # Remove .0 if present (for float values like 100746690.0 -> 100746690)
        if str_value.endswith('.0'):
            str_value = str_value[:-2]
        
        # Remove any leading/trailing whitespace
        str_value = str_value.strip()
        
        return str_value
    
    def _compare_ids(self, id1, id2):
        """Compare two IDs after normalization"""
        if id1 is None or id2 is None:
            return False
        
        norm1 = self._normalize_id(id1)
        norm2 = self._normalize_id(id2)
        
        if norm1 == norm2:
            return True
        
        # Try comparing as integers if they are numeric
        try:
            if norm1.isdigit() and norm2.isdigit() and int(norm1) == int(norm2):
                return True
        except (ValueError, TypeError):
            pass
        
        return False
    
    def _parse_asset_numbers(self, asset_numbers):
        """Parse asset_numbers from various formats to a list"""
        if asset_numbers is None:
            return []
        
        if isinstance(asset_numbers, list):
            return asset_numbers
        
        if isinstance(asset_numbers, str):
            try:
                parsed = json.loads(asset_numbers)
                if isinstance(parsed, list):
                    return parsed
                return [parsed] if parsed else []
            except json.JSONDecodeError:
                # If it's a comma-separated string
                if ',' in asset_numbers:
                    return [item.strip() for item in asset_numbers.split(',') if item.strip()]
                return [asset_numbers] if asset_numbers else []
        
        return [str(asset_numbers)] if asset_numbers else []
    
    # ==================== Email Helper ====================
    
    def _send_campaign_completion_email_to_customer(self, customer: Customer, campaign: Campaign, followup: FollowUp):
        """Send email to customer when their follow-up is completed"""
        # Check if customer has email
        if not customer.email:
            return False
        
        # Check email configuration
        if not all([self.sender_email, self.sender_password]):
            return False
        
        try:
            # Create message
            msg = MIMEMultipart()
            msg['From'] = mail_utils.from_header(self.sender_email)
            msg['Reply-To'] = mail_utils.reply_to(self.sender_email)
            msg['To'] = customer.email
            msg['Subject'] = f"Thank You for Your Interest in {campaign.name}"
            
            # Get product/service info from campaign
            service_name = campaign.service or "our services"
            
            # Email body - Thank you message to customer
            body = f"""
            <html>
            <body>
                <h2>Thank You for Your Interest!</h2>
                
                <p>Dear {customer.customer_name or 'Valued Customer'},</p>
                
                <p>Thank you for taking the time to connect with us regarding the <strong>{campaign.name}</strong> campaign.</p>
                
                <p>We truly appreciate your interest in <strong>{service_name}</strong>. Your time and valuable feedback are important to us.</p>
                
                <h3>Campaign Details:</h3>
                <ul>
                    <li><strong>Campaign:</strong> {campaign.name}</li>
                    <li><strong>Service/Product:</strong> {service_name}</li>
                    <li><strong>Date:</strong> {followup.followup_date.strftime('%Y-%m-%d %H:%M') if followup.followup_date else 'Not provided'}</li>
                </ul>
                
                <p>Our team will continue to keep you updated about relevant offers and services that might interest you.</p>
                
                <p>If you have any questions or need further assistance, please don't hesitate to contact us.</p>
                
                <p>Best regards,<br>
                <strong>Kaka Group</strong><br>
                Customer Engagement Team</p>
                
                <hr>
                <p style="font-size: 12px; color: #666;">This is an automated message from Kaka Group. Please do not reply to this email.</p>
            </body>
            </html>
            """
            
            msg.attach(MIMEText(body, 'html'))
            
            # Send email
            with smtplib.SMTP(self.smtp_server, self.smtp_port) as server:
                server.starttls()
                server.login(self.sender_email, self.sender_password)
                server.send_message(msg)
            
            return True
            
        except Exception as e:
            print(f"Error sending email to customer: {str(e)}")
            return False
    
    def _remove_customer_from_campaign_if_exists(self, campaign_id: int, customer: Customer) -> bool:
        """Helper method to remove customer from campaign and send email. Returns True if removed."""
        try:
            campaign = self.db.query(Campaign).filter(Campaign.id == campaign_id).first()
            if not campaign or not customer.instance_id:
                return False
            
            # Parse asset_numbers
            asset_numbers = self._parse_asset_numbers(campaign.asset_numbers)
            
            if not asset_numbers:
                return False
            
            # Find and remove the matching asset number
            found = False
            new_asset_numbers = []
            
            for asset in asset_numbers:
                if asset and self._compare_ids(asset, customer.instance_id):
                    found = True
                    # Skip this one (remove it)
                    continue
                else:
                    new_asset_numbers.append(asset)
            
            if found:
                # Update the campaign with the new list
                campaign.asset_numbers = new_asset_numbers
                self.db.commit()
                
                # Email functionality disabled - no longer sending completion email to customer
                # # Get the latest follow-up for this customer in this campaign
                # latest_followup = self.db.query(FollowUp).filter(
                #     FollowUp.customer_id == customer.id,
                #     FollowUp.campaign_id == campaign_id,
                #     FollowUp.status == 'completed'
                # ).order_by(desc(FollowUp.followup_date)).first()
                #
                # # Send thank you email to customer
                # if latest_followup:
                #     self._send_campaign_completion_email_to_customer(customer, campaign, latest_followup)
                
                return True
            else:
                return False
                
        except Exception as e:
            print(f"Error removing customer from campaign: {str(e)}")
            self.db.rollback()
            return False
    
    # ==================== Transfer Detection Helper ====================
    
    def _is_customer_transferred(self, customer: Customer, current_campaign: Campaign) -> bool:
        """
        Check if customer was transferred from an older campaign with same name and service.
        A customer is considered transferred if their instance_id exists in ANY other campaign
        (active or inactive) with the same name and service, excluding the current campaign.
        """
        if not customer.instance_id:
            return False
        
        # Get ALL campaigns (including inactive) with same name and service, excluding current campaign
        same_name_service_campaigns = self.db.query(Campaign).filter(
            Campaign.name == current_campaign.name,
            Campaign.service == current_campaign.service,
            Campaign.id != current_campaign.id  # Exclude current campaign
        ).all()
        
        if not same_name_service_campaigns:
            return False
        
        customer_instance_id = self._normalize_id(customer.instance_id)
        
        # Check each old campaign to see if customer exists in its asset_numbers
        for old_campaign in same_name_service_campaigns:
            asset_numbers = self._parse_asset_numbers(old_campaign.asset_numbers)
            for asset in asset_numbers:
                if asset and self._compare_ids(asset, customer.instance_id):
                    return True
        
        return False
    
    def _get_campaign_status_with_transfer(self, customer: Customer, current_campaign: Campaign) -> Dict[str, Any]:
        """Get campaign status including transfer information and old campaign status"""
        
        # Get the latest follow-up for this specific campaign
        latest_followup = self.db.query(FollowUp).filter(
            FollowUp.customer_id == customer.id,
            FollowUp.campaign_id == current_campaign.id
        ).order_by(desc(FollowUp.followup_date)).first()
        
        status = latest_followup.status if latest_followup else None
        
        # Check if customer was transferred from an older campaign with same name and service
        is_transferred = False
        old_campaign_status = None
        
        if customer.instance_id:
            # Get ALL campaigns (including inactive) with same name and service, excluding current campaign
            same_name_service_campaigns = self.db.query(Campaign).filter(
                Campaign.name == current_campaign.name,
                Campaign.service == current_campaign.service,
                Campaign.id != current_campaign.id  # Exclude current campaign
            ).all()
            
            if same_name_service_campaigns:
                customer_instance_id = self._normalize_id(customer.instance_id)
                
                # Check each old campaign to see if customer exists in its asset_numbers
                for old_campaign in same_name_service_campaigns:
                    asset_numbers = self._parse_asset_numbers(old_campaign.asset_numbers)
                    for asset in asset_numbers:
                        if asset and self._compare_ids(asset, customer.instance_id):
                            is_transferred = True
                            # Get the latest follow-up from the old campaign
                            old_followup = self.db.query(FollowUp).filter(
                                FollowUp.customer_id == customer.id,
                                FollowUp.campaign_id == old_campaign.id
                            ).order_by(desc(FollowUp.followup_date)).first()
                            
                            if old_followup and old_followup.status:
                                old_campaign_status = old_followup.status
                            break
                    if is_transferred:
                        break
        
        return {
            "status": status,
            "is_transferred": is_transferred,
            "old_campaign_status": old_campaign_status
        }
    
    # ==================== Dashboard / Customer Engagement List ====================
    
    def get_customer_engagement_list(
        self, 
        from_date: Optional[str] = None, 
        to_date: Optional[str] = None
    ) -> Dict[str, Any]:
        """Get ALL customers with their campaign engagement data - no limits"""
        
        # First update flags for latest follow-ups
        self.update_latest_followup_flags()
        
        # Parse dates (keep existing code)
        start_date = None
        end_date = None
        if from_date:
            try:
                start_date = datetime.strptime(from_date, '%Y-%m-%d')
            except:
                start_date = datetime.fromisoformat(from_date.replace('Z', '+00:00'))
        if to_date:
            try:
                end_date = datetime.strptime(to_date, '%Y-%m-%d')
            except:
                end_date = datetime.fromisoformat(to_date.replace('Z', '+00:00'))
        
        # Get campaigns
        campaigns_query = self.db.query(Campaign).filter(Campaign.status == 'active')
        
        if start_date and end_date:
            end_date = end_date.replace(hour=23, minute=59, second=59)
            campaigns_query = campaigns_query.filter(
                and_(
                    Campaign.start_date <= end_date,
                    Campaign.end_date >= start_date
                )
            )
        elif start_date:
            campaigns_query = campaigns_query.filter(Campaign.end_date >= start_date)
        elif end_date:
            end_date = end_date.replace(hour=23, minute=59, second=59)
            campaigns_query = campaigns_query.filter(Campaign.start_date <= end_date)
        
        active_campaigns = campaigns_query.all()
        campaign_names = [c.name for c in active_campaigns]
        campaign_obj_map = {c.name: c for c in active_campaigns}
        active_campaign_id_to_name = {c.id: c.name for c in active_campaigns}
        
        if not active_campaigns:
            return {
                "from_date": from_date,
                "to_date": to_date,
                "active_campaigns": [],
                "customers": [],
                "total_count": 0
            }
        
        # Build campaign asset map
        campaign_asset_map = {}
        for campaign in active_campaigns:
            asset_numbers = self._parse_asset_numbers(campaign.asset_numbers)
            for asset in asset_numbers:
                normalized_asset = self._normalize_id(asset)
                if normalized_asset:
                    if normalized_asset not in campaign_asset_map:
                        campaign_asset_map[normalized_asset] = []
                    campaign_asset_map[normalized_asset].append(campaign.name)
        
        if not campaign_asset_map:
            return {
                "from_date": from_date,
                "to_date": to_date,
                "active_campaigns": campaign_names,
                "customers": [],
                "total_count": 0
            }
        
        # Get ALL customers — project only the columns this method reads
        # (avoids hydrating full ORM objects for 10K+ rows)
        all_customers = self.db.query(
            Customer.id,
            Customer.instance_id,
            Customer.customer_name,
            Customer.phone_number,
            Customer.email,
            Customer.branch_id,
        ).filter(Customer.instance_id.isnot(None)).all()
        
        # Filter to only customers who are in at least one active campaign
        relevant_customers = [
            c for c in all_customers
            if c.instance_id and self._normalize_id(c.instance_id) in campaign_asset_map
        ]
        relevant_customer_ids = [c.id for c in relevant_customers]
        
        # ========== OPTIMIZATION: Fetch ALL followups (chunked) ==========
        # This kills the N+1 problem (was: 2 queries per customer + 1 per campaign per customer)
        # SQL Server has a 2100-parameter limit on IN() — chunk to be safe
        all_followups_for_customers = []
        if relevant_customer_ids:
            CHUNK = 1000
            for i in range(0, len(relevant_customer_ids), CHUNK):
                chunk = relevant_customer_ids[i:i + CHUNK]
                all_followups_for_customers.extend(
                    self.db.query(
                        FollowUp.id,
                        FollowUp.customer_id,
                        FollowUp.campaign_id,
                        FollowUp.status,
                        FollowUp.followup_date,
                        FollowUp.next_followup_date,
                        FollowUp.followup_flag,
                        FollowUp.followup_remark,
                        FollowUp.user_name,
                    ).filter(FollowUp.customer_id.in_(chunk)).all()
                )
        # ========== Post Warranty (non-campaign) follow-ups ==========
        # non_followups rows with campaign_id NULL are "Post Warranty" follow-ups.
        # They feed the synthetic "Post Warranty" column/chip AND are merged into
        # the same sorted list so the customer-level rollups (last followup date,
        # next followup date, flag, last remark) reflect them when they are the
        # latest save. Rows have campaign_id None, so the per-campaign status map
        # below skips them automatically.
        latest_pw_by_customer: Dict[int, Any] = {}
        if relevant_customer_ids:
            CHUNK = 1000
            pw_rows = []
            for i in range(0, len(relevant_customer_ids), CHUNK):
                chunk = relevant_customer_ids[i:i + CHUNK]
                pw_rows.extend(
                    self.db.query(
                        NonFollowUp.id,
                        NonFollowUp.customer_id,
                        NonFollowUp.campaign_id,
                        NonFollowUp.status,
                        NonFollowUp.followup_date,
                        NonFollowUp.next_followup_date,
                        NonFollowUp.followup_flag,
                        NonFollowUp.followup_remark,
                        NonFollowUp.user_name,
                    ).filter(
                        NonFollowUp.customer_id.in_(chunk),
                        NonFollowUp.campaign_id.is_(None)
                    ).all()
                )
            pw_rows.sort(key=lambda f: f.followup_date or datetime.min, reverse=True)
            for row in pw_rows:
                if row.customer_id not in latest_pw_by_customer:
                    latest_pw_by_customer[row.customer_id] = row
            all_followups_for_customers.extend(pw_rows)

        if all_followups_for_customers:
            # Sort across all chunks (per-chunk order isn't a global order)
            all_followups_for_customers.sort(
                key=lambda f: f.followup_date or datetime.min,
                reverse=True
            )

        # Group followups by customer_id (already sorted desc by date, so first = latest)
        followups_by_customer: Dict[int, List[FollowUp]] = {}
        for f in all_followups_for_customers:
            followups_by_customer.setdefault(f.customer_id, []).append(f)
            
        # ========== Transfer-source campaigns: SAME PRODUCT (service) + INACTIVE ==========
        # New rule: a customer gets the "T" tag on an active campaign if their
        # instance_id ALSO appears in an INACTIVE campaign of the SAME PRODUCT
        # (service). Campaign NAME is no longer used — only the product matters.
        # (Matches the new create flow: transferred-from campaigns become inactive
        #  but keep their asset_numbers, so the instance lives in both.)
        active_services = {c.service for c in active_campaigns if c.service}
        transfer_candidate_campaigns = []
        if active_services:
            transfer_candidate_campaigns = self.db.query(Campaign).filter(
                Campaign.service.in_(list(active_services)),
                Campaign.status == 'inactive'   # only inactive campaigns are transfer sources
            ).all()

        # Group inactive transfer-source campaigns by service (product)
        transfer_campaigns_by_service: Dict[str, List[Campaign]] = {}
        for c in transfer_candidate_campaigns:
            transfer_campaigns_by_service.setdefault(c.service, []).append(c)

        # Pre-compute, per active campaign, the inactive same-product campaigns to check
        transfer_sources_per_active_campaign: Dict[int, List[Campaign]] = {}
        for ac in active_campaigns:
            transfer_sources_per_active_campaign[ac.id] = transfer_campaigns_by_service.get(ac.service, [])

        # Pre-parse asset_numbers for ALL transfer-source campaigns once
        parsed_assets_by_campaign_id: Dict[int, List] = {
            c.id: self._parse_asset_numbers(c.asset_numbers)
            for c in transfer_candidate_campaigns
        }
        
        # Warranty + agreement maps — scoped to ONLY the customers we return
        # (was scanning the entire AssetDetailed / AMCAgreement tables every load).
        # Include both raw and normalized id so the ".0" formatting difference
        # _normalize_id handles does not cause a miss.
        id_candidates = set()
        for c in relevant_customers:
            if c.instance_id:
                id_candidates.add(str(c.instance_id))
                id_candidates.add(self._normalize_id(c.instance_id))
        id_list = [i for i in id_candidates if i]

        warranty_map = {}
        agreement_map = {}
        CHUNK_WA = 1000  # SQL Server 2100-param IN() limit
        for i in range(0, len(id_list), CHUNK_WA):
            chunk = id_list[i:i + CHUNK_WA]
            for inst_id, warranty in self.db.query(
                AssetDetailed.instance_id,
                AssetDetailed.warranty_expiry_date
            ).filter(AssetDetailed.instance_id.in_(chunk)).all():
                normalized = self._normalize_id(inst_id)
                if normalized and normalized not in warranty_map:
                    warranty_map[normalized] = warranty

        for i in range(0, len(id_list), CHUNK_WA):
            chunk = id_list[i:i + CHUNK_WA]
            for inst_id, end_date, _ in self.db.query(
                AMCAgreement.instance_id,
                AMCAgreement.agreement_end_date,
                AMCAgreement.agreement_start_date
            ).filter(AMCAgreement.instance_id.in_(chunk)).order_by(
                desc(AMCAgreement.agreement_start_date)
            ).all():
                normalized = self._normalize_id(inst_id)
                if normalized and normalized not in agreement_map:
                    agreement_map[normalized] = end_date

        # Last oil-change info from oil_services (AssetService) — one row per
        # instance_id, joined by the indexed instance_id in the SAME chunked
        # pattern as warranty/agreement above (no per-row query).
        oil_type_map = {}
        oil_date_map = {}
        for i in range(0, len(id_list), CHUNK_WA):
            chunk = id_list[i:i + CHUNK_WA]
            for inst_id, oc_type, oc_date in self.db.query(
                AssetService.instance_id,
                AssetService.last_oil_change_sr_type,
                AssetService.last_oil_change_date
            ).filter(AssetService.instance_id.in_(chunk)).all():
                normalized = self._normalize_id(inst_id)
                if normalized and normalized not in oil_type_map:
                    oil_type_map[normalized] = oc_type
                    oil_date_map[normalized] = oc_date

        # ========== Build result using in-memory lookups (NO MORE QUERIES PER CUSTOMER) ==========
        result = []

        for customer in relevant_customers:
            normalized_customer_id = self._normalize_id(customer.instance_id)
            # Copy — "Post Warranty" may be appended below and campaign_asset_map
            # entries are shared across customers with the same instance_id.
            customer_campaign_names = list(campaign_asset_map[normalized_customer_id])
            latest_pw = latest_pw_by_customer.get(customer.id)
            
            # Get followups from in-memory dict instead of DB query
            customer_followups = followups_by_customer.get(customer.id, [])
            
            # Latest followup (any status) - first in sorted-desc list
            latest_followup = customer_followups[0] if customer_followups else None

            latest_status = latest_followup.status if latest_followup else None

            # Next Followup Date AND flag come from the LATEST SAVE. One save
            # can create followups for SEVERAL drives at once (rows land within
            # moments of each other) — each value is taken INDEPENDENTLY from
            # the newest same-batch row that has it: e.g. NC saved last (next
            # date but no flag) still shows the flag of the WIP/FR sibling from
            # the same save; a rejected row saved last still shows the sibling's
            # next date. Only when the whole batch lacks a value does it stay
            # empty — old followups from earlier saves are never resurrected.
            next_followup_date = None
            flag_source = None
            if latest_followup:
                latest_fd = latest_followup.followup_date

                def _in_batch(f):
                    if f is latest_followup:
                        return True
                    return (latest_fd and f.followup_date
                            and (latest_fd - f.followup_date).total_seconds() <= 300)

                for f in customer_followups:  # sorted desc — newest first
                    if not _in_batch(f):
                        break  # older than the batch — stop
                    if next_followup_date is None and f.next_followup_date is not None:
                        next_followup_date = f.next_followup_date
                    if flag_source is None and f.followup_flag:
                        flag_source = f
                    if next_followup_date is not None and flag_source is not None:
                        break
            # Flag computed LIVE from the flag row's next date (C3→C2→C1 as
            # days pass) — stored flag only as fallback when no date exists.
            live_flag = None
            if flag_source is not None:
                live_flag = self._flag_for_next_date(flag_source.next_followup_date, flag_source.followup_flag)
            followup_flags = self._get_followup_flags(
                customer, type("F", (), {"followup_flag": live_flag})()
            )
            
            # Build per-campaign status using pre-fetched data
            campaign_status = {}
            campaign_transferred = {}
            campaign_old_status = {}
            campaign_carry_forward = {}
            
            # Pre-build a map: campaign_id -> latest followup for THIS customer in THAT campaign
            # (built from the customer_followups list, no DB hit)
            latest_followup_per_campaign: Dict[int, FollowUp] = {}
            for f in customer_followups:
                if f.campaign_id and f.campaign_id not in latest_followup_per_campaign:
                    latest_followup_per_campaign[f.campaign_id] = f  # already sorted desc, first wins
            
            for campaign_name in customer_campaign_names:
                campaign_obj = campaign_obj_map.get(campaign_name)
                if not campaign_obj:
                    continue
                
                # Status for this active campaign
                current_campaign_followup = latest_followup_per_campaign.get(campaign_obj.id)
                status = current_campaign_followup.status if current_campaign_followup else None
                
                # Transfer detection: customer is "transferred" (T) if their
                # instance_id appears in an INACTIVE campaign of the SAME PRODUCT
                is_transferred = False
                old_campaign_status = None
                
                old_campaigns = transfer_sources_per_active_campaign.get(campaign_obj.id, [])
                for old_campaign in old_campaigns:
                    old_assets = parsed_assets_by_campaign_id.get(old_campaign.id, [])
                    for asset in old_assets:
                        if asset and self._compare_ids(asset, customer.instance_id):
                            is_transferred = True
                            # Old campaign status from the same in-memory followup map
                            old_followup = latest_followup_per_campaign.get(old_campaign.id)
                            if old_followup and old_followup.status:
                                old_campaign_status = old_followup.status
                            break
                    if is_transferred:
                        break
                
                # ===== Carry-forward from the matching INACTIVE same-product drive =====
                # A customer sitting in a NEW drive — transferred (T) or added by
                # hand — who already has follow-up history on the SAME product in
                # an INACTIVE drive, and was NOT completed there, shows that
                # drive's last follow-up on this drive until they get a follow-up
                # of their own here. Keyed on follow-up HISTORY (not on asset
                # membership like `is_transferred`), which is what makes it cover
                # manually added customers too.
                carry_forward = None
                if current_campaign_followup is None:
                    best_old_followup = None
                    best_old_campaign = None
                    for old_campaign in old_campaigns:   # inactive + same service
                        old_f = latest_followup_per_campaign.get(old_campaign.id)
                        if old_f is None:
                            continue
                        if (old_f.status or '').strip().lower() == 'completed':
                            continue
                        if (best_old_followup is None
                                or (old_f.followup_date or datetime.min)
                                > (best_old_followup.followup_date or datetime.min)):
                            best_old_followup = old_f
                            best_old_campaign = old_campaign
                    if best_old_followup is not None:
                        carry_forward = {
                            "status": best_old_followup.status,
                            # Flag recomputed LIVE from the carried next date, the
                            # same way the row-level flag is (C3 -> C2 -> C1 as
                            # days pass), so a carried flag never goes stale.
                            "followup_flag": self._flag_for_next_date(
                                best_old_followup.next_followup_date,
                                best_old_followup.followup_flag
                            ),
                            "followup_date": best_old_followup.followup_date,
                            "user_name": best_old_followup.user_name,
                            "next_followup_date": best_old_followup.next_followup_date,
                            "remark": best_old_followup.followup_remark,
                            "source_campaign": best_old_campaign.name if best_old_campaign else None,
                        }

                campaign_status[campaign_name] = status
                campaign_transferred[campaign_name] = is_transferred
                campaign_old_status[campaign_name] = old_campaign_status
                if carry_forward is not None:
                    campaign_carry_forward[campaign_name] = carry_forward

            # Synthetic "Post Warranty" pseudo-drive: checkmark + status come from
            # the customer's latest non-campaign (campaign_id NULL) follow-up.
            campaign_checkmarks = {name: name in customer_campaign_names for name in campaign_names}
            if latest_pw is not None:
                customer_campaign_names.append(POST_WARRANTY_NAME)
                campaign_checkmarks[POST_WARRANTY_NAME] = True
                campaign_status[POST_WARRANTY_NAME] = latest_pw.status
                campaign_transferred[POST_WARRANTY_NAME] = False
            else:
                campaign_checkmarks[POST_WARRANTY_NAME] = False

            result.append({
                "customer_id": customer.id,
                "instance_id": customer.instance_id,
                "customer_name": customer.customer_name or "Unknown",
                "mobile": customer.phone_number or "-",
                "email": customer.email or "-",
                "branch_id": customer.branch_id,
                "warranty_expiry_date": warranty_map.get(normalized_customer_id),
                "agreement_end_date": agreement_map.get(normalized_customer_id),
                "last_oil_change_sr_type": oil_type_map.get(normalized_customer_id),
                "last_oil_change_date": oil_date_map.get(normalized_customer_id),
                "campaigns": customer_campaign_names,
                "campaign_checkmarks": campaign_checkmarks,
                "campaign_status": campaign_status,
                "campaign_transferred": campaign_transferred,
                "campaign_old_status": campaign_old_status,
                # Display-only history carried from an inactive same-product
                # drive. Deliberately NOT folded into campaign_status: the
                # drive-page counts, status chips and the single-drive
                # "hide rejected" rule must keep counting real work done in
                # THIS drive (otherwise a customer carried in as 'rejected'
                # would be hidden from the new drive entirely).
                "campaign_carry_forward": campaign_carry_forward,
                "followup_flags": followup_flags,
                "latest_status": latest_status,
                "last_followup_date": latest_followup.followup_date if latest_followup else None,
                "last_followup_user": latest_followup.user_name if latest_followup else None,
                "next_followup_date": next_followup_date,
                "last_followup_remark": latest_followup.followup_remark if latest_followup else None
            })
        
        total_count = len(result)
        
        return {
            "from_date": from_date,
            "to_date": to_date,
            # "Post Warranty" rides along as a pseudo-drive so the drive page
            # renders its column/filter chip exactly like a campaign column.
            "active_campaigns": campaign_names + [POST_WARRANTY_NAME],
            "customers": result,
            "total_count": total_count
        }
    
    def _get_followup_flags(self, customer: Customer, latest_followup: Optional[FollowUp]) -> Dict[str, bool]:
        """Determine which follow-up flags are applicable based on actual followups"""
        flags = {"C1": False, "C2": False, "C3": False, "C4": False, "C5": False, "C6": False, "C7": False}
        
        # Only show flags from actual followups
        if latest_followup and latest_followup.followup_flag:
            flags[latest_followup.followup_flag] = True
        
        return flags
    
    # ==================== Customer Details with Follow-ups ====================
    
    def get_customer_engagement_details(self, customer_id: int) -> Dict[str, Any]:
        """Get customer details with all follow-ups, service history and LMS data"""
        
        # First update flag for this customer's latest follow-up
        #self.update_latest_followup_flags(customer_id)
        
        customer = self.db.query(Customer).filter(Customer.id == customer_id).first()
        if not customer:
            raise HTTPException(status_code=404, detail="Customer not found")
        
        # Get all follow-ups for this customer with related data
        followups = self.db.query(FollowUp)\
            .filter(FollowUp.customer_id == customer_id)\
            .order_by(desc(FollowUp.followup_date))\
            .all()
        
        # Get service history from AssetService table using instance_id
        services = []
        if customer.instance_id:
            services = self.db.query(AssetService)\
                .filter(AssetService.instance_id == customer.instance_id)\
                .order_by(desc(AssetService.last_sr_close_date))\
                .all()
        
        # Get LMS data from LMSData table using instance_id
        lms_data = []
        if customer.instance_id:
            lms_data = self.db.query(LMSData)\
                .filter(LMSData.instance_id == customer.instance_id)\
                .order_by(desc(LMSData.lead_created_date))\
                .all()
        
        # Get branch information from first service record
        branch_id = None
        branch_name = None
        if services:
            branch_id = services[0].branch_id
        
        # Normalize customer instance_id
        customer_instance_id = self._normalize_id(customer.instance_id)
        
        # Get all active campaigns
        all_campaigns = self.db.query(Campaign)\
            .filter(Campaign.status == 'active')\
            .all()
        
        # Get campaigns this customer is in based on instance_id matching asset_numbers
        # Pre-parse asset_numbers once per campaign and reuse below for all_campaigns_list
        parsed_assets_by_campaign: Dict[int, List] = {
            c.id: self._parse_asset_numbers(c.asset_numbers)
            for c in all_campaigns
        }
        campaigns = []
        if customer_instance_id:
            for campaign in all_campaigns:
                asset_numbers = parsed_assets_by_campaign[campaign.id]
                # Check if any asset number matches the customer instance_id
                for asset in asset_numbers:
                    if asset and self._compare_ids(asset, customer.instance_id):
                        campaigns.append(campaign)
                        break
        
        # Convert customer to dictionary with all fields from Customer model including branch_id
        customer_dict = {
            "id": customer.id,
            "instance_id": customer.instance_id,
            "customer_name": customer.customer_name,
            "phone_number": customer.phone_number,
            "email": customer.email,
            "location": customer.location,
            "branch_id": branch_id,
            "last_updated_by": customer.last_updated_by,
            "created_at": customer.created_at,
            "updated_at": customer.updated_at
        }
        
        # ========== OPTIMIZATION: Batch-fetch all related campaigns/activities/RRs ==========
        followup_campaign_ids = {f.campaign_id for f in followups if f.campaign_id}
        followup_activity_ids = {f.activity_id for f in followups if f.activity_id}
        followup_rr_ids = {f.rr_id for f in followups if f.rr_id}
        
        campaign_lookup: Dict[int, Campaign] = {}
        if followup_campaign_ids:
            campaign_lookup = {
                c.id: c
                for c in self.db.query(Campaign).filter(Campaign.id.in_(followup_campaign_ids)).all()
            }
        
        activity_lookup: Dict[int, Activity] = {}
        if followup_activity_ids:
            activity_lookup = {
                a.id: a
                for a in self.db.query(Activity).filter(Activity.id.in_(followup_activity_ids)).all()
            }
        
        rr_lookup: Dict[int, RR] = {}
        if followup_rr_ids:
            rr_lookup = {
                r.id: r
                for r in self.db.query(RR).filter(RR.id.in_(followup_rr_ids)).all()
            }
        
        # Convert followups to dictionaries using in-memory lookups (no per-row DB hit)
        followup_dicts = []
        for f in followups:
            campaign_name = None
            campaign_color = None
            campaign_status = None
            campaign_service = None
            if f.campaign_id:
                campaign = campaign_lookup.get(f.campaign_id)
                if campaign:
                    campaign_name = campaign.name
                    campaign_color = campaign.color
                    campaign_service = campaign.service
                    campaign_status = campaign.status
            
            activity_content = None
            if f.activity_id:
                activity = activity_lookup.get(f.activity_id)
                if activity:
                    activity_content = activity.content
            
            rr_content = None
            if f.rr_id:
                rr = rr_lookup.get(f.rr_id)
                if rr:
                    rr_content = rr.content
            
            followup_dicts.append({
                "id": f.id,
                "customer_id": f.customer_id,
                "customer_instance_id": f.customer_instance_id,
                "campaign_id": f.campaign_id,
                "campaign_name": campaign_name,
                "campaign_color": campaign_color,
                "campaign_status": campaign_status,
                "campaign_service": campaign_service,
                "user_id": f.user_id,
                "user_name": f.user_name,
                "followup_date": f.followup_date,
                "followup_by": f.followup_by,
                "followup_flag": f.followup_flag,
                "followup_remark": f.followup_remark,
                "status": f.status,
                "next_followup_date": f.next_followup_date,
                "quotation_sent": f.quotation_sent,
                "quotation_no": f.quotation_no,
                "quotation_value": f.quotation_value,
                "csp_subtype": f.csp_subtype,
                "activity_id": f.activity_id,
                "activity_content": activity_content,
                "rr_id": f.rr_id,
                "rr_content": rr_content,
                "created_at": f.created_at,
                "updated_at": f.updated_at
            })
        
        # Convert services to dictionaries - UPDATED with ALL fields
        service_dicts = []
        for s in services:
            service_dict = {
                "id": s.id,
                "instance_id": s.instance_id,
                "zone_name": s.zone_name,
                "sd_id": s.sd_id,
                "sd_name": s.sd_name,
                "branch_id": s.branch_id,
                "branch_name": s.branch_name,
                "asset_number": s.asset_number,
                "commissioning_date": s.commissioning_date,
                "product_segment": s.product_segment,
                "application_code": s.application_code,
                "engine_serial_no": s.engine_serial_no,
                "account_name": s.account_name,
                "contact_phone_number": s.contact_phone_number,
                "last_closed_sr_number": s.last_closed_sr_number or '-',
                "last_sr_type": s.last_sr_type or '-',
                "last_sr_subtype": s.last_sr_subtype or '-',
                "last_sr_close_date": s.last_sr_close_date,
                "last_oil_change_sr_number": s.last_oil_change_sr_number or '-',
                "last_oil_change_sr_type": s.last_oil_change_sr_type or '-',
                "last_oil_change_sr_sub_type": s.last_oil_change_sr_sub_type or '-',
                "last_oil_change_date": s.last_oil_change_date,
                "installation_site_address": s.installation_site_address,
                "last_service_hrs": s.last_service_hrs or '-',
                "created_at": s.created_at,
                "updated_at": s.updated_at
            }
            service_dicts.append(service_dict)
        
        # Convert LMS data to dictionaries
        lms_dicts = []
        for l in lms_data:
            lms_dict = {
                "id": l.id,
                "instance_id": l.instance_id,
                "product_list": getattr(l, 'product_list', None) or '-',
                "product_type": getattr(l, 'product_type', None) or '-',
                "lead_status": getattr(l, 'lead_status', None) or '-',
                "kva_rating": getattr(l, 'kva_rating', None) or '-',
                "service_engineer_name": getattr(l, 'service_engineer_name', None) or '-',
                "tele_caller_name": getattr(l, 'tele_caller_name', None) or '-',
                "quotation_number": getattr(l, 'quotation_number', None) or '-',
                "quotation_submit_date": getattr(l, 'quotation_submit_date', None),
                "quotation_approval_date": getattr(l, 'quotation_approval_date', None),
                "order_number": getattr(l, 'order_number', None) or '-'
            }
            lms_dicts.append(lms_dict)
        
        # Convert campaigns to dictionaries - include color and scripts
        campaign_dicts = []
        for c in campaigns:
            # Send script METADATA only (no base64). PDFs are fetched on demand
            # via /campaigns/{id}/scripts/{index} when the user opens the panel.
            campaign_dicts.append({
                "id": c.id,
                "name": c.name,
                "service": c.service,
                "description": c.description,
                "color": c.color or "#71C9CE",
                "start_date": c.start_date,
                "end_date": c.end_date,
                "scripts": self._scripts_meta(c)
            })
        
        # Prepare all campaigns list with membership status (reuse parsed asset_numbers)
        all_campaigns_list = []
        for c in all_campaigns:
            is_member = False
            if customer_instance_id:
                asset_numbers = parsed_assets_by_campaign[c.id]
                for asset in asset_numbers:
                    if asset and self._compare_ids(asset, customer.instance_id):
                        is_member = True
                        break
            
            all_campaigns_list.append({
                "id": c.id,
                "name": c.name,
                "service": c.service,
                "color": c.color or "#71C9CE",
                "is_member": is_member,
                "scripts": self._scripts_meta(c)  # metadata only; lazy-load content
            })
        
        # Related assets — all OTHER customer rows with the same name (one indexed query).
        # Used by CampaignEng.jsx multi-assets box. Backward-compatible: CampaignEng2.jsx
        # doesn't read this field, so it can be safely ignored there.
        related_assets = []
        if customer.customer_name:
            trimmed_name = customer.customer_name.strip()
            other_customers = self.db.query(Customer).filter(
                Customer.customer_name == trimmed_name,
                Customer.id != customer.id,
                Customer.instance_id.isnot(None)
            ).limit(50).all()

            # Count how many ACTIVE campaigns each other-asset is in (uses already-parsed maps)
            active_campaign_count_by_instance = {}
            for c in all_campaigns:
                for asset in parsed_assets_by_campaign[c.id]:
                    norm = self._normalize_id(asset)
                    if norm:
                        active_campaign_count_by_instance[norm] = active_campaign_count_by_instance.get(norm, 0) + 1

            # ONE batch query to fetch segment + engine_model + kva_rating for all
            # related assets (avoids N+1 — single indexed IN() lookup on
            # AssetDetailed.instance_id; adding kva_rating costs no extra round-trip)
            asset_info_map = {}
            related_instance_ids = [oc.instance_id for oc in other_customers if oc.instance_id]
            if related_instance_ids:
                asset_rows = self.db.query(
                    AssetDetailed.instance_id,
                    AssetDetailed.segment,
                    AssetDetailed.engine_model,
                    AssetDetailed.kva_rating
                ).filter(AssetDetailed.instance_id.in_(related_instance_ids)).all()
                for inst_id, seg, eng_model, kva in asset_rows:
                    normalized = self._normalize_id(inst_id)
                    if normalized and normalized not in asset_info_map:
                        asset_info_map[normalized] = {
                            "segment": seg,
                            "engine_model": eng_model,
                            "kva_rating": kva
                        }

            for oc in other_customers:
                norm_inst = self._normalize_id(oc.instance_id) if oc.instance_id else None
                camp_count = active_campaign_count_by_instance.get(norm_inst, 0) if norm_inst else 0
                asset_info = asset_info_map.get(norm_inst, {}) if norm_inst else {}
                related_assets.append({
                    "customer_id": oc.id,
                    "instance_id": oc.instance_id,
                    "customer_name": oc.customer_name,
                    "mobile": oc.phone_number or "-",
                    "email": oc.email or "-",
                    "branch_id": oc.branch_id,
                    "segment": asset_info.get("segment"),
                    "engine_model": asset_info.get("engine_model"),
                    "kva_rating": asset_info.get("kva_rating"),
                    # Frontend only reads `.length`, so this matches the existing shape
                    "campaigns": [None] * camp_count,
                })

        # ========== CSP Info ==========
        # If this customer belongs to any active CSP campaign, fetch the uploaded
        # SP Info rows (from campaign_sp_info) matched by instance_id.
        csp_info = []
        csp_campaign_ids = [c.id for c in campaigns if (c.service or '').strip().upper() == 'CSP']
        if customer.instance_id and csp_campaign_ids:
            from app.models.campaign_model import CampaignCSPInfo
            sp_rows = self.db.query(CampaignCSPInfo).filter(
                CampaignCSPInfo.campaign_id.in_(csp_campaign_ids)
            ).all()
            for row in sp_rows:
                if row.instance_id and self._compare_ids(row.instance_id, customer.instance_id):
                    csp_info.append({
                        "branch_id": row.branch_id,
                        "goem_oem": row.goem_oem,
                        "sr_number": row.sr_number,
                        "sr_open_date": row.sr_open_date,
                        "sr_close_date": row.sr_close_date,
                        "sr_subtype": row.sr_subtype,
                        "sr_status": row.sr_status,
                        "segment": row.segment,
                        "application_code": row.application_code,
                    })

        return {
            "customer": customer_dict,
            "followups": followup_dicts,
            "services": service_dicts,
            "lms_data": lms_dicts,
            "campaigns": campaign_dicts,
            "all_campaigns": all_campaigns_list,
            "related_assets": related_assets,
            "csp_info": csp_info
        }
    
    def _get_campaign_scripts(self, campaign: Campaign) -> List[Dict[str, Any]]:
        """Extract scripts from campaign in proper format"""
        scripts = []
        if campaign.scripts:
            script_data = campaign.scripts
            if isinstance(script_data, str):
                try:
                    script_data = json.loads(script_data)
                except:
                    script_data = []
            
            if isinstance(script_data, list):
                for script in script_data:
                    if isinstance(script, dict):
                        if 'content' in script:
                            scripts.append({
                                'type': 'pdf',
                                'name': script.get('name', 'script.pdf'),
                                'content': script.get('content', '')
                            })
                        else:
                            content = script.get('content', '') if isinstance(script, dict) else str(script)
                            scripts.append({
                                'type': 'text',
                                'content': content
                            })
                    else:
                        scripts.append({
                            'type': 'text',
                            'content': str(script)
                        })
        return scripts
    
    # ==================== Follow-up CRUD ====================
    
    def get_followups(self, customer_id: int) -> List[Dict[str, Any]]:
        """Get all follow-ups for a customer as dictionaries"""
        followups = self.db.query(FollowUp)\
            .filter(FollowUp.customer_id == customer_id)\
            .order_by(desc(FollowUp.followup_date))\
            .all()

        # Batch-fetch all referenced campaigns in ONE query (kills the per-row N+1).
        # Campaign.id is the primary key, so a dict lookup is identical to the old
        # per-row .first() by id.
        campaign_ids = list({f.campaign_id for f in followups if f.campaign_id})
        campaign_lookup: Dict[int, Campaign] = {}
        if campaign_ids:
            CHUNK = 1000  # SQL Server 2100-param IN() limit
            for i in range(0, len(campaign_ids), CHUNK):
                chunk = campaign_ids[i:i + CHUNK]
                for c in self.db.query(Campaign).filter(Campaign.id.in_(chunk)).all():
                    campaign_lookup[c.id] = c

        result = []
        for f in followups:
            campaign_name = None
            campaign_color = None
            campaign_status = None
            if f.campaign_id:
                campaign = campaign_lookup.get(f.campaign_id)
                if campaign:
                    campaign_name = campaign.name
                    campaign_color = campaign.color
                    campaign_status = campaign.status
            
            result.append({
                "id": f.id,
                "customer_id": f.customer_id,
                "customer_instance_id": f.customer_instance_id,
                "campaign_id": f.campaign_id,
                "campaign_name": campaign_name,
                "campaign_color": campaign_color,
                "campaign_status": campaign_status,
                "user_id": f.user_id,
                "user_name": f.user_name,
                "followup_date": f.followup_date,
                "followup_by": f.followup_by,
                "followup_flag": f.followup_flag,
                "followup_remark": f.followup_remark,
                "status": f.status,
                "next_followup_date": f.next_followup_date,
                "quotation_sent": f.quotation_sent,
                "quotation_no": f.quotation_no,
                "quotation_value": f.quotation_value,
                "csp_subtype": f.csp_subtype,
                "activity_id": f.activity_id,
                "rr_id": f.rr_id,
                "created_at": f.created_at,
                "updated_at": f.updated_at
            })
        
        return result
    
    def get_followup(self, followup_id: int) -> Dict[str, Any]:
        """Get single follow-up by ID as dictionary"""
        followup = self.db.query(FollowUp).filter(FollowUp.id == followup_id).first()
        if not followup:
            raise HTTPException(status_code=404, detail="Follow-up not found")
        
        campaign_name = None
        campaign_color = None
        campaign_status = None
        if followup.campaign_id:
            campaign = self.db.query(Campaign).filter(Campaign.id == followup.campaign_id).first()
            if campaign:
                campaign_name = campaign.name
                campaign_color = campaign.color
                campaign_status = campaign.status
        
        return {
            "id": followup.id,
            "customer_id": followup.customer_id,
            "customer_instance_id": followup.customer_instance_id,
            "campaign_id": followup.campaign_id,
            "campaign_name": campaign_name,
            "campaign_color": campaign_color,
            "campaign_status": campaign_status,
            "user_id": followup.user_id,
            "user_name": followup.user_name,
            "followup_date": followup.followup_date,
            "followup_for": None,  # Deprecated
            "followup_by": followup.followup_by,
            "followup_flag": followup.followup_flag,
            "followup_remark": followup.followup_remark,
            "status": followup.status,
            "next_followup_date": followup.next_followup_date,
            "quotation_sent": followup.quotation_sent,
            "quotation_no": followup.quotation_no,
            "quotation_value": followup.quotation_value,
            "csp_subtype": followup.csp_subtype,
            "activity_id": followup.activity_id,
            "rr_id": followup.rr_id,
            "created_at": followup.created_at,
            "updated_at": followup.updated_at
        }
    
    # "Not Connected" daily cap — one customer (instance_id) can be marked
    # not_connected at most this many times per calendar day, counted across
    # ALL users and BOTH pages (drive followups + non-drive non_followups).
    NOT_CONNECTED_DAILY_LIMIT = 2

    def _check_not_connected_daily_limit(self, instance_id: Optional[str],
                                         exclude_followup_id: Optional[int] = None,
                                         exclude_non_followup_id: Optional[int] = None) -> None:
        """Raise 400 when today's 'Not Connected' uses for this customer are exhausted."""
        if not instance_id:
            return
        day_start = now_ist().replace(hour=0, minute=0, second=0, microsecond=0)
        day_end = day_start + timedelta(days=1)

        fu_q = self.db.query(FollowUp).filter(
            FollowUp.customer_instance_id == instance_id,
            FollowUp.status == 'not_connected',
            FollowUp.followup_date >= day_start,
            FollowUp.followup_date < day_end
        )
        if exclude_followup_id is not None:
            fu_q = fu_q.filter(FollowUp.id != exclude_followup_id)

        nfu_q = self.db.query(NonFollowUp).filter(
            NonFollowUp.customer_instance_id == instance_id,
            NonFollowUp.status == 'not_connected',
            NonFollowUp.followup_date >= day_start,
            NonFollowUp.followup_date < day_end
        )
        if exclude_non_followup_id is not None:
            nfu_q = nfu_q.filter(NonFollowUp.id != exclude_non_followup_id)

        used = fu_q.count() + nfu_q.count()
        if used >= self.NOT_CONNECTED_DAILY_LIMIT:
            raise HTTPException(
                status_code=400,
                detail=(f"'Not Connected' status can be used only "
                        f"{self.NOT_CONNECTED_DAILY_LIMIT} times per day per customer. "
                        f"This customer already has {used} 'Not Connected' follow-up(s) "
                        f"today.")
            )

    def create_followup(self, customer_id: int, followup: engagement_schema.FollowUpCreate) -> Dict[str, Any]:
        """Create a new follow-up for a customer and return as dictionary"""
        # Check if customer exists
        customer = self.db.query(Customer).filter(Customer.id == customer_id).first()
        if not customer:
            raise HTTPException(status_code=404, detail="Customer not found")
        
        # Check if campaign exists
        campaign = self.db.query(Campaign).filter(Campaign.id == followup.campaign_id).first()
        if not campaign:
            raise HTTPException(status_code=404, detail="Campaign not found")
        
        # Calculate next follow-up date based on flag if not provided
        data = followup.dict()
        
        if not data.get('next_followup_date') and data.get('followup_flag'):
            days = self.FOLLOWUP_FLAGS.get(data['followup_flag'], 10)
            data['next_followup_date'] = now_ist() + timedelta(days=days)
        
        # Ensure followup_date is set
        if not data.get('followup_date'):
            data['followup_date'] = now_ist()
        
        # Remove any fields not in the model
        data.pop('campaign_name', None)
        
        # ADDED: Add customer_instance_id to the data
        data['customer_instance_id'] = self._normalize_id(customer.instance_id)

        # Enforce the daily 'Not Connected' cap (2/day per customer, all users)
        if data.get('status') == 'not_connected':
            self._check_not_connected_daily_limit(data['customer_instance_id'])

        # Create the follow-up object
        db_followup = FollowUp(**data, customer_id=customer_id)
        self.db.add(db_followup)
        self.db.commit()
        self.db.refresh(db_followup)
        invalidate_non_campaign_cache()
        
        # Track if customer was removed from campaign
        removed_from_campaign = False

        # In create_followup, after self.db.refresh(db_followup) and before the completed-status check

        # Auto-add customer to campaign's asset_numbers if not already present
        if customer.instance_id:
            normalized_instance = self._normalize_id(customer.instance_id)
            
            # Re-fetch campaign fresh from DB
            campaign_fresh = self.db.query(Campaign).filter(Campaign.id == followup.campaign_id).first()
            asset_numbers = self._parse_asset_numbers(campaign_fresh.asset_numbers)
            
            already_in = any(
                self._compare_ids(asset, customer.instance_id)
                for asset in asset_numbers
                if asset
            )
            
            if not already_in:
                asset_numbers.append(normalized_instance)
                
                # Use direct SQL UPDATE to force the JSON column update
                from sqlalchemy import text
                self.db.execute(
                    text("UPDATE campaigns SET asset_numbers = :asset_numbers WHERE id = :campaign_id"),
                    {
                        "asset_numbers": json.dumps(asset_numbers),
                        "campaign_id": followup.campaign_id
                    }
                )
                self.db.commit()
        
        # Check if this is a completed follow-up and remove from campaign
        if db_followup.status == 'completed':
            removed_from_campaign = self._remove_customer_from_campaign_if_exists(followup.campaign_id, customer)
        
        # Get campaign info for response
        campaign_name = campaign.name
        campaign_color = campaign.color
        
        return {
            "id": db_followup.id,
            "customer_id": db_followup.customer_id,
            "customer_instance_id": db_followup.customer_instance_id,
            "campaign_id": db_followup.campaign_id,
            "campaign_name": campaign_name,
            "campaign_color": campaign_color,
            "user_id": db_followup.user_id,
            "user_name": db_followup.user_name,
            "followup_date": db_followup.followup_date,
            "followup_by": db_followup.followup_by,
            "followup_flag": db_followup.followup_flag,
            "followup_remark": db_followup.followup_remark,
            "status": db_followup.status,
            "next_followup_date": db_followup.next_followup_date,
            "quotation_sent": db_followup.quotation_sent,
            "quotation_no": db_followup.quotation_no,
            "quotation_value": db_followup.quotation_value,
            "csp_subtype": db_followup.csp_subtype,
            "activity_id": db_followup.activity_id,
            "rr_id": db_followup.rr_id,
            "created_at": db_followup.created_at,
            "updated_at": db_followup.updated_at,
            "removed_from_campaign": removed_from_campaign
        }
    
    def update_followup(self, followup_id: int, followup: engagement_schema.FollowUpUpdate) -> Dict[str, Any]:
        """Update a follow-up and return as dictionary"""
        db_followup = self.db.query(FollowUp).filter(FollowUp.id == followup_id).first()
        if not db_followup:
            raise HTTPException(status_code=404, detail="Follow-up not found")
        
        # Get customer and campaign info before update
        customer = self.db.query(Customer).filter(Customer.id == db_followup.customer_id).first()
        campaign = self.db.query(Campaign).filter(Campaign.id == db_followup.campaign_id).first()
        
        # Store old status to check if it changed to completed
        old_status = db_followup.status
        
        update_data = followup.dict(exclude_unset=True)
        
        # Recalculate next follow-up date if flag changed
        if 'followup_flag' in update_data and update_data['followup_flag'] != db_followup.followup_flag:
            days = self.FOLLOWUP_FLAGS.get(update_data['followup_flag'], 10)
            update_data['next_followup_date'] = now_ist() + timedelta(days=days)
        
        # Remove any fields not in the model
        update_data.pop('campaign_name', None)
        
        # ADDED: Update customer_instance_id if customer has it
        if customer and customer.instance_id:
            update_data['customer_instance_id'] = self._normalize_id(customer.instance_id)

        # Enforce the daily 'Not Connected' cap when CHANGING a row to that status
        if update_data.get('status') == 'not_connected' and old_status != 'not_connected':
            self._check_not_connected_daily_limit(
                update_data.get('customer_instance_id') or db_followup.customer_instance_id,
                exclude_followup_id=followup_id
            )

        for key, value in update_data.items():
            setattr(db_followup, key, value)
        
        db_followup.updated_at = now_ist()
        self.db.commit()
        self.db.refresh(db_followup)
        invalidate_non_campaign_cache()
        
        # Track if customer was removed from campaign
        removed_from_campaign = False
        
        # Check if status changed to completed and remove from campaign
        if old_status != 'completed' and db_followup.status == 'completed':
            if customer and campaign:
                # Remove from campaign and send email
                removed_from_campaign = self._remove_customer_from_campaign_if_exists(campaign.id, customer)
        
        # Get campaign info for response
        campaign_name = None
        campaign_color = None
        if db_followup.campaign_id:
            campaign = self.db.query(Campaign).filter(Campaign.id == db_followup.campaign_id).first()
            if campaign:
                campaign_name = campaign.name
                campaign_color = campaign.color
        
        return {
            "id": db_followup.id,
            "customer_id": db_followup.customer_id,
            "customer_instance_id": db_followup.customer_instance_id,
            "campaign_id": db_followup.campaign_id,
            "campaign_name": campaign_name,
            "campaign_color": campaign_color,
            "user_id": db_followup.user_id,
            "user_name": db_followup.user_name,
            "followup_date": db_followup.followup_date,
            "followup_by": db_followup.followup_by,
            "followup_flag": db_followup.followup_flag,
            "followup_remark": db_followup.followup_remark,
            "status": db_followup.status,
            "next_followup_date": db_followup.next_followup_date,
            "quotation_sent": db_followup.quotation_sent,
            "quotation_no": db_followup.quotation_no,
            "quotation_value": db_followup.quotation_value,
            "csp_subtype": db_followup.csp_subtype,
            "activity_id": db_followup.activity_id,
            "rr_id": db_followup.rr_id,
            "created_at": db_followup.created_at,
            "updated_at": db_followup.updated_at,
            "removed_from_campaign": removed_from_campaign
        }
    
    def delete_followup(self, followup_id: int) -> Dict[str, str]:
        """Delete a follow-up"""
        db_followup = self.db.query(FollowUp).filter(FollowUp.id == followup_id).first()
        if not db_followup:
            raise HTTPException(status_code=404, detail="Follow-up not found")
        
        self.db.delete(db_followup)
        self.db.commit()
        return {"message": "Follow-up deleted successfully"}

    # ==================== Campaign Management ====================
    
    def add_customer_to_campaign(self, campaign_id: int, customer_id: int) -> Dict[str, Any]:
        """Add a customer to a campaign by adding their instance_id to campaign's asset_numbers"""
        campaign = self.db.query(Campaign).filter(Campaign.id == campaign_id).first()
        if not campaign:
            raise HTTPException(status_code=404, detail="Campaign not found")
        
        customer = self.db.query(Customer).filter(Customer.id == customer_id).first()
        if not customer:
            raise HTTPException(status_code=404, detail="Customer not found")
        
        if not customer.instance_id:
            raise HTTPException(status_code=400, detail="Customer does not have an instance_id")
        
        # Normalize customer instance_id
        instance_id_to_store = self._normalize_id(customer.instance_id)
        
        # Parse asset_numbers
        asset_numbers = self._parse_asset_numbers(campaign.asset_numbers)
        
        # Check if customer is already in campaign
        for asset in asset_numbers:
            if asset and self._compare_ids(asset, customer.instance_id):
                raise HTTPException(status_code=400, detail="Customer already in campaign")
        
        # Add customer's instance_id to campaign's asset_numbers
        asset_numbers.append(instance_id_to_store)
        
        # Update campaign with new asset_numbers
        campaign.asset_numbers = asset_numbers
        
        # Commit the changes
        self.db.commit()
        
        # Refresh to get updated data
        self.db.refresh(campaign)
        
        return {
            "message": "Customer added to campaign successfully",
            "campaign_id": campaign.id,
            "campaign_name": campaign.name,
            "customer_id": customer.id,
            "customer_instance_id": instance_id_to_store
        }
    
    def remove_customer_from_campaign(self, campaign_id: int, customer_id: int) -> Dict[str, Any]:
        """Remove a customer from a campaign by removing their instance_id from campaign's asset_numbers"""
        campaign = self.db.query(Campaign).filter(Campaign.id == campaign_id).first()
        if not campaign:
            raise HTTPException(status_code=404, detail="Campaign not found")
        
        customer = self.db.query(Customer).filter(Customer.id == customer_id).first()
        if not customer:
            raise HTTPException(status_code=404, detail="Customer not found")
        
        if not customer.instance_id:
            raise HTTPException(status_code=400, detail="Customer does not have an instance_id")
        
        # Parse asset_numbers
        asset_numbers = self._parse_asset_numbers(campaign.asset_numbers)
        
        if not asset_numbers:
            # Customer is already not in campaign (no assets)
            return {
                "message": "Customer already removed from campaign (no assets)",
                "campaign_id": campaign.id,
                "campaign_name": campaign.name,
                "customer_id": customer.id,
                "customer_instance_id": self._normalize_id(customer.instance_id),
                "already_removed": True
            }
        
        # Find and remove the matching asset number
        found = False
        new_asset_numbers = []
        
        for asset in asset_numbers:
            if asset and self._compare_ids(asset, customer.instance_id):
                found = True
                # Skip this one (remove it)
                continue
            else:
                new_asset_numbers.append(asset)
        
        if not found:
            # Customer not found in campaign - return success anyway since desired state is achieved
            return {
                "message": "Customer already removed from campaign",
                "campaign_id": campaign.id,
                "campaign_name": campaign.name,
                "customer_id": customer.id,
                "customer_instance_id": self._normalize_id(customer.instance_id),
                "already_removed": True
            }
        
        # Update the campaign with the new list
        campaign.asset_numbers = new_asset_numbers
        
        # Commit the changes
        self.db.commit()
        
        # Refresh to get updated data
        self.db.refresh(campaign)
        
        return {
            "message": "Customer removed from campaign successfully",
            "campaign_id": campaign.id,
            "campaign_name": campaign.name,
            "customer_id": customer.id,
            "customer_instance_id": self._normalize_id(customer.instance_id),
            "already_removed": False
        }
    
    # ==================== Activity Management ====================
    
    def get_activities(self) -> List[Dict[str, Any]]:
        """Get all activities (common for all customers)"""
        activities = self.db.query(Activity)\
            .order_by(desc(Activity.created_at))\
            .all()
        
        return [{
            "id": a.id,
            "content": a.content,
            "created_at": a.created_at,
            "updated_at": a.updated_at
        } for a in activities]
    
    def create_activity(self, activity_data: engagement_schema.ActivityCreate) -> Dict[str, Any]:
        """Create a new activity (common for all customers)"""
        db_activity = Activity(
            content=activity_data.content
        )
        self.db.add(db_activity)
        self.db.commit()
        self.db.refresh(db_activity)
        
        return {
            "id": db_activity.id,
            "content": db_activity.content,
            "created_at": db_activity.created_at,
            "updated_at": db_activity.updated_at
        }
    
    def update_activity(self, activity_id: int, activity_data: engagement_schema.ActivityUpdate) -> Dict[str, Any]:
        """Update an activity"""
        db_activity = self.db.query(Activity).filter(Activity.id == activity_id).first()
        if not db_activity:
            raise HTTPException(status_code=404, detail="Activity not found")
        
        db_activity.content = activity_data.content
        db_activity.updated_at = now_ist()
        self.db.commit()
        self.db.refresh(db_activity)
        
        return {
            "id": db_activity.id,
            "content": db_activity.content,
            "created_at": db_activity.created_at,
            "updated_at": db_activity.updated_at
        }
    
    def delete_activity(self, activity_id: int) -> Dict[str, str]:
        """Delete an activity"""
        from sqlalchemy.exc import IntegrityError
        
        db_activity = self.db.query(Activity).filter(Activity.id == activity_id).first()
        if not db_activity:
            raise HTTPException(status_code=404, detail="Activity not found")
        
        try:
            self.db.delete(db_activity)
            self.db.commit()
            return {"message": "Activity deleted successfully"}
        except IntegrityError:
            self.db.rollback()
            raise HTTPException(
                status_code=409,
                detail="This activity is already in use in one or more follow-ups and cannot be removed."
            )
        except Exception as e:
            self.db.rollback()
            raise HTTPException(
                status_code=500,
                detail=f"Failed to delete activity: {str(e)}"
            )
    
    # ==================== RR Management ====================
    
    def get_rr(self) -> List[Dict[str, Any]]:
        """Get all RR entries (common for all customers)"""
        rr_entries = self.db.query(RR)\
            .order_by(desc(RR.created_at))\
            .all()
        
        return [{
            "id": r.id,
            "content": r.content,
            "created_at": r.created_at,
            "updated_at": r.updated_at
        } for r in rr_entries]
    
    def create_rr(self, rr_data: engagement_schema.RRCreate) -> Dict[str, Any]:
        """Create a new RR entry (common for all customers)"""
        db_rr = RR(
            content=rr_data.content
        )
        self.db.add(db_rr)
        self.db.commit()
        self.db.refresh(db_rr)
        
        return {
            "id": db_rr.id,
            "content": db_rr.content,
            "created_at": db_rr.created_at,
            "updated_at": db_rr.updated_at
        }
    
    def update_rr(self, rr_id: int, rr_data: engagement_schema.RRUpdate) -> Dict[str, Any]:
        """Update an RR entry"""
        db_rr = self.db.query(RR).filter(RR.id == rr_id).first()
        if not db_rr:
            raise HTTPException(status_code=404, detail="RR entry not found")
        
        db_rr.content = rr_data.content
        db_rr.updated_at = now_ist()
        self.db.commit()
        self.db.refresh(db_rr)
        
        return {
            "id": db_rr.id,
            "content": db_rr.content,
            "created_at": db_rr.created_at,
            "updated_at": db_rr.updated_at
        }
    
    def delete_rr(self, rr_id: int) -> Dict[str, str]:
        """Delete an RR entry"""
        from sqlalchemy.exc import IntegrityError
        
        db_rr = self.db.query(RR).filter(RR.id == rr_id).first()
        if not db_rr:
            raise HTTPException(status_code=404, detail="RR entry not found")
        
        try:
            self.db.delete(db_rr)
            self.db.commit()
            return {"message": "RR entry deleted successfully"}
        except IntegrityError:
            self.db.rollback()
            raise HTTPException(
                status_code=409,
                detail="This reject reason is already in use in one or more follow-ups and cannot be removed."
            )
        except Exception as e:
            self.db.rollback()
            raise HTTPException(
                status_code=500,
                detail=f"Failed to delete reject reason: {str(e)}"
            )
    
    # ----- cheap fingerprint of active campaigns -----
    def _non_campaign_signature(self):
        rows = self.db.query(Campaign.id, Campaign.updated_at)\
            .filter(Campaign.status == 'active').all()
        return hash(tuple(sorted((r.id, str(r.updated_at)) for r in rows)))

    # ----- one latest non_followup row per customer (reusable) -----
    def _windowed_latest_for_ids(self, customer_ids, active_only, with_next_only=False, with_flag_only=False):
        out = {}
        if not customer_ids:
            return out
        CHUNK = 1000  # SQL Server 2100-param IN() limit
        for i in range(0, len(customer_ids), CHUNK):
            chunk = customer_ids[i:i + CHUNK]
            q = self.db.query(
                NonFollowUp.customer_id.label('cid'),
                NonFollowUp.status.label('status'),
                NonFollowUp.next_followup_date.label('nfd'),
                NonFollowUp.followup_date.label('fd'),
                NonFollowUp.user_name.label('un'),
                NonFollowUp.followup_remark.label('rem'),
                NonFollowUp.followup_flag.label('flag'),
                func.row_number().over(
                    partition_by=NonFollowUp.customer_id,
                    order_by=[desc(NonFollowUp.followup_date), desc(NonFollowUp.id)],
                ).label('rn'),
            ).filter(NonFollowUp.customer_id.in_(chunk))
            if active_only:
                q = q.filter(NonFollowUp.status.notin_(['rejected', 'completed']))
            if with_next_only:
                q = q.filter(NonFollowUp.next_followup_date.isnot(None))
            if with_flag_only:
                q = q.filter(NonFollowUp.followup_flag.isnot(None),
                             NonFollowUp.followup_flag != '')
            sub = q.subquery()
            for r in self.db.query(sub).filter(sub.c.rn == 1).all():
                out[r.cid] = r
        return out

    # ----- next date + flag for the LATEST SAVE (batch-aware) -----
    def _batch_next_and_flag(self, latest, nfd_row, flag_row):
        """One save can create several followup rows within moments of each
        other. Each value is taken INDEPENDENTLY from the newest same-batch
        row (within 5 minutes of the latest) that has it: NC saved last still
        shows the WIP/FR sibling's flag; a rejected row saved last still shows
        the sibling's next date. Values from earlier saves stay hidden.
        The flag is computed LIVE from the flag row's own next date, so it
        rolls C3→C2→C1 day by day without a background updater."""
        if not latest:
            return None, None

        def in_batch(r):
            return (r is not None and latest.fd and r.fd
                    and (latest.fd - r.fd).total_seconds() <= 300)

        nfd = nfd_row.nfd if in_batch(nfd_row) else None
        flag = self._flag_for_next_date(flag_row.nfd, flag_row.flag) if in_batch(flag_row) else None
        return nfd, flag

    # ----- HEAVY work, done ONCE and cached -----
    def _build_non_campaign_index(self):
        active_campaigns = self.db.query(Campaign).filter(Campaign.status == 'active').all()
        campaign_customer_ids = set()
        for campaign in active_campaigns:
            for asset in self._parse_asset_numbers(campaign.asset_numbers):
                norm = self._normalize_id(asset)
                if norm:
                    campaign_customer_ids.add(norm)

        cust_rows = self.db.query(
            Customer.id, Customer.instance_id, Customer.branch_id,
            Customer.customer_name, Customer.phone_number, Customer.email,
        ).filter(Customer.instance_id.isnot(None)).all()

        non_campaign = [
            c for c in cust_rows
            if c.instance_id and self._normalize_id(c.instance_id) not in campaign_customer_ids
        ]
        all_ids = [c.id for c in non_campaign]

        latest_map = self._windowed_latest_for_ids(all_ids, active_only=False)
        # newest rows that HAVE a next date / flag — same-save batch fallbacks
        next_map = self._windowed_latest_for_ids(all_ids, active_only=False, with_next_only=True)
        flag_map = self._windowed_latest_for_ids(all_ids, active_only=False, with_flag_only=True)

        rows_by_id = {}
        enriched = []  # (cid, status, nfd, fd)
        for c in non_campaign:
            latest = latest_map.get(c.id)
            status = latest.status if latest else None
            # Next date + flag from the latest SAVE (batch-aware) — each taken
            # independently from the newest same-batch row that has it.
            batch_nfd, batch_flag = self._batch_next_and_flag(latest, next_map.get(c.id), flag_map.get(c.id))
            flag_src = type("F", (), {"followup_flag": batch_flag})()
            rows_by_id[c.id] = {
                "customer_id": c.id,
                "instance_id": c.instance_id,
                "branch_id": c.branch_id,
                "customer_name": c.customer_name or "Unknown",
                "mobile": c.phone_number or "-",
                "email": c.email or "-",
                "followup_flags": self._get_followup_flags(c, flag_src),
                "latest_status": status,
                "last_followup_date": latest.fd if latest else None,
                "last_followup_user": latest.un if latest else None,
                "next_followup_date": batch_nfd,
                "last_followup_remark": latest.rem if latest else None,
            }
            enriched.append((c.id, status, batch_nfd,
                             latest.fd if latest else None))

        def order_for(completed_first):
            def tier(status):
                if status == 'completed':
                    return 0 if completed_first else 2
                if status:
                    return 1 if completed_first else 0
                return 2 if completed_first else 1

            def key(e):
                _cid, status, nfd, _fd = e
                return (tier(status), nfd is None, nfd or datetime.max)

            return [e[0] for e in sorted(enriched, key=key)]

        return rows_by_id, {True: order_for(True), False: order_for(False)}

    # ----- scripts METADATA only (NO base64) -----
    def _scripts_meta(self, campaign):
        out = []
        data = campaign.scripts
        if not data:
            return out
        if isinstance(data, str):
            try:
                data = json.loads(data)
            except Exception:
                data = []
        if isinstance(data, list):
            for i, script in enumerate(data):
                if isinstance(script, dict):
                    if 'content' in script:
                        out.append({"type": "pdf",
                                    "name": script.get('name', 'script.pdf'),
                                    "index": i, "has_content": True})
                    else:
                        out.append({"type": "text", "content": script.get('content', '')})
                else:
                    out.append({"type": "text", "content": str(script)})
        return out

    # ----- lazy PDF fetch (one script's base64) -----
    def get_campaign_script_pdf(self, campaign_id, script_index):
        campaign = self.db.query(Campaign).filter(Campaign.id == campaign_id).first()
        if not campaign:
            raise HTTPException(status_code=404, detail="Campaign not found")
        scripts = self._get_campaign_scripts(campaign)
        if script_index < 0 or script_index >= len(scripts):
            raise HTTPException(status_code=404, detail="Script not found")
        return scripts[script_index]

    # ----- SEARCH path: direct, indexed, capped -----
    def _search_non_campaign_customers(self, term, page, limit, completed_first):
        from app.models.campaign_model import CampaignService

        active_campaigns = self.db.query(Campaign).filter(Campaign.status == 'active').all()
        campaign_customer_ids = set()
        for campaign in active_campaigns:
            for asset in self._parse_asset_numbers(campaign.asset_numbers):
                norm = self._normalize_id(asset)
                if norm:
                    campaign_customer_ids.add(norm)

        like = f"%{term}%"
        cust = self.db.query(
            Customer.id, Customer.instance_id, Customer.branch_id,
            Customer.customer_name, Customer.phone_number, Customer.email,
        ).filter(
            Customer.instance_id.isnot(None),
            or_(
                Customer.instance_id == term,
                Customer.instance_id.like(f"{term}%"),
                Customer.phone_number.like(f"{term}%"),
                Customer.customer_name.like(like),
                Customer.email.like(like),
            )
        ).limit(1000).all()

        # Also match by follow-up USER name — customers whose non-drive
        # follow-ups were done by a user matching the term. Verified below
        # against the LATEST follow-up, so this behaves as a
        # "Last Follow-up User" search.
        base_ids = {c.id for c in cust}
        user_customer_ids = [r[0] for r in self.db.query(NonFollowUp.customer_id)
                             .filter(NonFollowUp.user_name.like(like),
                                     NonFollowUp.customer_id.isnot(None))
                             .distinct().limit(1000).all()]
        extra_ids = [i for i in user_customer_ids if i not in base_ids]
        if extra_ids:
            extra_rows = []
            for i in range(0, len(extra_ids), 1000):
                extra_rows += self.db.query(
                    Customer.id, Customer.instance_id, Customer.branch_id,
                    Customer.customer_name, Customer.phone_number, Customer.email,
                ).filter(
                    Customer.id.in_(extra_ids[i:i + 1000]),
                    Customer.instance_id.isnot(None),
                ).all()
            cust = list(cust) + extra_rows

        non_campaign = [c for c in cust
                        if c.instance_id and self._normalize_id(c.instance_id) not in campaign_customer_ids]
        ids = [c.id for c in non_campaign]
        latest_map = self._windowed_latest_for_ids(ids, active_only=False)
        next_map = self._windowed_latest_for_ids(ids, active_only=False, with_next_only=True)
        flag_map = self._windowed_latest_for_ids(ids, active_only=False, with_flag_only=True)

        result = []
        for idx, c in enumerate(non_campaign, start=1):
            latest = latest_map.get(c.id)
            # Next date + flag from the latest SAVE (batch-aware) — same rule
            # as the main list (see _batch_next_and_flag).
            batch_nfd, batch_flag = self._batch_next_and_flag(latest, next_map.get(c.id), flag_map.get(c.id))
            flag_src = type("F", (), {"followup_flag": batch_flag})()
            result.append({
                "sr_no": idx, "customer_id": c.id, "instance_id": c.instance_id,
                "branch_id": c.branch_id, "customer_name": c.customer_name or "Unknown",
                "mobile": c.phone_number or "-", "email": c.email or "-",
                "warranty_expiry_date": None, "agreement_end_date": None,
                "last_oil_change_sr_type": None, "last_oil_change_date": None,
                "campaigns": [], "campaign_checkmarks": {}, "campaign_status": {},
                "followup_flags": self._get_followup_flags(c, flag_src),
                "latest_status": latest.status if latest else None,
                "last_followup_date": latest.fd if latest else None,
                "last_followup_user": latest.un if latest else None,
                "next_followup_date": batch_nfd,
                "last_followup_remark": latest.rem if latest else None,
            })

        # User-name matches count only when the LAST follow-up user matches —
        # rows found via the base query (id/name/phone/email) always stay.
        term_lower = term.lower()
        result = [r for r in result
                  if r["customer_id"] in base_ids
                  or term_lower in (r.get("last_followup_user") or "").lower()]
        for i, r in enumerate(result, start=1):
            r["sr_no"] = i

        all_campaigns_list = [{
            "id": c.id, "name": c.name, "service": c.service,
            "color": c.color or "#71C9CE", "scripts": self._scripts_meta(c),
        } for c in active_campaigns]
        campaign_services = self.db.query(CampaignService).order_by(CampaignService.name).all()

        return {
            "from_date": None, "to_date": None, "page": 1, "limit": limit,
            "total_count": len(result), "has_more": False, "customers": result,
            "all_campaigns": all_campaigns_list,
            "campaign_services": [{"id": cs.id, "name": cs.name} for cs in campaign_services],
        }

    # ----- PUBLIC: now cheap per page -----
    def get_non_campaign_customers(self, page: int = 1, limit: int = 20, search: Optional[str] = None,
                                   from_date: Optional[str] = None, to_date: Optional[str] = None,
                                   completed_first: bool = False) -> Dict[str, Any]:
        from app.models.campaign_model import CampaignService
        try:
            is_search = bool(search and search.strip())
            if is_search:
                return self._search_non_campaign_customers(search.strip(), page, limit, completed_first)

            start_date = end_date = None
            if from_date:
                try:
                    start_date = datetime.strptime(from_date, '%Y-%m-%d')
                except Exception:
                    start_date = datetime.fromisoformat(from_date.replace('Z', '+00:00'))
            if to_date:
                try:
                    end_date = datetime.strptime(to_date, '%Y-%m-%d').replace(hour=23, minute=59, second=59)
                except Exception:
                    end_date = datetime.fromisoformat(to_date.replace('Z', '+00:00')).replace(hour=23, minute=59, second=59)

            now = time.time()
            signature = self._non_campaign_signature()
            with _NC_CACHE_LOCK:
                valid = (_NC_CACHE["signature"] == signature
                         and (now - _NC_CACHE["built_at"]) < _NC_CACHE_TTL
                         and _NC_CACHE["orders"])
            if not valid:
                rows_by_id, orders = self._build_non_campaign_index()
                with _NC_CACHE_LOCK:
                    _NC_CACHE["signature"] = signature
                    _NC_CACHE["built_at"] = now
                    _NC_CACHE["orders"] = orders
                    _NC_CACHE["rows"] = rows_by_id
            with _NC_CACHE_LOCK:
                rows_by_id = _NC_CACHE["rows"]
                order = list(_NC_CACHE["orders"][bool(completed_first)])

            if start_date or end_date:
                def in_range(cid):
                    fd = rows_by_id[cid]["last_followup_date"]
                    if not fd:
                        return False
                    if start_date and fd < start_date:
                        return False
                    if end_date and fd > end_date:
                        return False
                    return True
                order = [cid for cid in order if in_range(cid)]

            total_count = len(order)
            start_idx = (page - 1) * limit
            page_ids = order[start_idx:start_idx + limit]

            page_inst = [rows_by_id[cid]["instance_id"] for cid in page_ids if rows_by_id[cid]["instance_id"]]
            page_norm = list({self._normalize_id(i) for i in page_inst})
            warranty_map, agreement_map = {}, {}
            oil_type_map, oil_date_map = {}, {}
            CHUNK = 1000
            if page_norm:
                for i in range(0, len(page_norm), CHUNK):
                    chunk = page_norm[i:i + CHUNK]
                    for inst_id, warranty in self.db.query(
                        AssetDetailed.instance_id, AssetDetailed.warranty_expiry_date
                    ).filter(AssetDetailed.instance_id.in_(chunk)).all():
                        n = self._normalize_id(inst_id)
                        if n and n not in warranty_map:
                            warranty_map[n] = warranty
                for i in range(0, len(page_norm), CHUNK):
                    chunk = page_norm[i:i + CHUNK]
                    for inst_id, end_d, _ in self.db.query(
                        AMCAgreement.instance_id, AMCAgreement.agreement_end_date,
                        AMCAgreement.agreement_start_date
                    ).filter(AMCAgreement.instance_id.in_(chunk)).order_by(
                        desc(AMCAgreement.agreement_start_date)
                    ).all():
                        n = self._normalize_id(inst_id)
                        if n and n not in agreement_map:
                            agreement_map[n] = end_d
                # Last oil-change info from oil_services (AssetService) — one
                # indexed batch query per page, same pattern as warranty/agreement.
                for i in range(0, len(page_norm), CHUNK):
                    chunk = page_norm[i:i + CHUNK]
                    for inst_id, oc_type, oc_date in self.db.query(
                        AssetService.instance_id,
                        AssetService.last_oil_change_sr_type,
                        AssetService.last_oil_change_date
                    ).filter(AssetService.instance_id.in_(chunk)).all():
                        n = self._normalize_id(inst_id)
                        if n and n not in oil_type_map:
                            oil_type_map[n] = oc_type
                            oil_date_map[n] = oc_date

            result = []
            for idx, cid in enumerate(page_ids, start=start_idx + 1):
                base = rows_by_id[cid]
                norm = self._normalize_id(base["instance_id"]) if base["instance_id"] else None
                result.append({
                    "sr_no": idx,
                    "campaigns": [], "campaign_checkmarks": {}, "campaign_status": {},
                    "warranty_expiry_date": warranty_map.get(norm) if norm else None,
                    "agreement_end_date": agreement_map.get(norm) if norm else None,
                    "last_oil_change_sr_type": oil_type_map.get(norm) if norm else None,
                    "last_oil_change_date": oil_date_map.get(norm) if norm else None,
                    **base,
                })

            active_campaigns = self.db.query(Campaign).filter(Campaign.status == 'active').all()
            all_campaigns_list = [{
                "id": c.id, "name": c.name, "service": c.service,
                "color": c.color or "#71C9CE", "scripts": self._scripts_meta(c),
            } for c in active_campaigns]
            campaign_services = self.db.query(CampaignService).order_by(CampaignService.name).all()

            return {
                "from_date": from_date, "to_date": to_date,
                "page": page, "limit": limit, "total_count": total_count,
                "has_more": (start_idx + len(page_ids)) < total_count,
                "customers": result,
                "all_campaigns": all_campaigns_list,
                "campaign_services": [{"id": cs.id, "name": cs.name} for cs in campaign_services],
            }

        except Exception as e:
            print(f"Error in get_non_campaign_customers: {str(e)}")
            import traceback
            traceback.print_exc()
            return {
                "from_date": from_date, "to_date": to_date,
                "page": page, "limit": limit, "total_count": 0,
                "has_more": False, "customers": [],
                "all_campaigns": [], "campaign_services": [],
            }
    
    def get_customer_non_followups(self, customer_id: int) -> List[Dict[str, Any]]:
        """Get all non-follow-ups (other type) for a customer"""
        non_followups = self.db.query(NonFollowUp)\
            .filter(NonFollowUp.customer_id == customer_id)\
            .order_by(desc(NonFollowUp.followup_date))\
            .all()

        # Batch-fetch all referenced campaigns/activities/RRs in ONE query each
        # (kills the per-row N+1). All three are primary-key lookups, so a dict
        # lookup returns exactly what the old per-row .first() by id returned.
        campaign_ids = list({nf.campaign_id for nf in non_followups if nf.campaign_id})
        activity_ids = list({nf.activity_id for nf in non_followups if nf.activity_id})
        rr_ids = list({nf.rr_id for nf in non_followups if nf.rr_id})

        CHUNK = 1000  # SQL Server 2100-param IN() limit
        campaign_lookup: Dict[int, Campaign] = {}
        for i in range(0, len(campaign_ids), CHUNK):
            for c in self.db.query(Campaign).filter(Campaign.id.in_(campaign_ids[i:i + CHUNK])).all():
                campaign_lookup[c.id] = c

        activity_lookup: Dict[int, Activity] = {}
        for i in range(0, len(activity_ids), CHUNK):
            for a in self.db.query(Activity).filter(Activity.id.in_(activity_ids[i:i + CHUNK])).all():
                activity_lookup[a.id] = a

        rr_lookup: Dict[int, RR] = {}
        for i in range(0, len(rr_ids), CHUNK):
            for r in self.db.query(RR).filter(RR.id.in_(rr_ids[i:i + CHUNK])).all():
                rr_lookup[r.id] = r

        result = []
        for nf in non_followups:
            campaign_name = None
            campaign_color = None
            if nf.campaign_id:
                campaign = campaign_lookup.get(nf.campaign_id)
                if campaign:
                    campaign_name = campaign.name
                    campaign_color = campaign.color

            activity_content = None
            if nf.activity_id:
                activity = activity_lookup.get(nf.activity_id)
                if activity:
                    activity_content = activity.content

            rr_content = None
            if nf.rr_id:
                rr = rr_lookup.get(nf.rr_id)
                if rr:
                    rr_content = rr.content
            
            result.append({
                "id": nf.id,
                "customer_id": nf.customer_id,
                "customer_instance_id": nf.customer_instance_id,
                "campaign_id": nf.campaign_id,
                "campaign_name": campaign_name if nf.campaign_id else "Post Warranty",
                "campaign_color": campaign_color,
                "user_id": nf.user_id,
                "user_name": nf.user_name,
                "followup_date": nf.followup_date,
                "followup_by": nf.followup_by,
                "followup_remark": nf.followup_remark or "*",  # Show * if no remark
                "status": nf.status,
                "remark_type": nf.remark_type,
                "service": nf.service,  # in get_customer_non_followups
                "followup_flag": nf.followup_flag,
                "next_followup_date": nf.next_followup_date,
                "quotation_sent": nf.quotation_sent,
                "quotation_no": nf.quotation_no,
                "quotation_value": nf.quotation_value,
                "activity_id": nf.activity_id,
                "activity_content": activity_content,
                "rr_id": nf.rr_id,
                "rr_content": rr_content,
                "created_at": nf.created_at,
                "updated_at": nf.updated_at
            })
        
        return result
    
    
    def get_non_followup(self, non_followup_id: int) -> Dict[str, Any]:
        """Get a single non-follow-up by ID"""
        non_followup = self.db.query(NonFollowUp).filter(NonFollowUp.id == non_followup_id).first()
        if not non_followup:
            raise HTTPException(status_code=404, detail="Non-follow-up not found")
        
        campaign_name = None
        campaign_color = None
        if non_followup.campaign_id:
            campaign = self.db.query(Campaign).filter(Campaign.id == non_followup.campaign_id).first()
            if campaign:
                campaign_name = campaign.name
                campaign_color = campaign.color
        
        activity_content = None
        if non_followup.activity_id:
            activity = self.db.query(Activity).filter(Activity.id == non_followup.activity_id).first()
            if activity:
                activity_content = activity.content
        
        rr_content = None
        if non_followup.rr_id:
            rr = self.db.query(RR).filter(RR.id == non_followup.rr_id).first()
            if rr:
                rr_content = rr.content
        
        return {
            "id": non_followup.id,
            "customer_id": non_followup.customer_id,
            "customer_instance_id": non_followup.customer_instance_id,
            "campaign_id": non_followup.campaign_id,
            "campaign_name": campaign_name,
            "campaign_color": campaign_color,
            "user_id": non_followup.user_id,
            "user_name": non_followup.user_name,
            "followup_date": non_followup.followup_date,
            "followup_by": non_followup.followup_by,
            "followup_remark": non_followup.followup_remark or "*",
            "status": non_followup.status,
            "remark_type": non_followup.remark_type,
            "followup_flag": non_followup.followup_flag,
            "next_followup_date": non_followup.next_followup_date,
            "quotation_sent": non_followup.quotation_sent,
            "quotation_no": non_followup.quotation_no,
            "quotation_value": non_followup.quotation_value,
            "activity_id": non_followup.activity_id,
            "activity_content": activity_content,
            "rr_id": non_followup.rr_id,
            "rr_content": rr_content,
            "created_at": non_followup.created_at,
            "updated_at": non_followup.updated_at
        }
    
    
    def create_non_followup(self, customer_id: int, non_followup_data: engagement_schema.NonFollowUpCreate) -> Dict[str, Any]:
        """Create a new non-follow-up (other type) with required remark"""
        # Check if customer exists
        customer = self.db.query(Customer).filter(Customer.id == customer_id).first()
        if not customer:
            raise HTTPException(status_code=404, detail="Customer not found")
        
        # Get data as dict
        data = non_followup_data.dict()
        
        # For "Other" type, campaign_id should be None (not 0)
        data['campaign_id'] = None
        
        # Calculate next follow-up date based on flag if not provided
        if not data.get('next_followup_date') and data.get('followup_flag'):
            days = self.FOLLOWUP_FLAGS.get(data['followup_flag'], 10)
            data['next_followup_date'] = now_ist() + timedelta(days=days)
        
        # Ensure followup_date is set
        if not data.get('followup_date'):
            data['followup_date'] = now_ist()
        
        # Set remark from user input
        data['followup_remark'] = data.get('followup_remark')
        data['remark_type'] = "other"
        
        # Remove any fields not in the model
        data.pop('campaign_name', None)
        
        # Add customer_instance_id to the data
        data['customer_instance_id'] = self._normalize_id(customer.instance_id)

        # Enforce the daily 'Not Connected' cap (2/day per customer, all users)
        if data.get('status') == 'not_connected':
            self._check_not_connected_daily_limit(data['customer_instance_id'])

        # Create the non-follow-up object
        db_non_followup = NonFollowUp(**data, customer_id=customer_id)
        self.db.add(db_non_followup)
        self.db.commit()
        self.db.refresh(db_non_followup)
        invalidate_non_campaign_cache()
        
        # Return response with campaign_name as "Post Warranty"
        return {
            "id": db_non_followup.id,
            "customer_id": db_non_followup.customer_id,
            "customer_instance_id": db_non_followup.customer_instance_id,
            "campaign_id": None,  # No campaign associated
            "campaign_name": "Post Warranty",  # Display name
            "campaign_color": "#9CA3AF",  # Gray color for Post Warranty
            "user_id": db_non_followup.user_id,
            "user_name": db_non_followup.user_name,
            "followup_date": db_non_followup.followup_date,
            "followup_by": db_non_followup.followup_by,
            "followup_remark": db_non_followup.followup_remark,
            "status": db_non_followup.status,
            "remark_type": db_non_followup.remark_type,
            "service": db_non_followup.service,
            "followup_flag": db_non_followup.followup_flag,
            "next_followup_date": db_non_followup.next_followup_date,
            "quotation_sent": db_non_followup.quotation_sent,
            "quotation_no": db_non_followup.quotation_no,
            "quotation_value": db_non_followup.quotation_value,
            "activity_id": db_non_followup.activity_id,
            "rr_id": db_non_followup.rr_id,
            "created_at": db_non_followup.created_at,
            "updated_at": db_non_followup.updated_at
        }
    
    def update_non_followup(self, non_followup_id: int, non_followup_data: engagement_schema.NonFollowUpUpdate) -> Dict[str, Any]:
        """Update a non-follow-up"""
        db_non_followup = self.db.query(NonFollowUp).filter(NonFollowUp.id == non_followup_id).first()
        if not db_non_followup:
            raise HTTPException(status_code=404, detail="Non-follow-up not found")
        
        update_data = non_followup_data.dict(exclude_unset=True)
        
        # Recalculate next follow-up date if flag changed
        if 'followup_flag' in update_data and update_data['followup_flag'] != db_non_followup.followup_flag:
            days = self.FOLLOWUP_FLAGS.get(update_data['followup_flag'], 10)
            update_data['next_followup_date'] = now_ist() + timedelta(days=days)
        
        # Remove any fields not in the model
        update_data.pop('campaign_name', None)

        # Enforce the daily 'Not Connected' cap when CHANGING a row to that status
        if update_data.get('status') == 'not_connected' and db_non_followup.status != 'not_connected':
            self._check_not_connected_daily_limit(
                db_non_followup.customer_instance_id,
                exclude_non_followup_id=non_followup_id
            )

        for key, value in update_data.items():
            setattr(db_non_followup, key, value)

        db_non_followup.updated_at = now_ist()
        self.db.commit()
        self.db.refresh(db_non_followup)
        invalidate_non_campaign_cache()

        # Get campaign info for response
        campaign_name = None
        campaign_color = None
        if db_non_followup.campaign_id:
            campaign = self.db.query(Campaign).filter(Campaign.id == db_non_followup.campaign_id).first()
            if campaign:
                campaign_name = campaign.name
                campaign_color = campaign.color
        
        return {
            "id": db_non_followup.id,
            "customer_id": db_non_followup.customer_id,
            "customer_instance_id": db_non_followup.customer_instance_id,
            "campaign_id": db_non_followup.campaign_id,
            "campaign_name": campaign_name,
            "campaign_color": campaign_color,
            "user_id": db_non_followup.user_id,
            "user_name": db_non_followup.user_name,
            "followup_date": db_non_followup.followup_date,
            "followup_by": db_non_followup.followup_by,
            "followup_remark": db_non_followup.followup_remark,
            "status": db_non_followup.status,
            "remark_type": db_non_followup.remark_type,
            "service": db_non_followup.service,  # in update_non_followup
            "followup_flag": db_non_followup.followup_flag,
            "next_followup_date": db_non_followup.next_followup_date,
            "quotation_sent": db_non_followup.quotation_sent,
            "quotation_no": db_non_followup.quotation_no,
            "quotation_value": db_non_followup.quotation_value,
            "activity_id": db_non_followup.activity_id,
            "rr_id": db_non_followup.rr_id,
            "created_at": db_non_followup.created_at,
            "updated_at": db_non_followup.updated_at
        }
    
    
    def delete_non_followup(self, non_followup_id: int) -> Dict[str, str]:
        """Delete a non-follow-up"""
        db_non_followup = self.db.query(NonFollowUp).filter(NonFollowUp.id == non_followup_id).first()
        if not db_non_followup:
            raise HTTPException(status_code=404, detail="Non-follow-up not found")
        
        self.db.delete(db_non_followup)
        self.db.commit()
        invalidate_non_campaign_cache()

        return {"message": "Non-follow-up deleted successfully"}

# ==================== CSP Status (branch-wise) ====================

    def _maxttr_closed_csp_pairs(self, pairs) -> set:
        """(normalized instance_id, sr_number) pairs the 'MaxTTR - Oil Change SR
        Zero Labour Flag' file has already closed.

        That file is the SR closure record (same rule as
        CustomerController._sr_closed_in_maxttr — matched on BOTH columns, the
        upsert key of both tables). CampaignController.auto_complete_csp_srs_closed_in_maxttr
        completes those assets in their CSP drive; this set keeps them out of the
        Total CSP / Open CSP counts too, so a drive that has not been re-synced
        yet still shows the right numbers.

        `pairs` is an iterable of (instance_id, sr_number) as stored on the CSP
        Info rows. Looked up chunked, with both the raw and normalized instance
        form, so '.0'-formatted ids still match.
        """
        from app.models.customer_model import MaxTTROilChangeSRZeroLabourFlag

        candidates = set()
        for inst, sr in pairs:
            if not inst or not sr:
                continue
            candidates.add(str(inst).strip())
            norm = self._normalize_id(inst)
            if norm:
                candidates.add(norm)
        cand_list = [c for c in candidates if c]
        if not cand_list:
            return set()

        closed = set()
        for i in range(0, len(cand_list), 1000):
            for inst, sr in self.db.query(
                MaxTTROilChangeSRZeroLabourFlag.instance_id,
                MaxTTROilChangeSRZeroLabourFlag.sr_number,
            ).filter(MaxTTROilChangeSRZeroLabourFlag.instance_id.in_(cand_list[i:i + 1000])).all():
                norm = self._normalize_id(inst)
                if norm:
                    closed.add((norm, (sr or '').strip()))
        return closed

    def get_csp_status_for_branch(self, branch_id: Optional[str], role: Optional[str]) -> Dict[str, Any]:
        """
        Return CSP campaign rows (campaign_csp_info) whose instance_id is actually
        present in that CSP campaign's asset_numbers. Master/IT admin → all branches.
        Others → only their branch_id. Each row includes a computed due_date
        (PG=30 days, IND=30 days from sr_open_date).
        """
        from app.models.campaign_model import CampaignCSPInfo

        # Active CSP campaigns only
        csp_campaigns = self.db.query(Campaign).filter(
            Campaign.status == 'active',
            func.upper(Campaign.service) == 'CSP'
        ).all()
        if not csp_campaigns:
            return {"total_instances": 0, "total_rows": 0, "rows": []}

        # Build the set of instance_ids that are in each CSP campaign's asset_numbers,
        # keyed by campaign_id, so a CSP row only shows if it's truly enrolled.
        assets_in_campaign: Dict[int, set] = {}
        for c in csp_campaigns:
            asset_set = set()
            for asset in self._parse_asset_numbers(c.asset_numbers):
                norm = self._normalize_id(asset)
                if norm:
                    asset_set.add(norm)
            assets_in_campaign[c.id] = asset_set

        csp_campaign_ids = list(assets_in_campaign.keys())

        rows_q = self.db.query(CampaignCSPInfo).filter(
            CampaignCSPInfo.campaign_id.in_(csp_campaign_ids)
        )

        is_master = (role or '').lower() in ('master_admin',)
        if not is_master and branch_id and str(branch_id).upper() != 'HO':
            rows_q = rows_q.filter(CampaignCSPInfo.branch_id == str(branch_id))

        sp_rows = rows_q.all()

        # SRs the MaxTTR file has already closed are auto-completed in their CSP
        # drive, so they belong in neither the Total CSP nor the Open CSP box.
        closed_pairs = self._maxttr_closed_csp_pairs(
            (r.instance_id, r.sr_number) for r in sp_rows
        )

        def parse_any_date(s):
            if not s:
                return None
            s = str(s).strip()
            # strip time portion if present (e.g. "2024-01-15 00:00:00")
            s = s.split('T')[0].strip()
            for fmt in ('%d-%b-%Y', '%d-%B-%Y', '%d %b %Y', '%d %B %Y',
                        '%b %d %Y', '%B %d %Y', '%d/%b/%Y',
                        '%Y-%m-%d', '%d-%m-%Y', '%d/%m/%Y', '%Y/%m/%d',
                        '%m/%d/%Y', '%d.%m.%Y', '%Y.%m.%d'):
                try:
                    return datetime.strptime(s, fmt)
                except ValueError:
                    continue
            return None

        def compute_due(open_str, segment):
            open_dt = parse_any_date(open_str)
            if not open_dt:
                return None
            seg = (segment or '').strip().upper()
            if seg == 'PG':
                days = 30
            elif seg == 'IND':
                days = 30
            else:
                return None
            return (open_dt + timedelta(days=days)).strftime('%d-%m-%Y')

        result_rows = []
        instance_ids = set()
        for row in sp_rows:
            # Only include if this row's instance_id is in its campaign's asset_numbers
            norm_inst = self._normalize_id(row.instance_id) if row.instance_id else None
            if not norm_inst:
                continue
            if norm_inst not in assets_in_campaign.get(row.campaign_id, set()):
                continue
            sr_no = (row.sr_number or '').strip()
            if sr_no and (norm_inst, sr_no) in closed_pairs:
                continue

            instance_ids.add(norm_inst)
            result_rows.append({
                "instance_id": row.instance_id,
                "customer_name": row.account_name or row.customer_name,
                "branch_id": row.branch_id,
                "goem_oem": row.goem_oem,
                "sr_number": row.sr_number,
                "sr_open_date": row.sr_open_date,
                "sr_close_date": row.sr_close_date,
                "sr_subtype": row.sr_subtype,
                "sr_status": row.sr_status,
                "segment": row.segment,
                "application_code": row.application_code,
                "due_date": compute_due(row.sr_open_date, row.segment),
            })

        # ---- Latest CSP-drive followup per instance (all batched — fast) ----
        # For every row's instance, attach the customer's LATEST followup that
        # belongs to a CSP drive. A drive counts as CSP ONLY when its
        # PRODUCT/SERVICE contains "csp" (e.g. "CSP", "CSP-PG") — the drive
        # NAME is deliberately not checked.
        followup_by_norm: Dict[str, Dict[str, Any]] = {}
        if result_rows:
            csp_like_ids = [cid for (cid,) in self.db.query(Campaign.id).filter(
                Campaign.service.ilike('%csp%')
            ).all()]
            if csp_like_ids:
                # instances -> customer ids (indexed IN lookup, raw + normalized forms)
                candidates = set()
                for r in result_rows:
                    if r["instance_id"]:
                        candidates.add(str(r["instance_id"]).strip())
                        candidates.add(self._normalize_id(r["instance_id"]))
                cand_list = [c for c in candidates if c]
                norm_by_cust: Dict[int, str] = {}
                for i in range(0, len(cand_list), 1000):
                    for cid, inst in self.db.query(Customer.id, Customer.instance_id).filter(
                            Customer.instance_id.in_(cand_list[i:i + 1000])).all():
                        norm_by_cust[cid] = self._normalize_id(inst)

                # ONE windowed query per 1000 customers → latest CSP followup each
                cust_ids = list(norm_by_cust.keys())
                latest_fu = {}
                for i in range(0, len(cust_ids), 1000):
                    chunk = cust_ids[i:i + 1000]
                    sub = self.db.query(
                        FollowUp.customer_id.label('cid'),
                        FollowUp.followup_date.label('fd'),
                        FollowUp.campaign_id.label('camp'),
                        FollowUp.csp_subtype.label('subtype'),
                        FollowUp.followup_by.label('fby'),
                        FollowUp.followup_flag.label('flag'),
                        FollowUp.status.label('status'),
                        FollowUp.next_followup_date.label('nfd'),
                        FollowUp.activity_id.label('act'),
                        FollowUp.rr_id.label('rr'),
                        FollowUp.followup_remark.label('rem'),
                        FollowUp.quotation_sent.label('qs'),
                        FollowUp.quotation_no.label('qno'),
                        FollowUp.quotation_value.label('qval'),
                        func.row_number().over(
                            partition_by=FollowUp.customer_id,
                            order_by=[desc(FollowUp.followup_date), desc(FollowUp.id)],
                        ).label('rn'),
                    ).filter(
                        FollowUp.customer_id.in_(chunk),
                        FollowUp.campaign_id.in_(csp_like_ids),
                    ).subquery()
                    for r in self.db.query(sub).filter(sub.c.rn == 1).all():
                        latest_fu[r.cid] = r

                # batch name lookups: campaigns, activity content, reject reason
                camp_map = {c.id: c for c in csp_campaigns}
                missing_camp = {r.camp for r in latest_fu.values() if r.camp and r.camp not in camp_map}
                if missing_camp:
                    for c in self.db.query(Campaign).filter(Campaign.id.in_(list(missing_camp))).all():
                        camp_map[c.id] = c
                act_ids = list({r.act for r in latest_fu.values() if r.act})
                act_map = {a.id: a.content for a in
                           self.db.query(Activity).filter(Activity.id.in_(act_ids)).all()} if act_ids else {}
                rr_ids = list({r.rr for r in latest_fu.values() if r.rr})
                rr_map = {x.id: x.content for x in
                          self.db.query(RR).filter(RR.id.in_(rr_ids)).all()} if rr_ids else {}

                for cid, r in latest_fu.items():
                    norm = norm_by_cust.get(cid)
                    if not norm:
                        continue
                    camp = camp_map.get(r.camp)
                    followup_by_norm[norm] = {
                        "fu_date": r.fd.isoformat() if r.fd else None,
                        "fu_drive": camp.name if camp else None,
                        "fu_service": camp.service if camp else None,
                        "fu_subtype": r.subtype,
                        "fu_by": r.fby,
                        "fu_flag": r.flag,
                        "fu_status": r.status,
                        "fu_next_date": r.nfd.isoformat() if r.nfd else None,
                        "fu_activity": act_map.get(r.act),
                        "fu_reject_reason": rr_map.get(r.rr),
                        "fu_remark": r.rem,
                        "fu_quote_sent": bool(r.qs),
                        "fu_quote_no": r.qno,
                        "fu_quote_value": r.qval,
                    }

        # ---- Last CSP letter send date per instance (batched) ----
        # Letters count only when their letter FORMAT's products contain "csp"
        # (campaign_letter_formats.products). Latest sent letter per instance.
        letter_by_norm: Dict[str, str] = {}
        if result_rows:
            from app.models.campaign_model import CampaignLetterFormat
            fmt_rows = self.db.query(
                CampaignLetterFormat.id, CampaignLetterFormat.products
            ).all()
            csp_fmt_ids = []
            for fid, products in fmt_rows:
                plist = products if isinstance(products, list) else []
                if any('csp' in str(p).lower() for p in plist):
                    csp_fmt_ids.append(fid)
            if csp_fmt_ids:
                cand = set()
                for r in result_rows:
                    if r["instance_id"]:
                        cand.add(str(r["instance_id"]).strip())
                        cand.add(self._normalize_id(r["instance_id"]))
                cand_list = [c for c in cand if c]
                for i in range(0, len(cand_list), 1000):
                    q = self.db.query(
                        LetterSendRecord.instance_id,
                        func.max(LetterSendRecord.created_at),
                    ).filter(
                        LetterSendRecord.instance_id.in_(cand_list[i:i + 1000]),
                        LetterSendRecord.format_type_id.in_(csp_fmt_ids),
                        LetterSendRecord.status == 'sent',
                    ).group_by(LetterSendRecord.instance_id)
                    for inst, last_dt in q.all():
                        norm = self._normalize_id(inst)
                        if not norm or not last_dt:
                            continue
                        iso = last_dt.isoformat()
                        if norm not in letter_by_norm or iso > letter_by_norm[norm]:
                            letter_by_norm[norm] = iso

        for r in result_rows:
            norm = self._normalize_id(r["instance_id"])
            fu = followup_by_norm.get(norm)
            if fu:
                r.update(fu)
            r["csp_last_letter_date"] = letter_by_norm.get(norm)

        return {
            "total_instances": len(instance_ids),
            "total_rows": len(result_rows),
            "rows": result_rows,
        }

    def get_csp_counts_for_branches(self, branch_ids: List[str]) -> Dict[str, Dict[str, int]]:
        """
        Batched Total CSP / Open CSP counts for MANY branches in one pass —
        used by the Dashboard Employee Progress table columns.

        Mirrors get_csp_status_for_branch + the MyPerformance front-end math:
          total_csp = unique enrolled instances (campaign_csp_info rows whose
                      instance_id is in that CSP campaign's asset_numbers)
          open_csp  = unique instances having an SR with status 'open' whose
                      LATEST CSP-drive follow-up is not Completed/Rejected
        """
        from app.models.campaign_model import CampaignCSPInfo

        wanted = {str(b) for b in (branch_ids or []) if b}
        counts = {b: {"total_csp": 0, "open_csp": 0} for b in wanted}
        if not wanted:
            return counts

        # Active CSP campaigns + their enrolled asset sets — parsed ONCE for all branches
        csp_campaigns = self.db.query(Campaign).filter(
            Campaign.status == 'active',
            func.upper(Campaign.service) == 'CSP'
        ).all()
        if not csp_campaigns:
            return counts

        assets_in_campaign: Dict[int, set] = {}
        for c in csp_campaigns:
            asset_set = set()
            for asset in self._parse_asset_numbers(c.asset_numbers):
                norm = self._normalize_id(asset)
                if norm:
                    asset_set.add(norm)
            assets_in_campaign[c.id] = asset_set

        sp_rows = self.db.query(
            CampaignCSPInfo.campaign_id,
            CampaignCSPInfo.branch_id,
            CampaignCSPInfo.instance_id,
            CampaignCSPInfo.sr_status,
            CampaignCSPInfo.sr_number,
        ).filter(
            CampaignCSPInfo.campaign_id.in_(list(assets_in_campaign.keys())),
            CampaignCSPInfo.branch_id.in_(list(wanted)),
        ).all()

        # Same MaxTTR closure rule as get_csp_status_for_branch — an SR closed
        # there counts towards neither Total CSP nor Open CSP.
        closed_pairs = self._maxttr_closed_csp_pairs(
            (inst, sr_number) for _, _, inst, _, sr_number in sp_rows
        )

        total_by_branch: Dict[str, set] = {b: set() for b in wanted}
        open_by_branch: Dict[str, set] = {b: set() for b in wanted}
        # raw + normalized instance forms for the Customer lookup below
        open_candidates: set = set()
        for camp_id, branch, inst, sr_status, sr_number in sp_rows:
            norm = self._normalize_id(inst) if inst else None
            if not norm or norm not in assets_in_campaign.get(camp_id, set()):
                continue
            sr_no = (sr_number or '').strip()
            if sr_no and (norm, sr_no) in closed_pairs:
                continue
            b = str(branch)
            if b not in total_by_branch:
                continue
            total_by_branch[b].add(norm)
            if (sr_status or '').strip().lower() == 'open':
                open_by_branch[b].add(norm)
                open_candidates.add(str(inst).strip())
                open_candidates.add(norm)

        # Latest CSP-drive follow-up STATUS per open instance (batched, windowed —
        # same query shape as get_csp_status_for_branch, status column only)
        fu_status_by_norm: Dict[str, tuple] = {}
        if open_candidates:
            csp_like_ids = [cid for (cid,) in self.db.query(Campaign.id).filter(
                Campaign.service.ilike('%csp%')
            ).all()]
            if csp_like_ids:
                cand_list = [c for c in open_candidates if c]
                norm_by_cust: Dict[int, str] = {}
                for i in range(0, len(cand_list), 1000):
                    for cid, inst in self.db.query(Customer.id, Customer.instance_id).filter(
                            Customer.instance_id.in_(cand_list[i:i + 1000])).all():
                        norm_by_cust[cid] = self._normalize_id(inst)

                cust_ids = list(norm_by_cust.keys())
                for i in range(0, len(cust_ids), 1000):
                    chunk = cust_ids[i:i + 1000]
                    sub = self.db.query(
                        FollowUp.customer_id.label('cid'),
                        FollowUp.followup_date.label('fd'),
                        FollowUp.status.label('status'),
                        func.row_number().over(
                            partition_by=FollowUp.customer_id,
                            order_by=[desc(FollowUp.followup_date), desc(FollowUp.id)],
                        ).label('rn'),
                    ).filter(
                        FollowUp.customer_id.in_(chunk),
                        FollowUp.campaign_id.in_(csp_like_ids),
                    ).subquery()
                    for r in self.db.query(sub).filter(sub.c.rn == 1).all():
                        norm = norm_by_cust.get(r.cid)
                        if not norm:
                            continue
                        prev = fu_status_by_norm.get(norm)
                        # duplicate customer rows for one instance → keep the newest
                        if prev is None or (r.fd is not None and (prev[0] is None or r.fd > prev[0])):
                            fu_status_by_norm[norm] = (r.fd, (r.status or '').strip().lower())

        for b in wanted:
            counts[b]["total_csp"] = len(total_by_branch.get(b, set()))
            counts[b]["open_csp"] = sum(
                1 for norm in open_by_branch.get(b, set())
                if fu_status_by_norm.get(norm, (None, ''))[1] not in ('completed', 'rejected')
            )
        return counts

# ==================== Warranty Expiry Map (for CSP due-date cap) ====================

    def get_warranty_expiry_map(self, instance_ids: List[str]) -> Dict[str, Optional[str]]:
        """
        Batch-lookup warranty_expiry_date from asset_detailed for many instance_ids
        in ONE indexed query per chunk (chunked at 1000 to stay under SQL Server's
        2100-parameter IN() limit). Returns { instance_id: 'YYYY-MM-DD' | None }.

        Keys are returned for BOTH the raw id sent in and its normalized form, so the
        frontend lookup by row.instance_id always hits regardless of ".0" formatting.
        When an instance has multiple asset rows, the latest (max) warranty wins.
        """
        try:
            ids = [str(i) for i in (instance_ids or []) if i is not None and str(i).strip()]
            if not ids:
                return {}

            # Query candidates: include normalized forms so DB rows match either shape.
            candidates = set()
            for i in ids:
                candidates.add(i)
                norm = self._normalize_id(i)
                if norm:
                    candidates.add(norm)
            candidate_list = [c for c in candidates if c]

            # normalized id -> latest warranty (datetime)
            warranty_by_norm: Dict[str, Any] = {}
            CHUNK = 1000  # SQL Server 2100-param IN() limit
            for i in range(0, len(candidate_list), CHUNK):
                chunk = candidate_list[i:i + CHUNK]
                for inst_id, warranty in self.db.query(
                    AssetDetailed.instance_id,
                    AssetDetailed.warranty_expiry_date
                ).filter(AssetDetailed.instance_id.in_(chunk)).all():
                    norm = self._normalize_id(inst_id)
                    if not norm:
                        continue
                    existing = warranty_by_norm.get(norm)
                    if warranty and (existing is None or warranty > existing):
                        warranty_by_norm[norm] = warranty

            # Key the response by EVERY id the caller sent (raw + normalized) so the
            # axios lookup by row.instance_id never misses on a formatting difference.
            result: Dict[str, Optional[str]] = {}
            for i in ids:
                norm = self._normalize_id(i)
                warranty = warranty_by_norm.get(norm) if norm else None
                value = warranty.strftime('%Y-%m-%d') if warranty else None
                result[i] = value
                if norm:
                    result[norm] = value
            return result

        except Exception as e:
            print(f"Error in get_warranty_expiry_map: {str(e)}")
            import traceback
            traceback.print_exc()
            return {}        

# ==================== Letter Sending ====================

    def _get_financial_year(self, dt: Optional[datetime] = None) -> str:
        dt = dt or now_ist()
        year = dt.year
        if dt.month >= 4:  # Apr–Mar Indian financial year
            return f"{year}-{str(year + 1)[-2:]}"
        return f"{year - 1}-{str(year)[-2:]}"

    def get_next_letter_ref(self, instance_id: str, format_type_id: Optional[int] = None) -> Dict[str, Any]:
        """Preview the next Ref No for an instance.
        Uses the format master's reference_no template and serial_start if a format is given.
        Falls back to KC/FY/NN when no format is selected yet."""
        from app.models.campaign_model import CampaignLetterFormat
    
        norm = self._normalize_id(instance_id)
        fy = self._get_financial_year()

        # Determine serial_start + reference template from the format master (default 1)
        serial_start = 1
        ref_template = None
        if format_type_id:
            fmt = self.db.query(CampaignLetterFormat).filter(
                CampaignLetterFormat.id == format_type_id
            ).first()
            if fmt:
                ref_template = (fmt.reference_no or '').strip() or None
                try:
                    serial_start = int(fmt.serial_start or 1)
                except (ValueError, TypeError):
                    serial_start = 1

        # Serial counting is PER FORMAT TYPE (FY + format), NOT per instance/branch.
        if format_type_id:
            existing_count = self.db.query(LetterSendRecord).filter(
                LetterSendRecord.financial_year == fy,
                LetterSendRecord.format_type_id == format_type_id,
            ).count()
            seq = serial_start + existing_count
        else:
            # No format chosen yet -> preview the starting number only
            seq = serial_start
    
        # Build the preview ref no (branch_id not known here — filled client-side in buildLetterReference)
        if ref_template:
            import re as _re
            preview_ref = _re.sub(
                r'(?i)serial[_\s]no\.?', str(seq).zfill(2), ref_template
            )
            preview_ref = _re.sub(
                r'(?i)branch[_\s]code\.?', '___', preview_ref
            )
        else:
            preview_ref = f"KC/{fy}/{str(seq).zfill(2)}"
    
        recent = self.db.query(LetterSendRecord).filter(
            LetterSendRecord.instance_id == norm
        ).order_by(desc(LetterSendRecord.created_at)).limit(2).all()
    
        previous_letters = [{
            "ref_no": r.ref_no,
            "date": r.created_at.strftime('%d %b %Y') if r.created_at else None,
            "subject": r.subject,
        } for r in recent]
    
        return {
            "instance_id": norm,
            "financial_year": fy,
            "sequence": seq,
            "serial_start": serial_start,
            "ref_no": preview_ref,
            "previous_letters": previous_letters
        }

    def _next_letter_sequence(self, instance_id: str, fy: str, format_type_id: Optional[int]) -> int:
        """Next serial PER FORMAT TYPE per FY (NOT per instance, NOT per branch).
        One shared counter for the whole format type, starting at the format
        master's serial_start and resetting each financial year.
        (instance_id is kept in the signature for caller compatibility but is
        no longer used in the count.)"""
        from app.models.campaign_model import CampaignLetterFormat
        serial_start = 1
        if format_type_id:
            fmt = self.db.query(CampaignLetterFormat).filter(
                CampaignLetterFormat.id == format_type_id
            ).first()
            if fmt and fmt.serial_start:
                try:
                    serial_start = int(fmt.serial_start)
                except (ValueError, TypeError):
                    serial_start = 1
    
        # Without a format type we can't scope correctly -> just return the start.
        if not format_type_id:
            return serial_start
    
        existing = self.db.query(LetterSendRecord).filter(
            LetterSendRecord.financial_year == fy,
            LetterSendRecord.format_type_id == format_type_id,
        ).count()
        return serial_start + existing   

    def get_letter_default_recipients(self, format_type_id: Optional[int],
                                      branch_id: Optional[str],
                                      goem_oem: Optional[str] = None) -> Dict[str, Any]:
        """Resolve default To/CC for a letter from the format master's
        default_recipients and append the branch's email from
        branch_email_master into CC.

        Matching rule for default_recipients:
          - A rule applies to this customer's branch if the branch_code is
            EXPLICITLY listed in rule.branch_codes, OR the rule is a catch-all
            (branch_codes == []), which covers every remaining branch.
          - If the branch is NOT named in any specific rule and there is NO
            catch-all rule, that branch contributes no master To/CC at all.
          - GOEM filter: a blank rule GOEM applies to all; a GOEM-specific rule
            only matches when the customer's GOEM is known AND equal.
        """
        from app.models.campaign_model import CampaignLetterFormat, BranchEmailMaster
        import json as _json

        to_emails, cc_emails = [], []
        branch_code = str(branch_id).strip() if branch_id is not None else ''
        goem = (goem_oem or '').strip().upper()

        rules = []
        matched = 0
        matched_goems = []
        if format_type_id:
            fmt = self.db.query(CampaignLetterFormat).filter(
                CampaignLetterFormat.id == format_type_id
            ).first()
            if fmt:
                raw = fmt.default_recipients
                # JSON column can come back as a STRING depending on the driver — parse it
                if isinstance(raw, str):
                    try:
                        raw = _json.loads(raw)
                    except Exception:
                        raw = []
                rules = raw if isinstance(raw, list) else []

                for rule in rules:
                    if not isinstance(rule, dict):
                        continue
                    branch_codes = [str(b).strip() for b in (rule.get('branch_codes') or [])]

                    # Match on BRANCH ONLY. The rule applies if this customer's branch
                    # is explicitly listed, OR the rule is a catch-all (branch_codes == []).
                    # GOEM is stored for reference but is NOT used to filter here.
                    if len(branch_codes) == 0:
                        branch_ok = True
                    else:
                        branch_ok = (branch_code != '' and branch_code in branch_codes)

                    if branch_ok:
                        matched += 1
                        to_emails.extend(rule.get('to_emails') or [])
                        cc_emails.extend(rule.get('cc_emails') or [])
                        rg = (rule.get('goem_oem') or '').strip()
                        if rg:
                            matched_goems.append(rg)

        # Branch email from branch_email_master -> CC (independent of the rules above)
        if branch_code:
            be = self.db.query(BranchEmailMaster).filter(
                BranchEmailMaster.branch_code == branch_code
            ).first()
            if be and be.email and be.email.strip():
                cc_emails.append(be.email.strip())

        def clean(lst):
            seen, out = set(), []
            for e in lst:
                e = (e or '').strip()
                if e and e.lower() not in seen:
                    seen.add(e.lower())
                    out.append(e)
            return out

        # de-dup GOEMs case-insensitively, keep first-seen spelling
        seen_g, goems_clean = set(), []
        for g in matched_goems:
            if g.lower() not in seen_g:
                seen_g.add(g.lower())
                goems_clean.append(g)

        return {
            "to_emails": clean(to_emails),
            "cc_emails": clean(cc_emails),
            "goems": goems_clean,
            "_debug": {
                "branch_code": branch_code,
                "goem": goem,
                "rules_total": len(rules),
                "rules_matched": matched,
            },
        }

    def get_letter_history(self, instance_id: str) -> List[Dict[str, Any]]:
        norm = self._normalize_id(instance_id)
        rows = self.db.query(LetterSendRecord).filter(
            LetterSendRecord.instance_id == norm
        ).order_by(desc(LetterSendRecord.created_at)).all()
        return [{
            "id": r.id, "ref_no": r.ref_no, "financial_year": r.financial_year,
            "sequence_number": r.sequence_number, "format_type_name": r.format_type_name,
            "subject": r.subject, "channels": r.channels,
            "sent_email": r.sent_email, "sent_whatsapp": r.sent_whatsapp,
            "email_to": r.email_to, "whatsapp_to": r.whatsapp_to,
            "status": r.status, "sent_by_id": r.sent_by_id, "sent_by_name": r.sent_by_name,
            "created_at": r.created_at,
        } for r in rows]

    def _send_letter_email(self, to_email, subject, html_body, attachments, cc_emails=None, to_extra=None):
        if not all([self.sender_email, self.sender_password]):
            return False, "Company email is not configured"
        try:
            import base64
            import mimetypes
            from email.mime.base import MIMEBase
            from email.mime.application import MIMEApplication
            from email.mime.image import MIMEImage
            from email import encoders

            # Build the full To list: primary customer email + any extra To addresses.
            to_clean = []
            for e in ([to_email] + list(to_extra or [])):
                e = (e or '').strip()
                if e and e.lower() not in [x.lower() for x in to_clean]:
                    to_clean.append(e)
            if not to_clean:
                return False, "No recipient To address"

            to_lower = {x.lower() for x in to_clean}

            # Clean CC list (drop blanks / duplicates / anything already in To)
            cc_clean = []
            for e in (cc_emails or []):
                e = (e or '').strip()
                if e and e.lower() not in to_lower and e.lower() not in [x.lower() for x in cc_clean]:
                    cc_clean.append(e)

            msg = MIMEMultipart('mixed')
            msg['From'] = mail_utils.from_header(self.sender_email)
            msg['Reply-To'] = mail_utils.reply_to(self.sender_email)
            msg['To'] = ", ".join(to_clean)
            if cc_clean:
                msg['Cc'] = ", ".join(cc_clean)
            msg['Subject'] = subject or "Letter from KALA Care"
            msg.attach(MIMEText(html_body or "", 'html'))

            # Attach files IN ORDER. The caller already puts the rendered letter PDF
            # FIRST, so it appears before the other attachments in the email. Use each
            # file's real content type (e.g. application/pdf) so the letter shows as a
            # proper, previewable PDF instead of a generic binary blob.
            for att in (attachments or []):
                content = att.get('content')
                if not content:
                    continue
                name = att.get('name', 'attachment')
                try:
                    file_bytes = base64.b64decode(content)
                except Exception:
                    continue

                # Resolve maintype/subtype from the declared type, else guess from the name.
                ctype = (att.get('type') or '').strip().lower()
                if not ctype or '/' not in ctype:
                    guessed, _ = mimetypes.guess_type(name)
                    ctype = (guessed or 'application/octet-stream').lower()
                maintype, _, subtype = ctype.partition('/')
                if not subtype:
                    maintype, subtype = 'application', 'octet-stream'

                if maintype == 'image':
                    part = MIMEImage(file_bytes, _subtype=subtype)
                elif maintype == 'application' and subtype == 'pdf':
                    part = MIMEApplication(file_bytes, _subtype='pdf')
                else:
                    part = MIMEBase(maintype, subtype)
                    part.set_payload(file_bytes)
                    encoders.encode_base64(part)

                part.add_header('Content-Disposition', 'attachment', filename=name)
                msg.attach(part)

            recipients = to_clean + cc_clean
            with smtplib.SMTP(self.smtp_server, self.smtp_port) as server:
                server.starttls()
                server.login(self.sender_email, self.sender_password)
                server.send_message(msg, to_addrs=recipients)
            return True, None
        except Exception as e:
            return False, str(e)

    def _send_letter_whatsapp(self, to_number, message, attachments):
        # WhatsApp Cloud API (Meta) — TEXT only here. Sending document/image
        # attachments over WhatsApp needs media upload or public URLs, which
        # depends on your provider; attachments still go out via email.
        api_url = os.getenv("WHATSAPP_API_URL")
        token = os.getenv("WHATSAPP_ACCESS_TOKEN")
        phone_id = os.getenv("WHATSAPP_PHONE_NUMBER_ID")
        if not all([api_url, token, phone_id]):
            return False, "WhatsApp API is not configured"
        try:
            import json as _json
            import urllib.request

            digits = ''.join(ch for ch in str(to_number) if ch.isdigit())
            if not digits:
                return False, "Invalid WhatsApp number"

            endpoint = f"{api_url.rstrip('/')}/{phone_id}/messages"
            body = {
                "messaging_product": "whatsapp",
                "to": digits,
                "type": "text",
                "text": {"body": (message or "")[:4000]}
            }
            req = urllib.request.Request(
                endpoint,
                data=_json.dumps(body).encode('utf-8'),
                headers={
                    "Authorization": f"Bearer {token}",
                    "Content-Type": "application/json",
                },
                method="POST"
            )
            with urllib.request.urlopen(req, timeout=20) as resp:
                resp.read()
            return True, None
        except Exception as e:
            return False, str(e)

    def send_letter(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        instance_id = self._normalize_id(payload.get('instance_id'))
        if not instance_id:
            raise HTTPException(status_code=400, detail="instance_id is required")

        channels = payload.get('channels') or []
        if not channels:
            raise HTTPException(status_code=400, detail="Select at least one channel (email/whatsapp)")

        subject = (payload.get('subject') or '').strip()
        letter_html = payload.get('letter_html') or ''
        letter_text = payload.get('letter_text') or ''
        email_to = (payload.get('email_to') or '').strip()
        whatsapp_to = (payload.get('whatsapp_to') or '').strip()
        attachments = payload.get('attachments') or []

        # If we're sending an existing DRAFT, reuse its row + Ref No (no new number).
        existing = None
        record_id = payload.get('record_id')
        if record_id:
            existing = self.db.query(LetterSendRecord).filter(
                LetterSendRecord.id == record_id
            ).first()

        if existing:
            fy = existing.financial_year or self._get_financial_year()
            seq = existing.sequence_number
            ref_no = existing.ref_no
        else:
            # Fresh number — PER FORMAT, honoring the format's serial_start
            fy = self._get_financial_year()
            seq = self._next_letter_sequence(instance_id, fy, payload.get('format_type_id'))
            ref_no = payload.get('ref_no') or f"KC/{fy}/{str(seq).zfill(2)}"

        sent_email = False
        sent_whatsapp = False
        errors = []

        cc_emails = payload.get('cc_emails') or []          # additional emails -> CC
        to_extra = payload.get('to_emails') or []           # additional emails -> To
        whatsapp_extra = payload.get('whatsapp_numbers') or []  # additional WhatsApp numbers

        # Stored recipient strings (comma-separated):
        #   email_to = customer email + every manually-added "To" address
        #   email_cc = every "CC" address (dropping anything already in To)
        # Each list is de-duplicated case-insensitively, keeping first-seen spelling.
        def _join_emails(items):
            seen, out = set(), []
            for e in items:
                e = (e or '').strip()
                if e and e.lower() not in seen:
                    seen.add(e.lower())
                    out.append(e)
            return ", ".join(out)

        email_to_combined = _join_emails([email_to] + list(to_extra))
        _to_lower = {e.strip().lower() for e in ([email_to] + list(to_extra)) if e and e.strip()}
        email_cc_combined = _join_emails([e for e in cc_emails if (e or '').strip().lower() not in _to_lower])

        if 'email' in channels:
            if not email_to and not to_extra:
                errors.append("No recipient email address")
            else:
                email_body_html = payload.get('email_body_html') or letter_html
                ok, err = self._send_letter_email(email_to, subject, email_body_html, attachments, cc_emails, to_extra)
                sent_email = ok
                if not ok:
                    errors.append(f"Email: {err}")

        if 'whatsapp' in channels:
            all_numbers = [whatsapp_to] + list(whatsapp_extra)
            all_numbers = [str(n).strip() for n in all_numbers if n and str(n).strip()]
            # de-dup preserving order
            seen = set()
            all_numbers = [n for n in all_numbers if not (n in seen or seen.add(n))]
            if not all_numbers:
                errors.append("No WhatsApp number")
            else:
                any_ok = False
                for num in all_numbers:
                    ok, err = self._send_letter_whatsapp(num, letter_text or subject, attachments)
                    if ok:
                        any_ok = True
                    else:
                        errors.append(f"WhatsApp ({num}): {err}")
                sent_whatsapp = any_ok

        if sent_email or sent_whatsapp:
            status_val = 'partial' if errors else 'sent'
        else:
            status_val = 'failed'

        letter_fields_store = payload.get('letter_fields') or {}

        if existing:
            existing.format_type_id = payload.get('format_type_id')
            existing.format_type_name = payload.get('format_type_name')
            existing.subject = subject
            existing.letter_body = letter_text or letter_html
            existing.letter_html = letter_html
            existing.letter_fields = letter_fields_store
            existing.attachments = attachments
            existing.channels = channels
            existing.sent_email = sent_email
            existing.sent_whatsapp = sent_whatsapp
            existing.email_to = email_to_combined or None
            existing.email_cc = email_cc_combined or None
            existing.whatsapp_to = whatsapp_to or None
            existing.status = status_val
            existing.error_message = "; ".join(errors) or None
            existing.sent_by_id = str(payload.get('sent_by_id')) if payload.get('sent_by_id') else existing.sent_by_id
            existing.sent_by_name = payload.get('sent_by_name') or existing.sent_by_name
            record = existing
        else:
            record = LetterSendRecord(
                ref_no=ref_no,
                financial_year=fy,
                sequence_number=seq,
                instance_id=instance_id,
                customer_id=payload.get('customer_id'),
                format_type_id=payload.get('format_type_id'),
                format_type_name=payload.get('format_type_name'),
                subject=subject,
                letter_body=letter_text or letter_html,
                letter_html=letter_html,
                letter_fields=letter_fields_store,
                attachments=attachments,
                channels=channels,
                sent_email=sent_email,
                sent_whatsapp=sent_whatsapp,
                email_to=email_to_combined or None,
                email_cc=email_cc_combined or None,
                whatsapp_to=whatsapp_to or None,
                status=status_val,
                error_message="; ".join(errors) or None,
                sent_by_id=str(payload.get('sent_by_id')) if payload.get('sent_by_id') else None,
                sent_by_name=payload.get('sent_by_name'),
            )
            self.db.add(record)
        self.db.commit()
        self.db.refresh(record)

        return {
            "ref_no": ref_no,
            "financial_year": fy,
            "sequence": seq,
            "status": status_val,
            "sent_email": sent_email,
            "sent_whatsapp": sent_whatsapp,
            "errors": errors,
            "record_id": record.id,
        }

    def save_letter_draft(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        """Create or update a DRAFT letter (status='draft'); sends nothing."""
        instance_id = self._normalize_id(payload.get('instance_id'))
        if not instance_id:
            raise HTTPException(status_code=400, detail="instance_id is required")

        subject = (payload.get('subject') or '').strip()
        letter_html = payload.get('letter_html') or ''
        letter_text = payload.get('letter_text') or ''
        letter_fields_store = payload.get('letter_fields') or {}
        attachments = payload.get('attachments') or []
        channels = payload.get('channels') or []
        email_to = (payload.get('email_to') or '').strip()
        whatsapp_to = (payload.get('whatsapp_to') or '').strip()

        existing = None
        record_id = payload.get('record_id')
        if record_id:
            existing = self.db.query(LetterSendRecord).filter(
                LetterSendRecord.id == record_id
            ).first()

        if existing:
            fy = existing.financial_year or self._get_financial_year()
            seq = existing.sequence_number
            ref_no = existing.ref_no
        else:
            fy = self._get_financial_year()
            seq = self._next_letter_sequence(instance_id, fy, payload.get('format_type_id'))
            ref_no = payload.get('ref_no') or f"KC/{fy}/{str(seq).zfill(2)}"

        if existing:
            existing.format_type_id = payload.get('format_type_id')
            existing.format_type_name = payload.get('format_type_name')
            existing.subject = subject
            existing.letter_body = letter_text or letter_html
            existing.letter_html = letter_html
            existing.letter_fields = letter_fields_store
            existing.attachments = attachments
            existing.channels = channels
            existing.email_to = email_to or None
            existing.whatsapp_to = whatsapp_to or None
            existing.status = 'draft'
            existing.sent_by_id = str(payload.get('sent_by_id')) if payload.get('sent_by_id') else existing.sent_by_id
            existing.sent_by_name = payload.get('sent_by_name') or existing.sent_by_name
            record = existing
        else:
            record = LetterSendRecord(
                ref_no=ref_no, financial_year=fy, sequence_number=seq,
                instance_id=instance_id, customer_id=payload.get('customer_id'),
                format_type_id=payload.get('format_type_id'),
                format_type_name=payload.get('format_type_name'),
                subject=subject, letter_body=letter_text or letter_html,
                letter_html=letter_html, letter_fields=letter_fields_store,
                attachments=attachments, channels=channels,
                sent_email=False, sent_whatsapp=False,
                email_to=email_to or None, whatsapp_to=whatsapp_to or None,
                status='draft',
                sent_by_id=str(payload.get('sent_by_id')) if payload.get('sent_by_id') else None,
                sent_by_name=payload.get('sent_by_name'),
            )
            self.db.add(record)
        self.db.commit()
        self.db.refresh(record)

        return {
            "record_id": record.id, "ref_no": record.ref_no,
            "financial_year": record.financial_year, "sequence": record.sequence_number,
            "status": record.status,
        }

    def get_letter_record(self, record_id: int) -> Dict[str, Any]:
        r = self.db.query(LetterSendRecord).filter(LetterSendRecord.id == record_id).first()
        if not r:
            raise HTTPException(status_code=404, detail="Letter not found")
        return {
            "id": r.id, "ref_no": r.ref_no, "financial_year": r.financial_year,
            "sequence_number": r.sequence_number, "instance_id": r.instance_id,
            "customer_id": r.customer_id, "format_type_id": r.format_type_id,
            "format_type_name": r.format_type_name, "subject": r.subject,
            "letter_body": r.letter_body, "letter_html": r.letter_html,
            "letter_fields": r.letter_fields or {}, "attachments": r.attachments or [],
            "channels": r.channels or [], "sent_email": r.sent_email,
            "sent_whatsapp": r.sent_whatsapp, "email_to": r.email_to,
            "whatsapp_to": r.whatsapp_to, "status": r.status,
            "sent_by_id": r.sent_by_id, "sent_by_name": r.sent_by_name,
            "created_at": r.created_at,
        }          