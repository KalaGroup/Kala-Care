from sqlalchemy.orm import Session
from sqlalchemy import and_, or_
from fastapi import HTTPException
from datetime import datetime
from typing import List, Optional, Dict, Any

from app.models.campaign_model import Campaign, CampaignService
from app.models.customer_model import Customer
from app.schemas import campaign_schema

class CampaignController:
    def __init__(self, db: Session):
        self.db = db
    
    # ==================== Asset Validation ====================
    
    def validate_asset_numbers(self, asset_numbers: List[str]) -> Dict[str, List[str]]:
        """Validate asset numbers against customers table"""
        if not asset_numbers:
            return {"valid": [], "invalid": []}
        
        # Remove duplicates and empty values
        unique_assets = list(set([str(num).strip() for num in asset_numbers if num and str(num).strip()]))
        
        valid_assets = []
        invalid_assets = []
        
        for asset in unique_assets:
            # Check if asset exists in customers table as instance_id
            customer = self.db.query(Customer).filter(Customer.instance_id == asset).first()
            if customer:
                valid_assets.append(asset)
            else:
                invalid_assets.append(asset)
        
        return {
            "valid": valid_assets,
            "invalid": invalid_assets
        }
    
    # ==================== Service Management ====================
    
    def get_all_services(self) -> List[CampaignService]:
        return self.db.query(CampaignService).order_by(CampaignService.name).all()
    
    def create_service(self, service: campaign_schema.ServiceCreate) -> CampaignService:
        existing = self.db.query(CampaignService).filter(CampaignService.name == service.name).first()
        if existing:
            raise HTTPException(status_code=400, detail="Service with this name already exists")
        
        db_service = CampaignService(**service.model_dump())
        self.db.add(db_service)
        self.db.commit()
        self.db.refresh(db_service)
        return db_service
    
    def update_service(self, service_id: int, service: campaign_schema.ServiceUpdate) -> CampaignService:
        db_service = self.db.query(CampaignService).filter(CampaignService.id == service_id).first()
        if not db_service:
            raise HTTPException(status_code=404, detail="Service not found")
        
        if service.name and service.name != db_service.name:
            existing = self.db.query(CampaignService).filter(CampaignService.name == service.name).first()
            if existing:
                raise HTTPException(status_code=400, detail="Service with this name already exists")
        
        for key, value in service.model_dump(exclude_unset=True).items():
            setattr(db_service, key, value)
        
        db_service.updated_at = datetime.utcnow()
        self.db.commit()
        self.db.refresh(db_service)
        return db_service
    
    def delete_service(self, service_id: int):
        db_service = self.db.query(CampaignService).filter(CampaignService.id == service_id).first()
        if not db_service:
            raise HTTPException(status_code=404, detail="Service not found")
        
        # Check if service is used in any campaign
        campaigns_using = self.db.query(Campaign).filter(Campaign.service == db_service.name).count()
        if campaigns_using > 0:
            raise HTTPException(status_code=400, detail="Cannot delete service that is used in campaigns")
        
        self.db.delete(db_service)
        self.db.commit()
        return {"message": "Service deleted successfully"}
    
    # ==================== Campaign Management ====================
    
    def get_all_campaigns(self, service: Optional[str] = None, status: Optional[str] = None) -> List[Campaign]:
        query = self.db.query(Campaign)
        
        if service and service != 'all':
            query = query.filter(Campaign.service == service)
        if status and status != 'all':
            query = query.filter(Campaign.status == status)
        
        # Auto-update status based on end date
        today = datetime.utcnow().date()
        campaigns = query.all()
        
        for campaign in campaigns:
            if campaign.end_date and campaign.end_date.date() < today and campaign.status == 'active':
                campaign.status = 'inactive'
                campaign.updated_at = datetime.utcnow()
        
        self.db.commit()
        
        # Re-query with updated status
        query = self.db.query(Campaign)
        if service and service != 'all':
            query = query.filter(Campaign.service == service)
        if status and status != 'all':
            query = query.filter(Campaign.status == status)
        
        campaigns = query.order_by(Campaign.created_at.desc()).all()
        
        # REVALIDATE ALL ASSET NUMBERS FOR EVERY CAMPAIGN ON EVERY FETCH
        # This ensures that if a customer was added to the database, it moves from invalid to valid
        updated_campaigns = []
        for campaign in campaigns:
            if campaign.asset_numbers or campaign.invalid_asset_numbers:
                # Combine all asset numbers (valid + invalid) for revalidation
                all_assets = list(set((campaign.asset_numbers or []) + (campaign.invalid_asset_numbers or [])))
                
                # Revalidate against current customer table
                validation_result = self.validate_asset_numbers(all_assets)
                
                # Check if anything changed
                old_valid = set(campaign.asset_numbers or [])
                old_invalid = set(campaign.invalid_asset_numbers or [])
                new_valid = set(validation_result['valid'])
                new_invalid = set(validation_result['invalid'])
                
                # Only update if there's a change
                if old_valid != new_valid or old_invalid != new_invalid:
                    campaign.asset_numbers = validation_result['valid']
                    campaign.invalid_asset_numbers = validation_result['invalid']
                    campaign.updated_at = datetime.utcnow()
                    self.db.add(campaign)
                    updated_campaigns.append(campaign)
        
        # Commit any changes
        if updated_campaigns:
            self.db.commit()
            # Refresh all updated campaigns
            for campaign in updated_campaigns:
                self.db.refresh(campaign)
        
        return campaigns
    
    def get_campaign(self, campaign_id: int) -> Campaign:
        campaign = self.db.query(Campaign).filter(Campaign.id == campaign_id).first()
        if not campaign:
            raise HTTPException(status_code=404, detail="Campaign not found")
        
        # Auto-update status based on end date
        today = datetime.utcnow().date()
        if campaign.end_date and campaign.end_date.date() < today and campaign.status == 'active':
            campaign.status = 'inactive'
            campaign.updated_at = datetime.utcnow()
            self.db.commit()
            self.db.refresh(campaign)
        
        # REVALIDATE ASSET NUMBERS FOR THIS CAMPAIGN
        if campaign.asset_numbers or campaign.invalid_asset_numbers:
            all_assets = list(set((campaign.asset_numbers or []) + (campaign.invalid_asset_numbers or [])))
            validation_result = self.validate_asset_numbers(all_assets)
            
            old_valid = set(campaign.asset_numbers or [])
            old_invalid = set(campaign.invalid_asset_numbers or [])
            new_valid = set(validation_result['valid'])
            new_invalid = set(validation_result['invalid'])
            
            if old_valid != new_valid or old_invalid != new_invalid:
                campaign.asset_numbers = validation_result['valid']
                campaign.invalid_asset_numbers = validation_result['invalid']
                campaign.updated_at = datetime.utcnow()
                self.db.commit()
                self.db.refresh(campaign)
        
        return campaign
    
    def create_campaign(self, campaign: campaign_schema.CampaignCreate, user_data: dict = None) -> Campaign:
        # Check if service exists
        service = self.db.query(CampaignService).filter(CampaignService.name == campaign.service).first()
        if not service:
            raise HTTPException(status_code=400, detail=f"Service '{campaign.service}' does not exist. Please add the service first.")
        
        # CHECK FOR EXISTING ACTIVE CAMPAIGN WITH SAME NAME AND SAME SERVICE
        # Only look for ACTIVE campaigns to convert to inactive
        existing_campaign = self.db.query(Campaign).filter(
            Campaign.name == campaign.name,
            Campaign.service == campaign.service,
            Campaign.status == 'active'  # Only convert active campaigns
        ).first()
        
        combined_assets = []
        
        if existing_campaign:
            
            # If existing campaign found, combine assets (no duplicates)
            existing_assets = existing_campaign.asset_numbers or []
            new_assets = campaign.asset_numbers or []
            
            # Combine and remove duplicates
            combined_assets = list(set(existing_assets + new_assets))
                        
            # Set the OLD campaign status to inactive
            existing_campaign.status = 'inactive'
            existing_campaign.updated_at = datetime.utcnow()
            self.db.add(existing_campaign)
            self.db.flush()  # Flush to ensure it's saved before creating new campaign
            
        else:
            # No existing active campaign, use the assets from the request
            combined_assets = campaign.asset_numbers or []
        
        # Set initial status for NEW campaign based on dates
        today = datetime.utcnow().date()
        if campaign.start_date and campaign.start_date.date() > today:
            new_status = 'inactive'  # Future campaign
        elif campaign.end_date and campaign.end_date.date() < today:
            new_status = 'inactive'  # Past campaign
        else:
            new_status = campaign.status or 'active'  # Current campaign
        
        # Prepare campaign data
        campaign_data = campaign.model_dump()
        
        # Add user tracking data - only id and name
        if user_data:
            campaign_data['created_by_id'] = user_data.get('user_id') or user_data.get('id')
            campaign_data['created_by_name'] = user_data.get('name')
        
        # Use combined assets (scripts remain as they are from the new campaign only)
        campaign_data['asset_numbers'] = combined_assets
        campaign_data['status'] = new_status
        
        # Validate ALL asset numbers against customers table
        if campaign_data.get('asset_numbers'):
            validation_result = self.validate_asset_numbers(campaign_data['asset_numbers'])
            campaign_data['asset_numbers'] = validation_result['valid']
            campaign_data['invalid_asset_numbers'] = validation_result['invalid']
        else:
            campaign_data['asset_numbers'] = []
            campaign_data['invalid_asset_numbers'] = []
        
        # Create new campaign
        db_campaign = Campaign(**campaign_data)
        self.db.add(db_campaign)
        self.db.commit()
        self.db.refresh(db_campaign)
                
        return db_campaign
    
    def update_campaign(self, campaign_id: int, campaign: campaign_schema.CampaignUpdate, user_data: dict = None) -> Campaign:
        db_campaign = self.get_campaign(campaign_id)
        
        # If service is being changed, check if new service exists
        if campaign.service and campaign.service != db_campaign.service:
            service = self.db.query(CampaignService).filter(CampaignService.name == campaign.service).first()
            if not service:
                raise HTTPException(status_code=400, detail=f"Service '{campaign.service}' does not exist")
        
        update_data = campaign.model_dump(exclude_unset=True)
        
        # Handle asset_numbers - ALWAYS REVALIDATE ALL ASSETS
        if 'asset_numbers' in update_data:
            # Get ALL asset numbers from the request (these are the ones the user wants to keep)
            # Plus any existing invalid assets that might have become valid
            requested_assets = [str(num).strip() for num in update_data['asset_numbers'] if num]
            
            # Also include existing invalid assets in the validation
            # This ensures if an invalid asset becomes valid, it moves to the valid array
            existing_invalid = db_campaign.invalid_asset_numbers or []
            all_assets_to_validate = list(set(requested_assets + existing_invalid))
            
            # Validate ALL assets against current customer table
            validation_result = self.validate_asset_numbers(all_assets_to_validate)
            
            # Update with validated results
            update_data['asset_numbers'] = validation_result['valid']
            update_data['invalid_asset_numbers'] = validation_result['invalid']
        else:
            # If asset_numbers not in update, revalidate existing assets
            # This ensures that even when only editing name/description, assets are revalidated
            existing_valid = db_campaign.asset_numbers or []
            existing_invalid = db_campaign.invalid_asset_numbers or []
            all_existing_assets = list(set(existing_valid + existing_invalid))
            
            if all_existing_assets:
                validation_result = self.validate_asset_numbers(all_existing_assets)
                update_data['asset_numbers'] = validation_result['valid']
                update_data['invalid_asset_numbers'] = validation_result['invalid']
            else:
                update_data['asset_numbers'] = existing_valid
                update_data['invalid_asset_numbers'] = existing_invalid
        
        # Handle status update
        if 'status' not in update_data:
            # Auto-update status based on date changes
            if 'start_date' in update_data or 'end_date' in update_data:
                today = datetime.utcnow().date()
                start_date = update_data.get('start_date', db_campaign.start_date)
                end_date = update_data.get('end_date', db_campaign.end_date)
                
                if end_date and end_date.date() < today:
                    update_data['status'] = 'inactive'
                elif start_date and start_date.date() <= today and (not end_date or end_date.date() >= today):
                    update_data['status'] = 'active'
        
        # Update campaign
        for key, value in update_data.items():
            setattr(db_campaign, key, value)
        
        db_campaign.updated_at = datetime.utcnow()
        self.db.commit()
        self.db.refresh(db_campaign)
        return db_campaign
    
    def delete_campaign(self, campaign_id: int):
        db_campaign = self.get_campaign(campaign_id)
        self.db.delete(db_campaign)
        self.db.commit()
        return {"message": "Campaign deleted successfully"}
    
    def update_campaign_status(self, campaign_id: int, status: str):
        if status not in ['active', 'inactive']:
            raise HTTPException(status_code=400, detail="Invalid status. Must be 'active' or 'inactive'")
        
        db_campaign = self.get_campaign(campaign_id)
        db_campaign.status = status
        db_campaign.updated_at = datetime.utcnow()
        self.db.commit()
        return db_campaign
    
    # ==================== Dashboard/Stats ====================
    
    def get_campaign_stats(self):
        # First, revalidate all campaigns to ensure stats are accurate
        campaigns = self.db.query(Campaign).all()
        
        for campaign in campaigns:
            if campaign.asset_numbers or campaign.invalid_asset_numbers:
                all_assets = list(set((campaign.asset_numbers or []) + (campaign.invalid_asset_numbers or [])))
                validation_result = self.validate_asset_numbers(all_assets)
                
                old_valid = set(campaign.asset_numbers or [])
                old_invalid = set(campaign.invalid_asset_numbers or [])
                new_valid = set(validation_result['valid'])
                new_invalid = set(validation_result['invalid'])
                
                if old_valid != new_valid or old_invalid != new_invalid:
                    campaign.asset_numbers = validation_result['valid']
                    campaign.invalid_asset_numbers = validation_result['invalid']
                    campaign.updated_at = datetime.utcnow()
                    self.db.add(campaign)
        
        self.db.commit()
        
        total_campaigns = self.db.query(Campaign).count()
        
        # Auto-update status based on dates
        today = datetime.utcnow().date()
        campaigns = self.db.query(Campaign).all()
        
        for campaign in campaigns:
            if campaign.end_date and campaign.end_date.date() < today and campaign.status == 'active':
                campaign.status = 'inactive'
                campaign.updated_at = datetime.utcnow()
        
        self.db.commit()
        
        active_campaigns = self.db.query(Campaign).filter(Campaign.status == 'active').count()
        
        # Calculate total unique asset numbers across all campaigns (only valid ones)
        all_campaigns = self.db.query(Campaign).all()
        all_asset_numbers = set()
        for campaign in all_campaigns:
            if campaign.asset_numbers:
                all_asset_numbers.update(campaign.asset_numbers)
        
        return {
            "total_campaigns": total_campaigns,
            "active_campaigns": active_campaigns,
            "total_customers": len(all_asset_numbers)  # Total unique valid asset numbers
        }

    def get_campaign_counts(self, campaign_id: int) -> Dict[str, int]:
        """Get pending and completed counts for a campaign"""
        from app.models.engagement_model import FollowUp
        
        # Get pending count from asset_numbers
        campaign = self.db.query(Campaign).filter(Campaign.id == campaign_id).first()
        pending_count = len(campaign.asset_numbers) if campaign and campaign.asset_numbers else 0
        
        # Get completed count from followups table
        completed_count = self.db.query(FollowUp).filter(
            FollowUp.campaign_id == campaign_id,
            FollowUp.status == 'completed'
        ).count()
        
        return {
            "pending": pending_count,
            "completed": completed_count,
            "total": pending_count + completed_count
        }        
    
    # Add this new method to CampaignController class
    def update_branch_codes(self, branch_updates: List[Dict[str, str]], user_data: dict = None) -> Dict:
        """
        Update branch_id for customers based on asset numbers
        Expected format: [{"asset_number": "123456778", "branch_id": "branch_code"}, ...]
        """
        from app.models.customer_model import Customer
        
        results = {
            "success": [],
            "failed": [],
            "not_found": []
        }
        
        for update in branch_updates:
            asset_number = update.get("asset_number")
            branch_id = update.get("branch_id")
            
            if not asset_number or not branch_id:
                results["failed"].append({
                    "asset_number": asset_number,
                    "branch_id": branch_id,
                    "reason": "Missing asset_number or branch_id"
                })
                continue
            
            # Find customer by instance_id
            customer = self.db.query(Customer).filter(Customer.instance_id == asset_number).first()
            
            if not customer:
                results["not_found"].append({
                    "asset_number": asset_number,
                    "branch_id": branch_id,
                    "reason": "Asset number not found in customer table"
                })
                continue
            
            # Update branch_id
            try:
                old_branch = customer.branch_id
                customer.branch_id = branch_id
                customer.last_updated_by = user_data.get('name') if user_data else None
                customer.updated_at = datetime.utcnow()
                
                self.db.commit()
                
                results["success"].append({
                    "asset_number": asset_number,
                    "branch_id": branch_id,
                    "old_branch_id": old_branch
                })
            except Exception as e:
                self.db.rollback()
                results["failed"].append({
                    "asset_number": asset_number,
                    "branch_id": branch_id,
                    "reason": str(e)
                })
        
        return results    
    
    def upsert_sp_info(self, campaign_id: int, sp_info_rows: List[Dict[str, Any]]) -> Dict:
        """
        Insert/update SP Info rows for a campaign, keyed by instance_id.
        If the same instance_id appears more than once in the upload,
        the row whose SR TYPE is 'CSP' is preferred.
        """
        from app.models.campaign_model import CampaignCSPInfo

        results = {"inserted": 0, "updated": 0, "skipped": 0}

        allowed_fields = {
            'zone_name', 'sd_id', 'sd_name', 'branch_id', 'branch_name', 'goem_oem',
            'sr_number', 'sr_open_date', 'sr_close_date', 'sr_type', 'sr_subtype',
            'sr_status', 'segment', 'product_segment', 'instance_id', 'application_code',
            'engine_serial_number', 'account_name', 'customer_name', 'customer_phone_number',
            'sr_installation_site_address', 'oil_change_flag'
        }

        # Keep ALL rows where SR TYPE == 'CSP' (instance_id duplicates allowed).
        # Dedupe within the upload by SR NUMBER, keeping the FIRST occurrence.
        deduped = {}
        for row in sp_info_rows:
            sr_type = str(row.get("sr_type") or "").strip().upper()

            # Skip any row that is not a CSP record
            if sr_type != 'CSP':
                results["skipped"] += 1
                continue

            sr_number = str(row.get("sr_number") or "").strip()
            if not sr_number:
                results["skipped"] += 1
                continue

            # Keep only the first CSP row for each SR NUMBER
            if sr_number not in deduped:
                deduped[sr_number] = row
            else:
                results["skipped"] += 1

        for sr_number, row in deduped.items():
            clean_row = {k: v for k, v in row.items() if k in allowed_fields}

            existing = self.db.query(CampaignCSPInfo).filter(
                CampaignCSPInfo.campaign_id == campaign_id,
                CampaignCSPInfo.sr_number == sr_number
            ).first()

            if existing:
                for key, value in clean_row.items():
                    setattr(existing, key, value)
                existing.updated_at = datetime.utcnow()
                results["updated"] += 1
            else:
                new_row = CampaignCSPInfo(campaign_id=campaign_id, **clean_row)
                self.db.add(new_row)
                results["inserted"] += 1

        self.db.commit()
        return results

    def get_campaign_customers_with_followups(self, campaign_id: int) -> Dict[str, Any]:
        """Get all customers for a campaign with their last follow-up data"""
        from app.models.engagement_model import FollowUp
        
        # Get campaign
        campaign = self.get_campaign(campaign_id)
        
        if not campaign:
            raise HTTPException(status_code=404, detail="Campaign not found")
        
        # Get all valid asset numbers for this campaign
        asset_numbers = campaign.asset_numbers or []
        
        # Get all completed follow-ups for this campaign
        completed_followups = self.db.query(FollowUp).filter(
            FollowUp.campaign_id == campaign_id,
            FollowUp.status == 'completed'
        ).all()
        
        # Get set of completed customer instance IDs
        completed_instance_ids = set([f.customer_instance_id for f in completed_followups if f.customer_instance_id])
        
        # Separate remaining and completed customers
        remaining_asset_numbers = [asset for asset in asset_numbers if asset not in completed_instance_ids]
        completed_asset_numbers = [asset for asset in asset_numbers if asset in completed_instance_ids]
        
        # Also include any completed customers that might have been added via follow-ups but not in asset_numbers
        # (This handles edge cases where a follow-up was marked completed but the asset wasn't in the original list)
        for followup in completed_followups:
            if followup.customer_instance_id and followup.customer_instance_id not in completed_asset_numbers:
                completed_asset_numbers.append(followup.customer_instance_id)
        
        customers_data = {
            "remaining": [],
            "completed": []
        }
        
        # Process remaining customers (from asset_numbers not completed)
        for asset_number in remaining_asset_numbers:
            customer = self.db.query(Customer).filter(Customer.instance_id == asset_number).first()
            
            if customer:
                # Get last follow-up for this customer and campaign (not completed)
                last_followup = self.db.query(FollowUp).filter(
                    FollowUp.campaign_id == campaign_id,
                    FollowUp.customer_instance_id == asset_number,
                    FollowUp.status != 'completed'  # Get non-completed follow-ups
                ).order_by(FollowUp.followup_date.desc()).first()
                
                customer_info = {
                    "instance_id": customer.instance_id,
                    "customer_name": customer.customer_name,
                    "phone_number": customer.phone_number,
                    "email": customer.email,
                    "branch_id": customer.branch_id,
                    "location": customer.location,
                    "last_status": last_followup.status if last_followup else None,
                    "last_followup_user_name": last_followup.user_name if last_followup else None,
                    "last_followup_user_id": last_followup.user_id if last_followup else None,
                    "last_followup_date": last_followup.followup_date.isoformat() if last_followup and last_followup.followup_date else None,
                    "next_followup_date": last_followup.next_followup_date.isoformat() if last_followup and last_followup.next_followup_date else None,
                    "latest_flag": last_followup.followup_flag if last_followup else None,
                    "latest_remark": last_followup.followup_remark if last_followup else None,
                    "quotation_sent": last_followup.quotation_sent if last_followup else False,
                    "quotation_value": last_followup.quotation_value if last_followup else None
                }
                customers_data["remaining"].append(customer_info)
        
        # Process completed customers
        for asset_number in completed_asset_numbers:
            customer = self.db.query(Customer).filter(Customer.instance_id == asset_number).first()
            
            if customer:
                # Get the completed follow-up for this customer
                completed_followup = self.db.query(FollowUp).filter(
                    FollowUp.campaign_id == campaign_id,
                    FollowUp.customer_instance_id == asset_number,
                    FollowUp.status == 'completed'
                ).order_by(FollowUp.followup_date.desc()).first()
                
                customer_info = {
                    "instance_id": customer.instance_id,
                    "customer_name": customer.customer_name,
                    "phone_number": customer.phone_number,
                    "email": customer.email,
                    "branch_id": customer.branch_id,
                    "location": customer.location,
                    "last_status": completed_followup.status if completed_followup else "completed",
                    "last_followup_user_name": completed_followup.user_name if completed_followup else None,
                    "last_followup_user_id": completed_followup.user_id if completed_followup else None,
                    "last_followup_date": completed_followup.followup_date.isoformat() if completed_followup and completed_followup.followup_date else None,
                    "next_followup_date": completed_followup.next_followup_date.isoformat() if completed_followup and completed_followup.next_followup_date else None,
                    "latest_flag": completed_followup.followup_flag if completed_followup else None,
                    "latest_remark": completed_followup.followup_remark if completed_followup else None,
                    "quotation_sent": completed_followup.quotation_sent if completed_followup else False,
                    "quotation_value": completed_followup.quotation_value if completed_followup else None
                }
                customers_data["completed"].append(customer_info)
        
        return {
            "campaign_info": {
                "id": campaign.id,
                "name": campaign.name,
                "service": campaign.service,
                "status": campaign.status,
                "total_customers": len(asset_numbers),
                "remaining_count": len(remaining_asset_numbers),
                "completed_count": len(completed_asset_numbers)
            },
            "customers": customers_data
        }    

