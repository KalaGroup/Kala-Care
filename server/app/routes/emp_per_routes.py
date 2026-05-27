from fastapi import APIRouter, Depends, HTTPException, status, Response, Query, Request
from sqlalchemy.orm import Session
from fastapi.responses import JSONResponse
from typing import Optional, List
from pydantic import BaseModel
from datetime import datetime, timedelta, timezone
import io
import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment

from app.database import SessionLocal
from app.controllers import emp_per_controller
from app.models.non_followup_model import NonFollowUp

router = APIRouter(prefix="/api/performance", tags=["performance"])

# IST timezone (UTC+5:30)
IST = timezone(timedelta(hours=5, minutes=30))

# Pydantic models
class UserInfo(BaseModel):
    user_id: str
    name: str
    branch: Optional[str] = None
    role: str

class BranchReportRequest(BaseModel):
    branch_code: str
    user_info: UserInfo

class CampaignPerformanceRequest(BaseModel):
    user_info: UserInfo
    campaign_id: Optional[int] = None

class CampaignFilterRequest(BaseModel):
    user_info: UserInfo
    campaign_ids: Optional[List[int]] = None

def is_admin(role: str) -> bool:
    admin_roles = ['master_admin', 'it_admin', 'branch_admin']
    return role.lower() in admin_roles

def is_super_admin(role: str) -> bool:
    super_admin_roles = ['master_admin', 'it_admin']
    return role.lower() in super_admin_roles

def can_view_branch_data(role: str) -> bool:
    """Check if user can view branch-level data (includes branch_admin)"""
    allowed_roles = ['master_admin', 'it_admin', 'branch_admin']
    return role.lower() in allowed_roles    

def convert_ist_to_utc_datetime(date_str: str, is_end_date: bool = False):
    """
    Convert IST date string to UTC datetime object
    """
    if not date_str:
        return None
    
    try:
        dt = datetime.strptime(date_str, '%Y-%m-%d')
        if is_end_date:
            dt = dt.replace(hour=23, minute=59, second=59, microsecond=999999)
        else:
            dt = dt.replace(hour=0, minute=0, second=0, microsecond=0)
        
        # Make timezone-aware as IST
        dt_ist = dt.replace(tzinfo=IST)
        # Convert to UTC
        dt_utc = dt_ist.astimezone(timezone.utc)
        return dt_utc
    except Exception as e:
        print(f"Error converting date to UTC: {e}")
        return None

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# ENDPOINT - Daily Details
@router.post("/my-performance/daily-details")
async def get_my_performance_daily_details(
    user_info: UserInfo,
    time_period: str = Query('all', description="Time period: all, month, 3months, 6months, year"),
    start_date: Optional[str] = Query(None, description="Start date for custom range (YYYY-MM-DD)"),
    end_date: Optional[str] = Query(None, description="End date for custom range (YYYY-MM-DD)"),
    db: Session = Depends(get_db)
):
    """
    Get daily performance details with working hours for logged-in user
    """
    try:
        user_id = user_info.user_id
        if not user_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="User ID not found"
            )
        
        start_datetime = None
        end_datetime = None
        
        # Convert dates to UTC datetime objects if provided
        if start_date and end_date:
            try:
                datetime.strptime(start_date, '%Y-%m-%d')
                datetime.strptime(end_date, '%Y-%m-%d')
                start_datetime = convert_ist_to_utc_datetime(start_date, is_end_date=False)
                end_datetime = convert_ist_to_utc_datetime(end_date, is_end_date=True)
            except ValueError:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Invalid date format. Use YYYY-MM-DD"
                )
        
        # Get daily performance with datetime objects
        daily_performance = emp_per_controller.EmployeePerformanceController.get_daily_performance_with_details(
            db, user_id, time_period, start_datetime, end_datetime
        )
                
        return daily_performance
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error in daily-details endpoint: {str(e)}")
        import traceback
        traceback.print_exc()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )

