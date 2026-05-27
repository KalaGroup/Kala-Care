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
from app.models.engagement_model import FollowUp, Activity, RR
from app.schemas import engagement_schema
from app.models.non_followup_model import NonFollowUp

# Load environment variables
load_dotenv()

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
    
    def _update_single_followup_flag(self, today: datetime, followup: FollowUp) -> int:
        """
        Update a single follow-up's flag based on its next_followup_date.
        Returns 1 if updated, 0 otherwise.
        Only updates if this is the latest follow-up for the customer.
        """
        # Skip if no next_followup_date
        if not followup.next_followup_date:
            return 0
        
        # Skip if completed or rejected
        if followup.status in ['completed']:
            return 0
        
        # Check if this is the latest follow-up for this customer
        latest_followup = self.db.query(FollowUp).filter(
            FollowUp.customer_id == followup.customer_id,
            FollowUp.status.notin_(['completed', 'rejected'])
        ).order_by(desc(FollowUp.followup_date)).first()
        
        # Only update if this followup is the latest one
        if latest_followup and latest_followup.id != followup.id:
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
        today = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
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
            
            for followup in latest_followups:
                updated_count += self._update_single_followup_flag(today, followup)
        
        if updated_count > 0:
            self.db.commit()
        
        return {
            "message": f"Updated {updated_count} latest follow-up flags",
            "updated_count": updated_count,
            "timestamp": datetime.utcnow().isoformat()
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
            msg['From'] = self.sender_email
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
                
                # Get the latest follow-up for this customer in this campaign
                latest_followup = self.db.query(FollowUp).filter(
                    FollowUp.customer_id == customer.id,
                    FollowUp.campaign_id == campaign_id,
                    FollowUp.status == 'completed'
                ).order_by(desc(FollowUp.followup_date)).first()
                
                # Send thank you email to customer
                if latest_followup:
                    self._send_campaign_completion_email_to_customer(customer, campaign, latest_followup)
                
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
        
        # Get ALL customers
        all_customers = self.db.query(Customer).filter(
            Customer.instance_id.isnot(None)
        ).all()
        
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
                    self.db.query(FollowUp).filter(
                        FollowUp.customer_id.in_(chunk)
                    ).all()
                )
            # Sort across all chunks (per-chunk order isn't a global order)
            all_followups_for_customers.sort(
                key=lambda f: f.followup_date or datetime.min,
                reverse=True
            )
        
        # Group followups by customer_id (already sorted desc by date, so first = latest)
        followups_by_customer: Dict[int, List[FollowUp]] = {}
        for f in all_followups_for_customers:
            followups_by_customer.setdefault(f.customer_id, []).append(f)
        
        # ========== OPTIMIZATION: Fetch ALL "transfer-source" campaigns in ONE query ==========
        # For each active campaign, find OLDER campaigns with same name+service
        # Note: MSSQL doesn't support tuple IN syntax, so use or_(and_(...)) instead
        name_service_pairs = {(c.name, c.service) for c in active_campaigns}
        transfer_candidate_campaigns = []
        if name_service_pairs:
            pair_filters = [
                and_(Campaign.name == name, Campaign.service == service)
                for name, service in name_service_pairs
            ]
            transfer_candidate_campaigns = self.db.query(Campaign).filter(
                or_(*pair_filters)
            ).all()
        
        # Group transfer-candidate campaigns by (name, service); exclude active ones for each pair
        transfer_campaigns_by_pair: Dict[tuple, List[Campaign]] = {}
        active_campaign_ids = {c.id for c in active_campaigns}
        for c in transfer_candidate_campaigns:
            key = (c.name, c.service)
            # Don't include the active campaign itself in its own transfer-source list
            if c.id in active_campaign_ids:
                # Only exclude if this is exactly the active campaign for this key.
                # Since active campaigns are identified by id, just skip when this id is the active one
                # for this key. We'll filter precisely below per active campaign.
                pass
            transfer_campaigns_by_pair.setdefault(key, []).append(c)
        
        # Pre-compute, per active campaign, the list of OLDER campaign IDs to check for transfers
        transfer_sources_per_active_campaign: Dict[int, List[Campaign]] = {}
        for ac in active_campaigns:
            same_pair = transfer_campaigns_by_pair.get((ac.name, ac.service), [])
            transfer_sources_per_active_campaign[ac.id] = [c for c in same_pair if c.id != ac.id]
        
        # Pre-parse asset_numbers for ALL transfer-candidate campaigns once
        parsed_assets_by_campaign_id: Dict[int, List] = {
            c.id: self._parse_asset_numbers(c.asset_numbers)
            for c in transfer_candidate_campaigns
        }
        
        # Warranty + agreement maps (same as before)
        warranty_map = {}
        asset_records = self.db.query(
            AssetDetailed.instance_id,
            AssetDetailed.warranty_expiry_date
        ).filter(AssetDetailed.instance_id.isnot(None)).all()
        for inst_id, warranty in asset_records:
            normalized = self._normalize_id(inst_id)
            if normalized and normalized not in warranty_map:
                warranty_map[normalized] = warranty
        
        agreement_map = {}
        amc_records = self.db.query(
            AMCAgreement.instance_id,
            AMCAgreement.agreement_end_date,
            AMCAgreement.agreement_start_date
        ).filter(AMCAgreement.instance_id.isnot(None)).order_by(
            desc(AMCAgreement.agreement_start_date)
        ).all()
        for inst_id, end_date, _ in amc_records:
            normalized = self._normalize_id(inst_id)
            if normalized and normalized not in agreement_map:
                agreement_map[normalized] = end_date
        
        # ========== Build result using in-memory lookups (NO MORE QUERIES PER CUSTOMER) ==========
        result = []
        cutoff_90_days = datetime.utcnow() - timedelta(days=90)
        
        for customer in relevant_customers:
            normalized_customer_id = self._normalize_id(customer.instance_id)
            customer_campaign_names = campaign_asset_map[normalized_customer_id]
            
            # Get followups from in-memory dict instead of DB query
            customer_followups = followups_by_customer.get(customer.id, [])
            
            # Latest followup (any status) - first in sorted-desc list
            latest_followup = customer_followups[0] if customer_followups else None
            
            # Latest active followup (excludes rejected/completed)
            latest_active_followup = next(
                (f for f in customer_followups if f.status not in ('rejected', 'completed')),
                None
            )
            
            latest_status = latest_followup.status if latest_followup else None
            
            # Source followup logic (same as before)
            source_followup = latest_active_followup
            if not source_followup and latest_followup and latest_followup.followup_date:
                fdate = latest_followup.followup_date
                if isinstance(fdate, datetime) and fdate >= cutoff_90_days:
                    source_followup = latest_followup
            
            next_followup_date = source_followup.next_followup_date if source_followup else None
            followup_flags = self._get_followup_flags(customer, source_followup)
            
            # Build per-campaign status using pre-fetched data
            campaign_status = {}
            campaign_transferred = {}
            campaign_old_status = {}
            
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
                
                # Transfer detection: check OLD campaigns with same (name, service)
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
                
                campaign_status[campaign_name] = status
                campaign_transferred[campaign_name] = is_transferred
                campaign_old_status[campaign_name] = old_campaign_status
            
            result.append({
                "customer_id": customer.id,
                "instance_id": customer.instance_id,
                "customer_name": customer.customer_name or "Unknown",
                "mobile": customer.phone_number or "-",
                "email": customer.email or "-",
                "branch_id": customer.branch_id,
                "warranty_expiry_date": warranty_map.get(normalized_customer_id),
                "agreement_end_date": agreement_map.get(normalized_customer_id),
                "campaigns": customer_campaign_names,
                "campaign_checkmarks": {name: name in customer_campaign_names for name in campaign_names},
                "campaign_status": campaign_status,
                "campaign_transferred": campaign_transferred,
                "campaign_old_status": campaign_old_status,
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
            "active_campaigns": campaign_names,
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
        self.update_latest_followup_flags(customer_id)
        
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
            "pan_number": customer.pan_number,
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
            # Process scripts to ensure proper format
            scripts = self._get_campaign_scripts(c)
            
            campaign_dicts.append({
                "id": c.id,
                "name": c.name,
                "service": c.service,
                "description": c.description,
                "color": c.color or "#71C9CE",
                "start_date": c.start_date,
                "end_date": c.end_date,
                "scripts": scripts
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
                "scripts": self._get_campaign_scripts(c)
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

            # ONE batch query to fetch segment + engine_model for all related assets
            # (avoids N+1 — single indexed IN() lookup on AssetDetailed.instance_id)
            asset_info_map = {}
            related_instance_ids = [oc.instance_id for oc in other_customers if oc.instance_id]
            if related_instance_ids:
                asset_rows = self.db.query(
                    AssetDetailed.instance_id,
                    AssetDetailed.segment,
                    AssetDetailed.engine_model
                ).filter(AssetDetailed.instance_id.in_(related_instance_ids)).all()
                for inst_id, seg, eng_model in asset_rows:
                    normalized = self._normalize_id(inst_id)
                    if normalized and normalized not in asset_info_map:
                        asset_info_map[normalized] = {
                            "segment": seg,
                            "engine_model": eng_model
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
        
        result = []
        for f in followups:
            campaign_name = None
            campaign_color = None
            campaign_status = None
            if f.campaign_id:
                campaign = self.db.query(Campaign).filter(Campaign.id == f.campaign_id).first()
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
            "activity_id": followup.activity_id,
            "rr_id": followup.rr_id,
            "created_at": followup.created_at,
            "updated_at": followup.updated_at
        }
    
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
            data['next_followup_date'] = datetime.utcnow() + timedelta(days=days)
        
        # Ensure followup_date is set
        if not data.get('followup_date'):
            data['followup_date'] = datetime.utcnow()
        
        # Remove any fields not in the model
        data.pop('campaign_name', None)
        
        # ADDED: Add customer_instance_id to the data
        data['customer_instance_id'] = self._normalize_id(customer.instance_id)
        
        # Create the follow-up object
        db_followup = FollowUp(**data, customer_id=customer_id)
        self.db.add(db_followup)
        self.db.commit()
        self.db.refresh(db_followup)
        
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
            update_data['next_followup_date'] = datetime.utcnow() + timedelta(days=days)
        
        # Remove any fields not in the model
        update_data.pop('campaign_name', None)
        
        # ADDED: Update customer_instance_id if customer has it
        if customer and customer.instance_id:
            update_data['customer_instance_id'] = self._normalize_id(customer.instance_id)
        
        for key, value in update_data.items():
            setattr(db_followup, key, value)
        
        db_followup.updated_at = datetime.utcnow()
        self.db.commit()
        self.db.refresh(db_followup)
        
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
        db_activity.updated_at = datetime.utcnow()
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
        db_rr.updated_at = datetime.utcnow()
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
    
    def get_non_campaign_customers(self, page: int = 1, limit: int = 20, from_date: Optional[str] = None, to_date: Optional[str] = None) -> Dict[str, Any]:
        """Get customers who are not in any campaign with their engagement data"""
        
        # First update flags for latest follow-ups
        self.update_latest_followup_flags()
        
        # Parse dates if provided
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
                end_date = end_date.replace(hour=23, minute=59, second=59)
            except:
                end_date = datetime.fromisoformat(to_date.replace('Z', '+00:00'))
                end_date = end_date.replace(hour=23, minute=59, second=59)
        
        # Get all active campaigns
        active_campaigns = self.db.query(Campaign).filter(Campaign.status == 'active').all()
        
        # Build set of all customer instance_ids that are in any campaign
        campaign_customer_ids = set()
        for campaign in active_campaigns:
            asset_numbers = self._parse_asset_numbers(campaign.asset_numbers)
            for asset in asset_numbers:
                normalized_asset = self._normalize_id(asset)
                if normalized_asset:
                    campaign_customer_ids.add(normalized_asset)
        
        # Get all customers
        customers_query = self.db.query(Customer).filter(
            Customer.instance_id.isnot(None)
        )
        
        # Filter out customers that are in any campaign
        all_customers = customers_query.all()
        non_campaign_customers = []
        
        for customer in all_customers:
            if customer.instance_id:
                normalized_id = self._normalize_id(customer.instance_id)
                if normalized_id not in campaign_customer_ids:
                    non_campaign_customers.append(customer)
        
        # Apply date filters if provided (filter by last followup date)
        if start_date or end_date:
            filtered_customers = []
            for customer in non_campaign_customers:
                # Get latest followup for this customer
                latest_followup = self.db.query(FollowUp).filter(
                    FollowUp.customer_id == customer.id
                ).order_by(desc(FollowUp.followup_date)).first()
                
                if latest_followup:
                    followup_date = latest_followup.followup_date
                    if start_date and followup_date < start_date:
                        continue
                    if end_date and followup_date > end_date:
                        continue
                    filtered_customers.append(customer)
                elif not start_date and not end_date:
                    # If no date filters, include customers without followups
                    filtered_customers.append(customer)
                # If date filters are set and no followup, exclude the customer
            non_campaign_customers = filtered_customers
        
        # Calculate total count
        total_count = len(non_campaign_customers)
        
        # Apply pagination
        start_idx = (page - 1) * limit
        end_idx = start_idx + limit
        paginated_customers = non_campaign_customers[start_idx:end_idx]
        
        # Build warranty + agreement maps only for paginated customers (efficient)
        paginated_instance_ids = [
            self._normalize_id(c.instance_id) 
            for c in paginated_customers 
            if c.instance_id
        ]
        
        warranty_map = {}
        agreement_map = {}
        
        if paginated_instance_ids:
            # SQL Server has a 2100-parameter limit on IN() — chunk to be safe
            CHUNK = 1000
            paginated_instance_ids_unique = list(set(paginated_instance_ids))
            
            # Warranty lookup — only for the paginated instance_ids (not the full table)
            for i in range(0, len(paginated_instance_ids_unique), CHUNK):
                chunk = paginated_instance_ids_unique[i:i + CHUNK]
                asset_rows = self.db.query(
                    AssetDetailed.instance_id,
                    AssetDetailed.warranty_expiry_date
                ).filter(AssetDetailed.instance_id.in_(chunk)).all()
                for inst_id, warranty in asset_rows:
                    normalized = self._normalize_id(inst_id)
                    if normalized and normalized not in warranty_map:
                        warranty_map[normalized] = warranty
            
            # Latest agreement_end_date lookup — also filtered
            for i in range(0, len(paginated_instance_ids_unique), CHUNK):
                chunk = paginated_instance_ids_unique[i:i + CHUNK]
                amc_rows = self.db.query(
                    AMCAgreement.instance_id,
                    AMCAgreement.agreement_end_date,
                    AMCAgreement.agreement_start_date
                ).filter(AMCAgreement.instance_id.in_(chunk)).order_by(
                    desc(AMCAgreement.agreement_start_date)
                ).all()
                for inst_id, end_date, _ in amc_rows:
                    normalized = self._normalize_id(inst_id)
                    if normalized and normalized not in agreement_map:
                        agreement_map[normalized] = end_date
        
        # ========== OPTIMIZATION: Batch-fetch followups for ALL paginated customers ==========
        # (was: 4 separate per-customer queries × N customers = 4N queries per page)
        paginated_customer_ids = [c.id for c in paginated_customers]
        
        all_followups: List[FollowUp] = []
        all_non_followups: List[NonFollowUp] = []
        if paginated_customer_ids:
            all_followups = self.db.query(FollowUp).filter(
                FollowUp.customer_id.in_(paginated_customer_ids)
            ).order_by(desc(FollowUp.followup_date)).all()
            
            all_non_followups = self.db.query(NonFollowUp).filter(
                NonFollowUp.customer_id.in_(paginated_customer_ids)
            ).order_by(desc(NonFollowUp.followup_date)).all()
        
        # Group followups by customer_id (already sorted desc, so first = latest)
        regular_by_customer: Dict[int, List[FollowUp]] = {}
        for f in all_followups:
            regular_by_customer.setdefault(f.customer_id, []).append(f)
        
        non_by_customer: Dict[int, List[NonFollowUp]] = {}
        for nf in all_non_followups:
            non_by_customer.setdefault(nf.customer_id, []).append(nf)
        
        # Process customers for response - now using in-memory lookups only
        result = []
        for idx, customer in enumerate(paginated_customers, start=start_idx + 1):
            regular_list = regular_by_customer.get(customer.id, [])
            non_list = non_by_customer.get(customer.id, [])
            
            # Latest followup of each type (first in desc-sorted list)
            latest_followup_regular = regular_list[0] if regular_list else None
            latest_followup_other = non_list[0] if non_list else None
            
            # Pick the more recent one for display
            if latest_followup_regular and latest_followup_other:
                latest_followup = (
                    latest_followup_regular
                    if latest_followup_regular.followup_date >= latest_followup_other.followup_date
                    else latest_followup_other
                )
            elif latest_followup_other:
                latest_followup = latest_followup_other
            else:
                latest_followup = latest_followup_regular
            
            # Latest ACTIVE followup of each type (excludes rejected/completed)
            latest_active_regular = next(
                (f for f in regular_list if f.status not in ('rejected', 'completed')),
                None
            )
            latest_active_other = next(
                (nf for nf in non_list if nf.status not in ('rejected', 'completed')),
                None
            )
            
            if latest_active_regular and latest_active_other:
                latest_active_followup = (
                    latest_active_regular
                    if latest_active_regular.followup_date >= latest_active_other.followup_date
                    else latest_active_other
                )
            elif latest_active_other:
                latest_active_followup = latest_active_other
            else:
                latest_active_followup = latest_active_regular
            
            latest_status = latest_followup.status if latest_followup else None
            
            # Calculate next follow-up date
            next_followup_date = None
            if latest_active_followup and latest_active_followup.next_followup_date:
                next_followup_date = latest_active_followup.next_followup_date
            
            # Get followup flags
            followup_flags = self._get_followup_flags(customer, latest_active_followup)
            
            normalized_inst_id = self._normalize_id(customer.instance_id) if customer.instance_id else None
            
            result.append({
                "sr_no": idx,
                "customer_id": customer.id,
                "instance_id": customer.instance_id,
                "branch_id": customer.branch_id, 
                "customer_name": customer.customer_name or "Unknown",
                "mobile": customer.phone_number or "-",
                "email": customer.email or "-",
                "warranty_expiry_date": warranty_map.get(normalized_inst_id) if normalized_inst_id else None,
                "agreement_end_date": agreement_map.get(normalized_inst_id) if normalized_inst_id else None,
                "campaigns": [],  # Empty for non-campaign customers
                "campaign_checkmarks": {},
                "campaign_status": {},
                "followup_flags": followup_flags,
                "latest_status": latest_status,
                "last_followup_date": latest_followup.followup_date if latest_followup else None,
                "last_followup_user": latest_followup.user_name if latest_followup else None,
                "next_followup_date": next_followup_date,
                "last_followup_remark": latest_followup.followup_remark if latest_followup else None
            })
        
        # Get all campaigns for follow-up creation
        all_campaigns_list = []
        for campaign in active_campaigns:
            all_campaigns_list.append({
                "id": campaign.id,
                "name": campaign.name,
                "service": campaign.service,
                "color": campaign.color or "#71C9CE",
                "scripts": self._get_campaign_scripts(campaign)
            })

        # After building all_campaigns_list, add:
        from app.models.campaign_model import CampaignService
        
        campaign_services = self.db.query(CampaignService).order_by(CampaignService.name).all()
        campaign_services_list = [{"id": cs.id, "name": cs.name} for cs in campaign_services] 
        
        return {
            "from_date": from_date,
            "to_date": to_date,
            "page": page,
            "limit": limit,
            "total_count": total_count,
            "has_more": end_idx < total_count,
            "customers": result,
            "all_campaigns": all_campaigns_list,
            "campaign_services": campaign_services_list,
        }
    
    def get_customer_non_followups(self, customer_id: int) -> List[Dict[str, Any]]:
        """Get all non-follow-ups (other type) for a customer"""
        non_followups = self.db.query(NonFollowUp)\
            .filter(NonFollowUp.customer_id == customer_id)\
            .order_by(desc(NonFollowUp.followup_date))\
            .all()
        
        result = []
        for nf in non_followups:
            campaign_name = None
            campaign_color = None
            if nf.campaign_id:
                campaign = self.db.query(Campaign).filter(Campaign.id == nf.campaign_id).first()
                if campaign:
                    campaign_name = campaign.name
                    campaign_color = campaign.color
            
            activity_content = None
            if nf.activity_id:
                activity = self.db.query(Activity).filter(Activity.id == nf.activity_id).first()
                if activity:
                    activity_content = activity.content
            
            rr_content = None
            if nf.rr_id:
                rr = self.db.query(RR).filter(RR.id == nf.rr_id).first()
                if rr:
                    rr_content = rr.content
            
            result.append({
                "id": nf.id,
                "customer_id": nf.customer_id,
                "customer_instance_id": nf.customer_instance_id,
                "campaign_id": nf.campaign_id,
                "campaign_name": campaign_name if nf.campaign_id else "Other",
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
            data['next_followup_date'] = datetime.utcnow() + timedelta(days=days)
        
        # Ensure followup_date is set
        if not data.get('followup_date'):
            data['followup_date'] = datetime.utcnow()
        
        # Set remark from user input
        data['followup_remark'] = data.get('followup_remark')
        data['remark_type'] = "other"
        
        # Remove any fields not in the model
        data.pop('campaign_name', None)
        
        # Add customer_instance_id to the data
        data['customer_instance_id'] = self._normalize_id(customer.instance_id)
        
        # Create the non-follow-up object
        db_non_followup = NonFollowUp(**data, customer_id=customer_id)
        self.db.add(db_non_followup)
        self.db.commit()
        self.db.refresh(db_non_followup)
        
        # Return response with campaign_name as "Other"
        return {
            "id": db_non_followup.id,
            "customer_id": db_non_followup.customer_id,
            "customer_instance_id": db_non_followup.customer_instance_id,
            "campaign_id": None,  # No campaign associated
            "campaign_name": "Other",  # Display name
            "campaign_color": "#9CA3AF",  # Gray color for Other
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
            update_data['next_followup_date'] = datetime.utcnow() + timedelta(days=days)
        
        # Remove any fields not in the model
        update_data.pop('campaign_name', None)
        
        for key, value in update_data.items():
            setattr(db_non_followup, key, value)
        
        db_non_followup.updated_at = datetime.utcnow()
        self.db.commit()
        self.db.refresh(db_non_followup)
        
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
        return {"message": "Non-follow-up deleted successfully"}

# ==================== CSP Status (branch-wise) ====================

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

        is_master = (role or '').lower() in ('master_admin', 'it_admin')
        if not is_master and branch_id and str(branch_id).upper() != 'HO':
            rows_q = rows_q.filter(CampaignCSPInfo.branch_id == str(branch_id))

        sp_rows = rows_q.all()

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

        return {
            "total_instances": len(instance_ids),
            "total_rows": len(result_rows),
            "rows": result_rows,
        }        