# ==================== Manual CSP SR Entry ====================

    def get_open_csp_campaigns(self) -> List[Dict[str, Any]]:
        """Active CSP campaigns the user can add an SR into."""
        campaigns = self.db.query(Campaign).filter(
            Campaign.service == 'CSP',
            Campaign.status == 'active'
        ).order_by(Campaign.created_at.desc()).all()

        return [
            {"id": c.id, "name": c.name, "asset_count": len(c.asset_numbers or [])}
            for c in campaigns
        ]

    def add_sr_to_csp_campaign(self, campaign_id: int, sr_data: Dict[str, Any],
                               user_data: dict = None) -> Dict[str, Any]:
        """
        Insert a single CSP SR row into campaign_csp_info (tagged with the
        user) and add its asset number (== instance_id) to the campaign's
        asset_numbers array.
        """
        from app.models.campaign_model import CampaignCSPInfo

        campaign = self.db.query(Campaign).filter(Campaign.id == campaign_id).first()
        if not campaign:
            raise HTTPException(status_code=404, detail="Campaign not found")
        if campaign.service != 'CSP':
            raise HTTPException(status_code=400, detail="Selected campaign is not a CSP campaign")

        # Asset number and instance_id are the same thing
        instance_id = str(sr_data.get('instance_id') or sr_data.get('asset_number') or '').strip()
        if not instance_id:
            raise HTTPException(status_code=400, detail="Asset Number (Instance ID) is required")

        sr_number = str(sr_data.get('sr_number') or '').strip()
        if not sr_number:
            raise HTTPException(status_code=400, detail="SR Number is required")

        allowed_fields = {
            'branch_id', 'goem_oem', 'sr_number', 'sr_open_date', 'sr_close_date',
            'sr_type', 'sr_subtype', 'sr_status', 'segment', 'application_code'
        }
        clean_row = {k: (str(v).strip() if v is not None else None)
                     for k, v in sr_data.items() if k in allowed_fields}
        clean_row['instance_id'] = instance_id
        # Force the type so the row shows up as a CSP record everywhere else
        clean_row['sr_type'] = clean_row.get('sr_type') or 'CSP'

        # Upsert by (campaign_id + sr_number) — same key as the bulk upload
        existing = self.db.query(CampaignCSPInfo).filter(
            CampaignCSPInfo.campaign_id == campaign_id,
            CampaignCSPInfo.sr_number == sr_number
        ).first()

        if existing:
            for key, value in clean_row.items():
                setattr(existing, key, value)
            existing.created_by_id = (user_data or {}).get('user_id') or (user_data or {}).get('id')
            existing.created_by_name = (user_data or {}).get('name')
            existing.updated_at = datetime.utcnow()
            action = "updated"
        else:
            new_row = CampaignCSPInfo(
                campaign_id=campaign_id,
                created_by_id=(user_data or {}).get('user_id') or (user_data or {}).get('id'),
                created_by_name=(user_data or {}).get('name'),
                **clean_row
            )
            self.db.add(new_row)
            action = "inserted"

        # Add asset number to campaign.asset_numbers (reassign so JSON change is tracked)
        assets = list(campaign.asset_numbers or [])
        if instance_id not in assets:
            assets.append(instance_id)
            campaign.asset_numbers = assets
            campaign.updated_at = datetime.utcnow()

        # If branch supplied, sync it onto the customer record (best-effort)
        branch_id = clean_row.get('branch_id')
        if branch_id:
            customer = self.db.query(Customer).filter(Customer.instance_id == instance_id).first()
            if customer:
                customer.branch_id = branch_id
                if user_data:
                    customer.last_updated_by = user_data.get('name')
                customer.updated_at = datetime.utcnow()

        self.db.commit()

        user_id = (user_data or {}).get('user_id') or (user_data or {}).get('id')
        user_count = self.db.query(CampaignCSPInfo).filter(
            CampaignCSPInfo.created_by_id == str(user_id) if user_id else False
        ).count() if user_id else 0

        return {
            "action": action,
            "instance_id": instance_id,
            "campaign_id": campaign_id,
            "user_added_count": user_count
        }

    def get_user_csp_sr_count(self, user_id: str) -> int:
        """How many CSP SR rows this user has manually added."""
        from app.models.campaign_model import CampaignCSPInfo
        if not user_id:
            return 0
        return self.db.query(CampaignCSPInfo).filter(
            CampaignCSPInfo.created_by_id == str(user_id)
        ).count()        