# Existing endpoint
@router.post("/my-performance")
async def get_my_performance(
    user_info: UserInfo,
    time_period: str = Query('all', description="Time period: all, month, 3months, 6months, year"),
    start_date: Optional[str] = Query(None, description="Start date for custom range (YYYY-MM-DD)"),
    end_date: Optional[str] = Query(None, description="End date for custom range (YYYY-MM-DD)"),
    db: Session = Depends(get_db)
):
    """
    Get performance data for logged-in user with time filter or custom date range
    """
    try:
        user_id = user_info.user_id
        if not user_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="User ID not found"
            )
        
        start_datetime = None
        end_datetime = None
        
        if start_date and end_date:
            try:
                datetime.strptime(start_date, '%Y-%m-%d')
                datetime.strptime(end_date, '%Y-%m-%d')
                start_datetime = convert_ist_to_utc_datetime(start_date, is_end_date=False)
                end_datetime = convert_ist_to_utc_datetime(end_date, is_end_date=True)
            except ValueError:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Invalid date format. Use YYYY-MM-DD"
                )
        
        performance = await emp_per_controller.EmployeePerformanceController.get_employee_performance(
            db, user_id, user_info.name, user_info.branch, time_period, start_datetime, end_datetime
        )
        
        return performance
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )

@router.post("/all-employees")
async def get_all_employees_performance(
    user_info: UserInfo,
    branch_code: Optional[str] = None,
    time_period: str = Query('all', description="Time period: all, month, 3months, 6months, year"),
    start_date: Optional[str] = Query(None, description="Start date for custom range (YYYY-MM-DD)"),
    end_date: Optional[str] = Query(None, description="End date for custom range (YYYY-MM-DD)"),
    db: Session = Depends(get_db)
):
    """
    Get performance for all employees with time filter or custom date range (admin only)
    """
    try:
        # Check if user has admin role (master_admin, it_admin, or branch_admin)
        if not is_admin(user_info.role):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only admins can view all employees' performance"
            )
        
        # For branch_admin, filter by their branch
        if user_info.role.lower() == 'branch_admin':
            branch_code = user_info.branch
        
        start_datetime = None
        end_datetime = None
        
        # Validate and convert custom date range to UTC datetime objects
        if start_date and end_date:
            try:
                datetime.strptime(start_date, '%Y-%m-%d')
                datetime.strptime(end_date, '%Y-%m-%d')
                start_datetime = convert_ist_to_utc_datetime(start_date, is_end_date=False)
                end_datetime = convert_ist_to_utc_datetime(end_date, is_end_date=True)
            except ValueError:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Invalid date format. Use YYYY-MM-DD"
                )
        
        performances = await emp_per_controller.EmployeePerformanceController.get_all_employees_performance(
            db, branch_code, time_period, start_datetime, end_datetime
        )
        
        return performances
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )

@router.post("/branch-performance")
async def get_branch_performance(
    user_info: UserInfo,
    branch_code: Optional[str] = None,
    time_period: str = Query('all', description="Time period: all, month, 3months, 6months, year"),
    start_date: Optional[str] = Query(None, description="Start date for custom range (YYYY-MM-DD)"),
    end_date: Optional[str] = Query(None, description="End date for custom range (YYYY-MM-DD)"),
    db: Session = Depends(get_db)
):
    """
    Get branch-wise performance with time filter or custom date range (admin only)
    """
    try:
        # Check if user has admin role (master_admin, it_admin, or branch_admin)
        if not is_admin(user_info.role):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only admins can view branch performance"
            )
        
        # For branch_admin, only show their branch
        if user_info.role.lower() == 'branch_admin':
            branch_code = user_info.branch
        
        start_datetime = None
        end_datetime = None
        
        # Validate and convert custom date range to UTC datetime objects
        if start_date and end_date:
            try:
                datetime.strptime(start_date, '%Y-%m-%d')
                datetime.strptime(end_date, '%Y-%m-%d')
                start_datetime = convert_ist_to_utc_datetime(start_date, is_end_date=False)
                end_datetime = convert_ist_to_utc_datetime(end_date, is_end_date=True)
            except ValueError:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Invalid date format. Use YYYY-MM-DD"
                )
        
        performances = await emp_per_controller.EmployeePerformanceController.get_branch_performance(
            db, branch_code, time_period, start_datetime, end_datetime
        )
        
        return performances
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )

@router.post("/branches")
async def get_all_branches(
    user_info: UserInfo,
    db: Session = Depends(get_db)
):
    """
    Get all branch codes (super admin only - master_admin and it_admin)
    """
    try:
        # Only master_admin and it_admin can see all branches
        if not is_super_admin(user_info.role):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only master admins and IT admins can view all branches"
            )
        
        branches = await emp_per_controller.EmployeePerformanceController.get_all_branches(db)
        
        return {"branches": branches}
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )

@router.post("/branch-employees")
async def get_branch_employees(
    request: BranchReportRequest,
    time_period: str = Query('all', description="Time period: all, month, 3months, 6months, year"),
    start_date: Optional[str] = Query(None, description="Start date for custom range (YYYY-MM-DD)"),
    end_date: Optional[str] = Query(None, description="End date for custom range (YYYY-MM-DD)"),
    db: Session = Depends(get_db)
):
    """
    Get all employees for a specific branch with their performance data (admin only)
    """
    try:
        # Check if user has admin role
        if not is_admin(request.user_info.role):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only admins can view branch employees"
            )
        
        # For branch_admin, only allow accessing their own branch
        if request.user_info.role.lower() == 'branch_admin':
            if request.branch_code != request.user_info.branch:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Branch admins can only view their own branch"
                )
        
        start_datetime = None
        end_datetime = None
        
        # Validate and convert custom date range to UTC datetime objects
        if start_date and end_date:
            try:
                datetime.strptime(start_date, '%Y-%m-%d')
                datetime.strptime(end_date, '%Y-%m-%d')
                start_datetime = convert_ist_to_utc_datetime(start_date, is_end_date=False)
                end_datetime = convert_ist_to_utc_datetime(end_date, is_end_date=True)
            except ValueError:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Invalid date format. Use YYYY-MM-DD"
                )
        
        employees = await emp_per_controller.EmployeePerformanceController.get_employees_by_branch(
            db, request.branch_code, time_period, start_datetime, end_datetime
        )
        
        return employees
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )

@router.post("/export-branch-employees")
async def export_branch_employees_excel(
    request: BranchReportRequest,
    time_period: str = Query('all', description="Time period: all, month, 3months, 6months, year"),
    start_date: Optional[str] = Query(None, description="Start date for custom range (YYYY-MM-DD)"),
    end_date: Optional[str] = Query(None, description="End date for custom range (YYYY-MM-DD)"),
    db: Session = Depends(get_db)
):
    """
    Export all employees for a specific branch to Excel with time filter or custom date range (admin only)
    """
    try:
        # Check if user has admin role
        if not is_admin(request.user_info.role):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only admins can export data"
            )
        
        # For branch_admin, only allow exporting their own branch
        if request.user_info.role.lower() == 'branch_admin':
            if request.branch_code != request.user_info.branch:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Branch admins can only export their own branch"
                )
        
        # Store original dates for filename
        original_start_date = start_date
        original_end_date = end_date
        
        start_datetime = None
        end_datetime = None
        
        # Validate and convert custom date range to UTC datetime objects
        if start_date and end_date:
            try:
                datetime.strptime(start_date, '%Y-%m-%d')
                datetime.strptime(end_date, '%Y-%m-%d')
                start_datetime = convert_ist_to_utc_datetime(start_date, is_end_date=False)
                end_datetime = convert_ist_to_utc_datetime(end_date, is_end_date=True)
            except ValueError:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Invalid date format. Use YYYY-MM-DD"
                )
        
        excel_file = await emp_per_controller.EmployeePerformanceController.export_branch_to_excel(
            db, request.branch_code, time_period, start_datetime, end_datetime
        )
        
        if original_start_date and original_end_date:
            filename = f"branch_{request.branch_code}_{original_start_date}_to_{original_end_date}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.xlsx"
        else:
            period_text = {
                'all': 'all_time',
                'month': 'last_30_days',
                '3months': 'last_3_months',
                '6months': 'last_6_months',
                'year': 'last_12_months'
            }.get(time_period, 'all_time')
            filename = f"branch_{request.branch_code}_{period_text}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.xlsx"
        
        return Response(
            content=excel_file.getvalue(),
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": f"attachment; filename={filename}"}
        )
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )

@router.post("/campaign-performance")
async def get_campaign_performance(
    request: CampaignPerformanceRequest,
    time_period: str = Query('all', description="Time period: all, month, 3months, 6months, year"),
    start_date: Optional[str] = Query(None, description="Start date for custom range (YYYY-MM-DD)"),
    end_date: Optional[str] = Query(None, description="End date for custom range (YYYY-MM-DD)"),
    db: Session = Depends(get_db)
):
    """
    Get campaign performance data with success percentages and time filter or custom date range
    """
    try:
        user_info_dict = request.user_info.dict() if request.user_info else None
        
        start_datetime = None
        end_datetime = None
        
        # Validate and convert custom date range to UTC datetime objects
        if start_date and end_date:
            try:
                datetime.strptime(start_date, '%Y-%m-%d')
                datetime.strptime(end_date, '%Y-%m-%d')
                start_datetime = convert_ist_to_utc_datetime(start_date, is_end_date=False)
                end_datetime = convert_ist_to_utc_datetime(end_date, is_end_date=True)
            except ValueError:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Invalid date format. Use YYYY-MM-DD"
                )
        
        if request.campaign_id:
            # Get specific campaign details
            campaign_details = await emp_per_controller.EmployeePerformanceController.get_campaign_details(
                db, request.campaign_id, user_info_dict, time_period, start_datetime, end_datetime
            )
            if not campaign_details:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Campaign not found"
                )
            return campaign_details
        else:
            # Get all campaigns performance
            campaigns = await emp_per_controller.EmployeePerformanceController.get_campaign_performance(
                db, user_info_dict, time_period, start_datetime, end_datetime
            )
            return {"campaigns": campaigns}
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )

@router.get("/summary")
async def get_performance_summary(
    user_id: str = Query(...),
    name: str = Query(...),
    role: str = Query(...),
    branch: Optional[str] = Query(None),
    time_period: str = Query('all', description="Time period: all, month, 3months, 6months, year"),
    start_date: Optional[str] = Query(None, description="Start date for custom range (YYYY-MM-DD)"),
    end_date: Optional[str] = Query(None, description="End date for custom range (YYYY-MM-DD)"),
    db: Session = Depends(get_db)
):
    """
    Get overall performance summary with time filter or custom date range (admin only)
    """
    try:
        # Check if user has admin role
        if not is_admin(role):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only admins can view performance summary"
            )
        
        user_info = {
            'user_id': user_id,
            'name': name,
            'role': role,
            'branch': branch
        }
        
        start_datetime = None
        end_datetime = None
        
        # Validate and convert custom date range to UTC datetime objects
        if start_date and end_date:
            try:
                datetime.strptime(start_date, '%Y-%m-%d')
                datetime.strptime(end_date, '%Y-%m-%d')
                start_datetime = convert_ist_to_utc_datetime(start_date, is_end_date=False)
                end_datetime = convert_ist_to_utc_datetime(end_date, is_end_date=True)
            except ValueError:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Invalid date format. Use YYYY-MM-DD"
                )
        
        summary = await emp_per_controller.EmployeePerformanceController.get_performance_summary(
            db, time_period, start_datetime, end_datetime
        )
        
        return summary
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error in summary endpoint: {str(e)}")
        import traceback
        traceback.print_exc()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )
    
