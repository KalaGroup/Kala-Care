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

    @staticmethod
    def _is_csp_service(service: Optional[str]) -> bool:
        """
        A product counts as a CSP product if its name contains 'csp'
        (case-insensitive) — e.g. 'CSP', 'CSP Battery', 'Oil CSP'.
        Central definition so every CSP check stays consistent.
        """
        return bool(service) and 'csp' in str(service).lower()
    
    # ==================== Asset Validation ====================
    
    def validate_asset_numbers(self, asset_numbers: List[str]) -> Dict[str, List[str]]:
        """Validate asset numbers against customers table (single batched query)"""
        if not asset_numbers:
            return {"valid": [], "invalid": []}
    
        # Remove duplicates and empty values
        unique_assets = list(set([str(num).strip() for num in asset_numbers if num and str(num).strip()]))
        if not unique_assets:
            return {"valid": [], "invalid": []}
    
        # ONE query instead of one-per-asset. Only select the id column (no full rows).
        # Chunk the IN(...) list so very large campaigns stay under driver limits.
        existing_ids = set()
        CHUNK = 1000
        for i in range(0, len(unique_assets), CHUNK):
            chunk = unique_assets[i:i + CHUNK]
            rows = (
                self.db.query(Customer.instance_id)
                .filter(Customer.instance_id.in_(chunk))
                .all()
            )
            existing_ids.update(r[0] for r in rows)
    
        valid_assets = [a for a in unique_assets if a in existing_ids]
        invalid_assets = [a for a in unique_assets if a not in existing_ids]

        return {"valid": valid_assets, "invalid": invalid_assets}

    def _fetch_existing_instance_ids(self, normalized_assets) -> set:
        """ONE chunked existence query for a set of already-normalized asset ids.
        Same query/chunking as validate_asset_numbers — used to batch the
        per-campaign revalidation loops into a single lookup."""
        existing_ids = set()
        assets = [a for a in normalized_assets if a]
        CHUNK = 1000
        for i in range(0, len(assets), CHUNK):
            chunk = assets[i:i + CHUNK]
            rows = (
                self.db.query(Customer.instance_id)
                .filter(Customer.instance_id.in_(chunk))
                .all()
            )
            existing_ids.update(r[0] for r in rows)
        return existing_ids

    @staticmethod
    def _split_valid_invalid(asset_numbers: List[str], existing_ids: set) -> Dict[str, List[str]]:
        """EXACTLY the same normalization/dedupe/split as validate_asset_numbers,
        but against a pre-fetched set of existing instance ids (no query)."""
        if not asset_numbers:
            return {"valid": [], "invalid": []}

        unique_assets = list(set([str(num).strip() for num in asset_numbers if num and str(num).strip()]))
        if not unique_assets:
            return {"valid": [], "invalid": []}

        valid_assets = [a for a in unique_assets if a in existing_ids]
        invalid_assets = [a for a in unique_assets if a not in existing_ids]

        return {"valid": valid_assets, "invalid": invalid_assets}

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
        # BATCHED: one customers-existence lookup for the union of every campaign's
        # assets (was one chunked query per campaign). Split logic is unchanged.
        assets_by_campaign = {}
        union_normalized = set()
        for campaign in campaigns:
            if campaign.asset_numbers or campaign.invalid_asset_numbers:
                combined = list(set((campaign.asset_numbers or []) + (campaign.invalid_asset_numbers or [])))
                assets_by_campaign[campaign.id] = combined
                union_normalized.update(
                    str(num).strip() for num in combined if num and str(num).strip()
                )
        existing_ids = self._fetch_existing_instance_ids(union_normalized) if union_normalized else set()

        updated_campaigns = []
        for campaign in campaigns:
            all_assets = assets_by_campaign.get(campaign.id)
            if all_assets is not None:
                # Revalidate against current customer table (batched lookup above)
                validation_result = self._split_valid_invalid(all_assets, existing_ids)

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
    
    def create_campaign(self, campaign: campaign_schema.CampaignCreate, user_data: dict = None,
                        transfer_from_campaign_ids: Optional[List[int]] = None,
                        transfer_statuses: Optional[List[str]] = None) -> Campaign:
        # Check if service exists
        service = self.db.query(CampaignService).filter(CampaignService.name == campaign.service).first()
        if not service:
            raise HTTPException(status_code=400, detail=f"Service '{campaign.service}' does not exist. Please add the service first.")

        # Start with the assets the user added to the new campaign.
        combined_assets = list(campaign.asset_numbers or [])

        # TRANSFER ASSETS FROM USER-SELECTED CAMPAIGNS (SAME PRODUCT ONLY).
        # The user picks which active same-product campaigns to pull from AND
        # which last-follow-up statuses to carry over. Only assets whose most
        # recent follow-up status is in `transfer_statuses` move. Each selected
        # source campaign is set to inactive regardless of how many matched.
        if transfer_from_campaign_ids:
            # Which statuses to carry over. If the caller sends nothing, default
            # to every transferable status (everything except 'completed').
            allowed_statuses = {
                (s or '').strip().lower() for s in transfer_statuses
            } if transfer_statuses else {
                'wip', 'rescheduled', 'rejected', 'not_connected', 'pending'
            }

            source_campaigns = self.db.query(Campaign).filter(
                Campaign.id.in_(transfer_from_campaign_ids),
                Campaign.service == campaign.service,   # safety: same product only
                Campaign.status == 'active'             # only inactivate active ones
            ).all()

            for src in source_campaigns:
                src_assets = src.asset_numbers or []
                status_map = self._get_asset_last_status_map(src.id, src_assets)

                # Pull only assets whose last status is one the user selected
                matching = [
                    a for a in src_assets
                    if status_map.get(str(a), 'pending') in allowed_statuses
                ]
                combined_assets.extend(matching)

                src.status = 'inactive'
                src.updated_at = datetime.utcnow()
                self.db.add(src)

            if source_campaigns:
                self.db.flush()  # persist inactivation before creating the new campaign

        # Remove duplicate asset numbers
        combined_assets = list(set(combined_assets))

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

    def _get_asset_last_status_map(self, campaign_id: int, asset_numbers: List[str]) -> Dict[str, str]:
        """
        For each asset (instance_id) in a campaign, return the status of its
        MOST RECENT follow-up for THIS campaign. Assets with no follow-up yet
        are reported as 'pending'.
        Status values come from the FollowUp model:
        'wip', 'rescheduled', 'rejected', 'not_connected', 'completed', 'pending'.
        """
        from app.models.engagement_model import FollowUp

        status_map = {str(a): 'pending' for a in (asset_numbers or [])}
        if not status_map:
            return status_map

        followups = (
            self.db.query(FollowUp)
            .filter(FollowUp.campaign_id == campaign_id)
            .order_by(FollowUp.followup_date.desc())
            .all()
        )

        seen = set()
        for f in followups:
            cid = f.customer_instance_id
            if not cid or cid in seen:
                continue
            if cid in status_map:
                status_map[cid] = (f.status or 'pending').strip().lower()
                seen.add(cid)

        return status_map    
    
    def update_campaign(self, campaign_id: int, campaign: campaign_schema.CampaignUpdate, user_data: dict = None) -> Campaign:
        db_campaign = self.get_campaign(campaign_id)
        
        # If service is being changed, check if new service exists
        if campaign.service and campaign.service != db_campaign.service:
            service = self.db.query(CampaignService).filter(CampaignService.name == campaign.service).first()
            if not service:
                raise HTTPException(status_code=400, detail=f"Service '{campaign.service}' does not exist")

            # CSP -> non-CSP: clean up CSP Info rows so a non-CSP drive is never
            # left with orphaned entries in campaign_csp_info.
            if self._is_csp_service(db_campaign.service) and not self._is_csp_service(campaign.service):
                from app.models.campaign_model import CampaignCSPInfo
                self.db.query(CampaignCSPInfo).filter(
                    CampaignCSPInfo.campaign_id == campaign_id
                ).delete(synchronize_session=False)
        
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

    def get_active_campaigns_by_service(self, service: str) -> List[Dict[str, Any]]:
        """
        Active campaigns for a given product/service.
        Used by the 'transfer assets' picker shown when creating a new campaign
        for a product that already has active campaigns.

        Each campaign also carries a `status_breakdown` — how many of its assets
        currently sit in each last-follow-up status. This drives the status
        checkboxes in the transfer modal so the user can carry over only the
        assets in the statuses they care about.
        """
        campaigns = self.db.query(Campaign).filter(
            Campaign.service == service,
            Campaign.status == 'active'
        ).order_by(Campaign.created_at.desc()).all()

        BUCKETS = ('wip', 'rescheduled', 'rejected', 'not_connected', 'pending', 'completed')

        result = []
        for c in campaigns:
            assets = c.asset_numbers or []
            status_map = self._get_asset_last_status_map(c.id, assets)

            breakdown = {b: 0 for b in BUCKETS}
            for st in status_map.values():
                key = st if st in breakdown else 'pending'
                breakdown[key] += 1

            result.append({
                "id": c.id,
                "name": c.name,
                "asset_count": len(assets),
                "start_date": c.start_date.isoformat() if c.start_date else None,
                "end_date": c.end_date.isoformat() if c.end_date else None,
                "created_by_name": c.created_by_name,
                "status_breakdown": breakdown,
            })
        return result        
    
    def delete_campaign(self, campaign_id: int):
        import logging
        from app.models.engagement_model import FollowUp

        db_campaign = self.get_campaign(campaign_id)

        # Only a logged follow-up blocks deletion. Select just the id.
        followup_exists = (
            self.db.query(FollowUp.id)
            .filter(FollowUp.campaign_id == campaign_id)
            .first()
        )
        if followup_exists:
            return {
                "deleted": False,
                "warning": True,
                "message": "Drive is already in use and cannot be removed"
            }

        try:
            self.db.delete(db_campaign)
            self.db.commit()
        except Exception as e:
            self.db.rollback()
            # Surface the real reason instead of masking every error as "in use".
            logging.exception("Failed to delete campaign %s", campaign_id)
            raise HTTPException(
                status_code=409,
                detail=f"Could not delete drive: {str(e)}"
            )

        return {
            "deleted": True,
            "warning": False,
            "message": "Drive deleted successfully"
        }
    
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

        # BATCHED: one customers-existence lookup for the union of every campaign's
        # assets (was one chunked query per campaign). Split logic is unchanged.
        assets_by_campaign = {}
        union_normalized = set()
        for campaign in campaigns:
            if campaign.asset_numbers or campaign.invalid_asset_numbers:
                combined = list(set((campaign.asset_numbers or []) + (campaign.invalid_asset_numbers or [])))
                assets_by_campaign[campaign.id] = combined
                union_normalized.update(
                    str(num).strip() for num in combined if num and str(num).strip()
                )
        existing_ids = self._fetch_existing_instance_ids(union_normalized) if union_normalized else set()

        for campaign in campaigns:
            all_assets = assets_by_campaign.get(campaign.id)
            if all_assets is not None:
                validation_result = self._split_valid_invalid(all_assets, existing_ids)

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