@router.post("/activity-stats")
async def get_activity_statistics(
    request: CampaignFilterRequest,
    time_period: str = Query('all', description="Time period: all, month, 3months, 6months, year"),
    start_date: Optional[str] = Query(None, description="Start date for custom range (YYYY-MM-DD)"),
    end_date: Optional[str] = Query(None, description="End date for custom range (YYYY-MM-DD)"),
    db: Session = Depends(get_db)
):
    """
    Get activity statistics with counts and time filter or custom date range
    Master/IT Admins: See all branches
    Branch Admins: See only their branch
    """
    try:
        # Allow master_admin, it_admin, AND branch_admin
        if not can_view_branch_data(request.user_info.role):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only admins can view activity statistics"
            )
        
        start_datetime = None
        end_datetime = None
        
        # Validate and convert custom date range to UTC datetime objects
        if start_date and end_date:
            try:
                datetime.strptime(start_date, '%Y-%m-%d')
                datetime.strptime(end_date, '%Y-%m-%d')
                start_datetime = convert_ist_to_utc_datetime(start_date, is_end_date=False)
                end_datetime = convert_ist_to_utc_datetime(end_date, is_end_date=True)
            except ValueError:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Invalid date format. Use YYYY-MM-DD"
                )
        
        # Pass branch info to controller for filtering
        result = await emp_per_controller.EmployeePerformanceController.get_activity_stats(
            db, 
            request.campaign_ids, 
            time_period, 
            start_datetime, 
            end_datetime,
            user_role=request.user_info.role,
            user_branch=request.user_info.branch  # Pass branch for filtering
        )
        
        return {
            "activities": result.get('activities', []),
            "campaign_totals": result.get('campaign_totals', {'total_customers': 0, 'total_followups': 0})
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )

@router.post("/rr-stats")
async def get_rr_statistics(
    request: CampaignFilterRequest,
    time_period: str = Query('all', description="Time period: all, month, 3months, 6months, year"),
    start_date: Optional[str] = Query(None, description="Start date for custom range (YYYY-MM-DD)"),
    end_date: Optional[str] = Query(None, description="End date for custom range (YYYY-MM-DD)"),
    db: Session = Depends(get_db)
):
    """
    Get RR (Rejected Reason) statistics with counts and time filter or custom date range
    Master/IT Admins: See all branches
    Branch Admins: See only their branch
    """
    try:
        # Allow master_admin, it_admin, AND branch_admin
        if not can_view_branch_data(request.user_info.role):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only admins can view RR statistics"
            )
        
        start_datetime = None
        end_datetime = None
        
        # Validate and convert custom date range to UTC datetime objects
        if start_date and end_date:
            try:
                datetime.strptime(start_date, '%Y-%m-%d')
                datetime.strptime(end_date, '%Y-%m-%d')
                start_datetime = convert_ist_to_utc_datetime(start_date, is_end_date=False)
                end_datetime = convert_ist_to_utc_datetime(end_date, is_end_date=True)
            except ValueError:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Invalid date format. Use YYYY-MM-DD"
                )
        
        # Pass branch info to controller for filtering
        result = await emp_per_controller.EmployeePerformanceController.get_rr_stats(
            db, 
            request.campaign_ids, 
            time_period, 
            start_datetime, 
            end_datetime,
            user_role=request.user_info.role,
            user_branch=request.user_info.branch  # Pass branch for filtering
        )
        
        # Return both rr_reasons and campaign_totals
        return {
            "rr_reasons": result.get('rr_reasons', []),
            "campaign_totals": result.get('campaign_totals', {'total_customers': 0, 'total_followups': 0})
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )

@router.post("/campaigns-list")
async def get_campaigns_list(
    user_info: UserInfo,
    db: Session = Depends(get_db)
):
    """
    Get all campaigns for filter dropdown
    Master/IT Admins: See all campaigns
    Branch Admins: See campaigns from their branch only
    """
    try:
        # Allow master_admin, it_admin, AND branch_admin
        if not can_view_branch_data(user_info.role):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only admins can view campaigns list"
            )
        
        campaigns = await emp_per_controller.EmployeePerformanceController.get_all_campaigns_list(
            db,
            user_role=user_info.role,
            user_branch=user_info.branch  # Pass branch for filtering
        )
        
        return {"campaigns": campaigns}
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )
    
@router.post("/my-performance/non-followup-count")
async def get_my_non_followup_count(
    user_info: UserInfo,
    db: Session = Depends(get_db)
):
    """
    Get non-followup count for logged-in user
    """
    try:
        user_id = user_info.user_id
        if not user_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="User ID not found"
            )
        
        # Just count where user_id matches
        count = db.query(NonFollowUp).filter(NonFollowUp.user_id == user_id).count()
        
        return {"non_followup_count": count}
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )    
    
@router.post("/campaign-customers/{campaign_id}")
async def get_campaign_customers(
    campaign_id: int,
    user_info: UserInfo,
    db: Session = Depends(get_db)
):
    """
    Get all customers for a specific campaign with their latest follow-up details
    """
    try:
        # Check if user has admin role
        if not is_admin(user_info.role):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only admins can view campaign customers"
            )
        
        result = await emp_per_controller.EmployeePerformanceController.get_campaign_customers(
            db, campaign_id, user_info.dict()
        )
        
        if not result:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Campaign not found or no customers"
            )
                
        return result
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error in campaign-customers endpoint: {str(e)}")
        import traceback
        traceback.print_exc()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )
    
@router.post("/branch-campaign-customers/{branch_code}")
async def get_branch_campaign_customers(
    branch_code: str,
    user_info: UserInfo,
    db: Session = Depends(get_db)
):
    """
    Get all campaigns and their customers for a specific branch
    Focuses on follow-ups table to determine customer engagement
    """
    try:
        # Check if user has admin role
        if not is_admin(user_info.role):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only admins can view branch campaign customers"
            )
        
        # For branch_admin, only allow accessing their own branch
        if user_info.role.lower() == 'branch_admin':
            if branch_code != user_info.branch:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Branch admins can only view their own branch"
                )
        
        result = await emp_per_controller.EmployeePerformanceController.get_branch_campaign_customers(
            db, branch_code, user_info.dict()
        )
        
        if not result:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Branch not found or no data available"
            )
        
        return result
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error in branch-campaign-customers endpoint: {str(e)}")
        import traceback
        traceback.print_exc()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )    
    
@router.post("/branch-total-customers/{branch_code}")
async def get_branch_total_customers(
    branch_code: str,
    user_info: UserInfo,
    db: Session = Depends(get_db)
):
    """
    Get total customers count for a branch across all campaigns
    """
    try:
        # Check if user has admin role
        if not is_admin(user_info.role):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only admins can view branch customer counts"
            )
        
        # For branch_admin, only allow accessing their own branch
        if user_info.role.lower() == 'branch_admin':
            if branch_code != user_info.branch:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Branch admins can only view their own branch"
                )
        
        result = await emp_per_controller.EmployeePerformanceController.get_branch_total_customers_count(
            db, branch_code, user_info.dict()
        )
        
        if not result:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Branch not found or no data available"
            )
        
        return result
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error in branch-total-customers endpoint: {str(e)}")
        import traceback
        traceback.print_exc()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )
    
@router.post("/branch-customer-allocate-summary/{branch_code}")
async def get_branch_customer_allocate_summary(
    branch_code: str,
    user_info: UserInfo,
    db: Session = Depends(get_db)
):
    """
    Get branch customer allocation summary (total allocated vs attended)
    """
    try:
        # Check if user has admin role
        if not is_admin(user_info.role):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only admins can view branch customer allocation summary"
            )
        
        # For branch_admin, only allow accessing their own branch
        if user_info.role.lower() == 'branch_admin':
            if branch_code != user_info.branch:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Branch admins can only view their own branch"
                )
        
        result = await emp_per_controller.EmployeePerformanceController.get_branch_customer_allocate_summary(
            db, branch_code, user_info.dict()
        )
        
        if not result:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Branch not found or no data available"
            )
        
        return result
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error in branch-customer-allocate-summary endpoint: {str(e)}")
        import traceback
        traceback.print_exc()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )
    
@router.post("/my-performance/non-followup-unique-customer-stats")
async def get_non_followup_unique_customer_stats(
    user_info: UserInfo,
    db: Session = Depends(get_db)
):
    """
    Get unique customer count and status breakdown from non_followups table
    for the logged-in user
    """
    try:
        user_id = user_info.user_id
        if not user_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="User ID not found"
            )

        result = await emp_per_controller.EmployeePerformanceController.get_non_followup_unique_customer_stats(
            db, user_id
        )
        return result

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )    

@router.post("/non-campaign-customers")
async def get_non_campaign_customers(
    user_info: UserInfo,
    db: Session = Depends(get_db)
):
    """
    Get all customers from non_followups table with their latest follow-up details
    """
    try:
        if not is_admin(user_info.role):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only admins can view non-campaign customers"
            )
        
        result = await emp_per_controller.EmployeePerformanceController.get_non_campaign_customers(
            db, user_info.dict()
        )
        
        return result
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error in non-campaign-customers endpoint: {str(e)}")
        import traceback
        traceback.print_exc()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )
    