# ==================== Drive Meta (separate table) ====================

    def get_all_drive_meta(self):
        """All rows from the separate drive-meta table (one per drive)."""
        from app.models.campaign_model import CampaignDriveMeta
        return self.db.query(CampaignDriveMeta).all()

    def upsert_drive_meta(self, campaign_id: int,
                          data: campaign_schema.DriveMetaUpsert):
        """
        Create or update the drive-meta row for a campaign.
        Writes ONLY to campaign_drive_meta — the campaigns table is untouched.
        """
        from app.models.campaign_model import CampaignDriveMeta

        # Light existence check (no asset revalidation like get_campaign does)
        exists = self.db.query(Campaign.id).filter(Campaign.id == campaign_id).first()
        if not exists:
            raise HTTPException(status_code=404, detail="Campaign not found")

        row = self.db.query(CampaignDriveMeta).filter(
            CampaignDriveMeta.campaign_id == campaign_id
        ).first()

        update_data = data.model_dump(exclude_unset=True)

        if row:
            for key, value in update_data.items():
                setattr(row, key, value)
            row.updated_at = datetime.utcnow()
        else:
            row = CampaignDriveMeta(campaign_id=campaign_id, **update_data)
            self.db.add(row)

        self.db.commit()
        self.db.refresh(row)
        return row        
    
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

        GUARD: rows are only ever written for a CSP campaign (service name
        contains 'csp'). This stops a non-CSP drive from getting rows in
        campaign_csp_info even if the client calls this endpoint by mistake.
        """
        from app.models.campaign_model import CampaignCSPInfo

        campaign = self.db.query(Campaign).filter(Campaign.id == campaign_id).first()
        if not campaign:
            raise HTTPException(status_code=404, detail="Campaign not found")
        if not self._is_csp_service(campaign.service):
            raise HTTPException(
                status_code=400,
                detail="CSP Info can only be uploaded for a CSP product (its name must contain 'CSP')."
            )

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
        """Get all customers for a campaign with their last follow-up data (batched)"""
        from app.models.engagement_model import FollowUp, RR

        campaign = self.get_campaign(campaign_id)
        if not campaign:
            raise HTTPException(status_code=404, detail="Campaign not found")

        asset_numbers = campaign.asset_numbers or []

        # ---- 1. Pull EVERY follow-up for this campaign in ONE query (date desc) ----
        all_followups = (
            self.db.query(FollowUp)
            .filter(FollowUp.campaign_id == campaign_id)
            .order_by(FollowUp.followup_date.desc())
            .all()
        )

        # Build "latest" maps in a single pass (list is already newest-first)
        latest_completed = {}
        latest_open = {}
        completed_instance_ids = set()
        for f in all_followups:
            cid = f.customer_instance_id
            if not cid:
                continue
            if f.status == 'completed':
                completed_instance_ids.add(cid)
                if cid not in latest_completed:
                    latest_completed[cid] = f
            else:
                if cid not in latest_open:
                    latest_open[cid] = f

        # ---- 2. Split remaining vs completed ----
        remaining_asset_numbers = [a for a in asset_numbers if a not in completed_instance_ids]
        completed_asset_numbers = [a for a in asset_numbers if a in completed_instance_ids]

        # Completed follow-ups whose asset wasn't in the original list (edge case)
        for cid in completed_instance_ids:
            if cid not in completed_asset_numbers:
                completed_asset_numbers.append(cid)

        # ---- 3. Fetch ALL needed customers in ONE query (chunked) ----
        needed_ids = list(set(remaining_asset_numbers + completed_asset_numbers))
        customer_map = {}
        CHUNK = 1000
        for i in range(0, len(needed_ids), CHUNK):
            chunk = needed_ids[i:i + CHUNK]
            for c in self.db.query(Customer).filter(Customer.instance_id.in_(chunk)).all():
                customer_map[c.instance_id] = c

        # Rejection reasons for the latest follow-ups (batched, one query)
        rr_ids = {
            f.rr_id
            for f in list(latest_open.values()) + list(latest_completed.values())
            if f.rr_id
        }
        rr_lookup = {}
        if rr_ids:
            for r in self.db.query(RR).filter(RR.id.in_(rr_ids)).all():
                rr_lookup[r.id] = r

        def build_info(customer, fu, default_status=None):
            rr = rr_lookup.get(fu.rr_id) if fu and fu.rr_id else None
            return {
                "instance_id": customer.instance_id,
                "customer_name": customer.customer_name,
                "phone_number": customer.phone_number,
                "email": customer.email,
                "branch_id": customer.branch_id,
                "location": customer.location,
                "last_status": fu.status if fu else default_status,
                "csp_subtype": fu.csp_subtype if fu else None,
                "last_followup_user_name": fu.user_name if fu else None,
                "last_followup_user_id": fu.user_id if fu else None,
                "last_followup_date": fu.followup_date.isoformat() if fu and fu.followup_date else None,
                "next_followup_date": fu.next_followup_date.isoformat() if fu and fu.next_followup_date else None,
                "latest_flag": fu.followup_flag if fu else None,
                "latest_remark": fu.followup_remark if fu else None,
                "rr_content": rr.content if rr else None,
                "quotation_sent": fu.quotation_sent if fu else False,
                "quotation_value": fu.quotation_value if fu else None,
            }

        customers_data = {"remaining": [], "completed": []}

        for asset_number in remaining_asset_numbers:
            customer = customer_map.get(asset_number)
            if customer:
                customers_data["remaining"].append(
                    build_info(customer, latest_open.get(asset_number))
                )

        for asset_number in completed_asset_numbers:
            customer = customer_map.get(asset_number)
            if customer:
                customers_data["completed"].append(
                    build_info(customer, latest_completed.get(asset_number), default_status="completed")
                )

        return {
            "campaign_info": {
                "id": campaign.id,
                "name": campaign.name,
                "service": campaign.service,
                "status": campaign.status,
                "total_customers": len(asset_numbers),
                "remaining_count": len(remaining_asset_numbers),
                "completed_count": len(completed_asset_numbers),
            },
            "customers": customers_data,
        }    

# ==================== Manual CSP SR Entry ====================

    def get_open_csp_campaigns(self) -> List[Dict[str, Any]]:
        """Active CSP campaigns the user can add an SR into."""
        campaigns = self.db.query(Campaign).filter(
            Campaign.service.ilike('%csp%'),
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
        if not self._is_csp_service(campaign.service):
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

# ==================== Letter Master (Letter Format) ====================

    def get_all_letter_formats(self, include_expired: bool = True,
                               strip_attachment_content: bool = False):
        from app.models.campaign_model import CampaignLetterFormat

        formats = (
            self.db.query(CampaignLetterFormat)
            .order_by(CampaignLetterFormat.created_at.desc())
            .all()
        )

        # Send Letter wizard (include_expired=False) -> drop EXPIRED formats.
        # expiry_date = "date after which this format should not be used", so a
        # format stays usable up to AND including its expiry date. Formats with
        # no expiry_date are always kept.
        if not include_expired:
            today = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
            kept = []
            for f in formats:
                if f.expiry_date:
                    exp = f.expiry_date
                    if isinstance(exp, datetime):
                        exp = exp.replace(hour=0, minute=0, second=0, microsecond=0)
                    else:
                        exp = datetime.combine(exp, datetime.min.time())
                    if exp < today:
                        continue  # expired -> skip
                kept.append(f)
            formats = kept

        # Optionally strip the heavy base64 attachment `content` (files up to 25MB
        # each). Callers that only render the attachment COUNT/metadata — the admin
        # Letter Master table and the Send Letter wizard's format picker — request
        # this so the list payload stays small and loads fast; they hydrate the real
        # content on demand via get_letter_format() when a specific format is
        # opened/selected. Callers that need the content inline leave this off.
        if strip_attachment_content:
            for f in formats:
                # Detach from the session so the trimming can never be persisted.
                self.db.expunge(f)
                atts = f.default_attachments or []
                f.default_attachments = [
                    {k: v for k, v in (a or {}).items() if k != 'content'}
                    for a in atts
                ]

        return formats

    def get_distinct_goem_oem(self) -> List[str]:
        """Return all distinct non-null goem_oem values from asset_detailed."""
        from app.models.customer_model import AssetDetailed
        rows = (
            self.db.query(AssetDetailed.goem_oem)
            .filter(AssetDetailed.goem_oem.isnot(None))
            .distinct()
            .order_by(AssetDetailed.goem_oem)
            .all()
        )
        return [r[0] for r in rows if r[0] and str(r[0]).strip()]

    def get_letter_format(self, format_id: int):
        from app.models.campaign_model import CampaignLetterFormat
        fmt = self.db.query(CampaignLetterFormat).filter(
            CampaignLetterFormat.id == format_id
        ).first()
        if not fmt:
            raise HTTPException(status_code=404, detail="Letter format not found")
        return fmt

    def create_letter_format(self, data: campaign_schema.LetterFormatCreate,
                             user_data: dict = None):
        from app.models.campaign_model import CampaignLetterFormat

        name = (data.format_type_name or "").strip()
        if not name:
            raise HTTPException(status_code=400, detail="Format Type Name is required")

        existing = self.db.query(CampaignLetterFormat).filter(
            CampaignLetterFormat.format_type_name == name
        ).first()
        if existing:
            raise HTTPException(status_code=400, detail="A format with this name already exists")

        payload = data.model_dump()
        payload["format_type_name"] = name

        # Ensure JSON list fields are never None
        payload["customer_detail_fields"] = payload.get("customer_detail_fields") or []
        payload["engagement_detail_fields"] = payload.get("engagement_detail_fields") or []
        payload["default_attachments"] = payload.get("default_attachments") or []
        payload["products"] = payload.get("products") or []
        payload["default_recipients"] = payload.get("default_recipients") or []
        payload["service_cycle_rows"] = payload.get("service_cycle_rows") or []
        payload["include_service_cycle"] = bool(payload.get("include_service_cycle"))

        # Default serial_start to '1' if not provided
        if not payload.get("serial_start"):
            payload["serial_start"] = "1"

        if user_data:
            payload["created_by_id"] = user_data.get("user_id") or user_data.get("id")
            payload["created_by_name"] = user_data.get("name")

        db_fmt = CampaignLetterFormat(**payload)
        self.db.add(db_fmt)
        self.db.commit()
        self.db.refresh(db_fmt)
        return db_fmt

    def update_letter_format(self, format_id: int, data: campaign_schema.LetterFormatUpdate,
                             user_data: dict = None):
        from app.models.campaign_model import CampaignLetterFormat

        db_fmt = self.get_letter_format(format_id)
        update_data = data.model_dump(exclude_unset=True)

        new_name = update_data.get("format_type_name")
        if new_name and new_name.strip() != db_fmt.format_type_name:
            exists = self.db.query(CampaignLetterFormat).filter(
                CampaignLetterFormat.format_type_name == new_name.strip(),
                CampaignLetterFormat.id != format_id
            ).first()
            if exists:
                raise HTTPException(status_code=400, detail="A format with this name already exists")
            update_data["format_type_name"] = new_name.strip()

        # Ensure JSON list fields are never set to None
        for list_field in ("customer_detail_fields", "engagement_detail_fields",
                           "default_attachments", "products", "default_recipients",
                           "service_cycle_rows"):
            if list_field in update_data and update_data[list_field] is None:
                update_data[list_field] = []

        # Default serial_start to '1' if explicitly set to empty
        if "serial_start" in update_data and not update_data["serial_start"]:
            update_data["serial_start"] = "1"

        # LOCK the Serial No once a letter has already been SENT with this format.
        # Re-saving the SAME number is fine; only an actual CHANGE is blocked.
        if "serial_start" in update_data:
            new_serial = str(update_data.get("serial_start") or "1")
            current_serial = str(db_fmt.serial_start or "1")
            if new_serial != current_serial:
                try:
                    from app.models.engagement_model import LetterSendRecord
                except ImportError:
                    from app.models.letter_model import LetterSendRecord  # adjust path if different
                sent_count = self.db.query(LetterSendRecord).filter(
                    LetterSendRecord.format_type_id == format_id,
                    LetterSendRecord.status.in_(['sent', 'partial'])
                ).count()
                if sent_count > 0:
                    raise HTTPException(
                        status_code=400,
                        detail="Serial number cannot be changed because a letter has already been sent with this format."
                    )

        for key, value in update_data.items():
            setattr(db_fmt, key, value)

        db_fmt.updated_at = datetime.utcnow()
        self.db.commit()
        self.db.refresh(db_fmt)
        return db_fmt

    def delete_letter_format(self, format_id: int):
        db_fmt = self.get_letter_format(format_id)
        self.db.delete(db_fmt)
        self.db.commit()
        return {"deleted": True, "message": "Letter format deleted successfully"}

    def get_letter_format_usage(self, format_id: int) -> Dict[str, Any]:
        """
        Has this format already been used to SEND a letter to a customer?
        Drives the Serial No lock in Letter Master. Counts status 'sent' or
        'partial' (drafts and failed attempts do NOT count).
        """
        self.get_letter_format(format_id)  # 404 if it doesn't exist

        try:
            from app.models.engagement_model import LetterSendRecord
        except ImportError:
            from app.models.letter_model import LetterSendRecord  # adjust path if different

        sent_count = self.db.query(LetterSendRecord).filter(
            LetterSendRecord.format_type_id == format_id,
            LetterSendRecord.status.in_(['sent', 'partial'])
        ).count()

        return {
            "format_id": format_id,
            "sent_count": sent_count,
            "serial_locked": sent_count > 0,
        }

# ==================== Branch Email Master ====================

    def get_all_branch_emails(self) -> List:
        """Return all branch email rows ordered by branch_code."""
        from app.models.campaign_model import BranchEmailMaster
        return (
            self.db.query(BranchEmailMaster)
            .order_by(BranchEmailMaster.branch_code)
            .all()
        )

    def bulk_save_branch_emails(self, data: campaign_schema.BranchEmailBulkSave) -> Dict:
        """
        Upsert branch emails.
        Each entry is matched by branch_code — insert if new, update if exists.
        Returns count of saved rows and any per-row errors.
        """
        from app.models.campaign_model import BranchEmailMaster

        saved = 0
        errors = []

        for entry in data.entries:
            try:
                # Prefer the new multi-email list; fall back to single email for old clients
                emails = entry.emails if entry.emails else ([entry.email] if entry.email else [])
                primary_email = emails[0] if emails else None

                existing = (
                    self.db.query(BranchEmailMaster)
                    .filter(BranchEmailMaster.branch_code == entry.branch_code)
                    .first()
                )
                if existing:
                    existing.emails = emails
                    existing.email = primary_email          # keep single column in sync (backward compat)
                    existing.branch_name = entry.branch_name
                    existing.updated_at = datetime.utcnow()
                else:
                    row = BranchEmailMaster(
                        branch_code=entry.branch_code,
                        branch_name=entry.branch_name,
                        emails=emails,
                        email=primary_email
                    )
                    self.db.add(row)
                saved += 1
            except Exception as e:
                errors.append({
                    "branch_code": entry.branch_code,
                    "branch_name": entry.branch_name,
                    "error": str(e)
                })

        self.db.commit()
        return {"saved": saved, "errors": errors}