@router.post("/employee-campaign-progress/{employee_id}")
async def get_employee_campaign_progress(
    employee_id: str,
    user_info: UserInfo,
    time_period: str = Query('all', description="Time period: all, month, 3months, 6months, year"),
    start_date: Optional[str] = Query(None, description="Start date (YYYY-MM-DD)"),
    end_date:   Optional[str] = Query(None, description="End date (YYYY-MM-DD)"),
    db: Session = Depends(get_db)
):
    """
    Get per-campaign progress for a specific employee (admin only).
    Returns unique customer latest-status counts per active campaign.
    """
    try:
        if not is_admin(user_info.role):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only admins can view employee campaign progress"
            )

        start_datetime = None
        end_datetime   = None

        if start_date and end_date:
            try:
                datetime.strptime(start_date, '%Y-%m-%d')
                datetime.strptime(end_date,   '%Y-%m-%d')
                start_datetime = convert_ist_to_utc_datetime(start_date, is_end_date=False)
                end_datetime   = convert_ist_to_utc_datetime(end_date,   is_end_date=True)
            except ValueError:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Invalid date format. Use YYYY-MM-DD"
                )

        data = await emp_per_controller.EmployeePerformanceController.get_employee_campaign_progress(
            db, employee_id, time_period, start_datetime, end_datetime
        )

        return {"campaigns": data, "employee_id": employee_id}

    except HTTPException:
        raise
    except Exception as e:
        print(f"Error in employee-campaign-progress endpoint: {str(e)}")
        import traceback
        traceback.print_exc()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )    

@router.post("/my-performance/all-followups")
async def get_my_all_followups(
    user_info: UserInfo,
    time_period: str = Query('all', description="Time period: all, month, 3months, 6months, year"),
    start_date: Optional[str] = Query(None, description="Start date for custom range (YYYY-MM-DD)"),
    end_date: Optional[str] = Query(None, description="End date for custom range (YYYY-MM-DD)"),
    db: Session = Depends(get_db)
):
    """
    Get all follow-ups taken by the logged-in user (with same time filter as performance).
    """
    try:
        user_id = user_info.user_id
        if not user_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="User ID not found"
            )

        start_datetime = None
        end_datetime = None

        if start_date and end_date:
            try:
                datetime.strptime(start_date, '%Y-%m-%d')
                datetime.strptime(end_date, '%Y-%m-%d')
                start_datetime = convert_ist_to_utc_datetime(start_date, is_end_date=False)
                end_datetime = convert_ist_to_utc_datetime(end_date, is_end_date=True)
            except ValueError:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Invalid date format. Use YYYY-MM-DD"
                )

        result = await emp_per_controller.EmployeePerformanceController.get_user_all_followups(
            db, user_id, time_period, start_datetime, end_datetime
        )

        return result

    except HTTPException:
        raise
    except Exception as e:
        print(f"Error in all-followups endpoint: {str(e)}")
        import traceback
        traceback.print_exc()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )
    
@router.post("/check-export-permission")
async def check_export_permission(
    user_info: UserInfo,
    db: Session = Depends(get_db)
):
    """
    Check if logged-in user has export permission
    """
    try:
        from app.models.user_model import User  # adjust import path to match your project

        user_id = user_info.user_id
        if not user_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="User ID not found"
            )

        user = db.query(User).filter(User.user_id == user_id).first()

        if not user:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User not found"
            )

        return {"can_export": bool(user.can_export)}

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )    

@router.get("/asset-lookup")
async def asset_lookup(
    instance_id: str = Query(...),
    db: Session = Depends(get_db)
):
    """Auto-fill GOEM/OEM and Segment from asset_detailed by instance id."""
    try:
        if not instance_id or not instance_id.strip():
            return {"found": False, "goem_oem": "", "segment": ""}
        result = await emp_per_controller.EmployeePerformanceController.get_asset_lookup(
            db, instance_id.strip()
        )
        return result
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )        