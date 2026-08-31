from sqlalchemy.orm import Session
from app.models.user_model import User, UserRole
from app.schemas.user_schema import UserCreate, UserUpdate, UserProfileUpdate, UserRoleUpdate
from passlib.context import CryptContext
from fastapi import HTTPException, status
import json
import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Configure passlib with Argon2
pwd_context = CryptContext(
    schemes=["argon2", "bcrypt"],
    deprecated="auto",
    argon2__time_cost=2,
    argon2__memory_cost=102400,
    argon2__parallelism=8,
    argon2__hash_len=32
)

# Initial admin credentials from environment variables
INITIAL_ADMIN_ID = os.getenv("INITIAL_ADMIN_ID", "kala000001")
INITIAL_ADMIN_NAME = os.getenv("INITIAL_ADMIN_NAME", "Initial Admin")
INITIAL_ADMIN_BRANCH = os.getenv("INITIAL_ADMIN_BRANCH", "HO")
INITIAL_ADMIN_BRANCH_NAME = os.getenv("INITIAL_ADMIN_BRANCH_NAME", "Head Office")
INITIAL_ADMIN_PASSWORD = os.getenv("INITIAL_ADMIN_PASSWORD")

# Who may grant PMS and AOP & Master rights — and who always holds them all.
# Every other Master Admin manages employees as before but cannot hand out PMS
# Access, the PMS pages, the Annual Reports sheets or AOP & Master rights.
# Mirrors the client's VITE_PMS_AOP_ADMIN_IDS; the initial admin is always
# included.
AOP_RIGHTS_ADMIN_IDS = {
    u.strip() for u in os.getenv("AOP_RIGHTS_ADMIN_IDS", INITIAL_ADMIN_ID).split(",") if u.strip()
} | {INITIAL_ADMIN_ID}

# The REPORT pages inside PMS, in menu order. Which of these a user gets is
# stored in users.pms_pages as a JSON list of these keys; keep this list in step
# with PMS_PAGES in client/src/utils/pagePermission.js and with the page= each
# endpoint passes to _require_pms_page in app/routes/pms_routes.py.
# AOP & Master is deliberately NOT here — it has its own aop_access / aop_tabs.
PMS_PAGE_KEYS = (
    "sales_labour",           # Sales & Labour Report (and its file uploads)
    "employee_productivity",  # Employee Productivity
    "sr_allocation",          # SR Allocation Report
    "se_performance",         # SE Performance (Annexure I commitment matrix)
    "training",               # Training Report
    "annual",                 # Annual Reports
)


def pms_pages_list(user: User):
    """users.pms_pages as a clean list of page keys, or None.

    None means NO per-page restriction was ever set (the column is NULL, or its
    contents are unreadable) — then PMS Access opens every report page, exactly
    as it did before per-page rights existed. An empty list is the opposite: no
    report page was ticked, so the user only has whatever AOP rights they hold."""
    raw = getattr(user, "pms_pages", None)
    if raw is None or raw == "":
        return None
    try:
        data = json.loads(raw) if isinstance(raw, str) else raw
    except (ValueError, TypeError):
        return None
    if not isinstance(data, list):
        return None
    return [k for k in PMS_PAGE_KEYS if k in data]     # menu order, deduped


def can_open_pms_page(user: User, page: str = None) -> bool:
    """May this user open one PMS report page? page=None asks about any page.

    The Master Admin and the PMS Access flag open the module; the per-page list
    then narrows it. AOP & Master is not routed through here."""
    if user.user_id in AOP_RIGHTS_ADMIN_IDS:
        return True                       # the rights admins always hold every page
    role = user.role.value if hasattr(user.role, "value") else str(user.role)
    if not (role == UserRole.MASTER_ADMIN.value or bool(user.can_access_pms)):
        return False
    pages = pms_pages_list(user)
    if pages is None:
        return True                       # no per-page list = every page
    if page is None:
        return len(pages) > 0
    return page in pages


# The report SHEETS of the Annual Reports page, in the order its picker lists
# them. Which of these a user gets is stored in users.annual_tabs as a JSON list
# of these keys; keep this list in step with ANNUAL_TABS in
# client/src/utils/pagePermission.js and with the tab= each endpoint passes to
# _require_annual_tab in app/routes/pms_routes.py. These sheets only read, so
# the right is show / don't show — there is no 'edit' level (what they print is
# typed in AOP & Master, which carries its own view/edit rights).
ANNUAL_TAB_KEYS = (
    "service_penetration",    # Service Penetration
    "amc_bandhan",            # AMC & Bandhan Projection (both of its own tabs)
    "cdi",                    # Customer Delight Index (CDI)
    "service_load",           # Service Load and Response
)


def annual_tabs_list(user: User):
    """users.annual_tabs as a clean list of tab keys, or None.

    None means NO per-sheet restriction was ever set (the column is NULL, or its
    contents are unreadable) — then the Annual Reports page shows every sheet,
    exactly as it did before per-sheet rights existed. An empty list is the
    opposite: no sheet was ticked, so the page has nothing to show."""
    raw = getattr(user, "annual_tabs", None)
    if raw is None or raw == "":
        return None
    try:
        data = json.loads(raw) if isinstance(raw, str) else raw
    except (ValueError, TypeError):
        return None
    if not isinstance(data, list):
        return None
    return [k for k in ANNUAL_TAB_KEYS if k in data]    # page order, deduped


def can_open_annual_tab(user: User, tab: str = None) -> bool:
    """May this user open one sheet of the Annual Reports page? tab=None asks
    about the page as a whole (any sheet at all).

    The 'annual' PMS page opens the page; the per-sheet list then narrows it."""
    if not can_open_pms_page(user, "annual"):
        return False
    if user.user_id in AOP_RIGHTS_ADMIN_IDS:
        return True                       # the rights admins always hold every sheet
    tabs = annual_tabs_list(user)
    if tabs is None:
        return True                       # no per-sheet list = every sheet
    if tab is None:
        return len(tabs) > 0
    return tab in tabs


# The tabs of the AOP & Master page, in the order they appear there. Rights are
# stored per tab in users.aop_tabs as {tab_key: 'view'|'edit'}; keep this list in
# step with AOP_TABS in client/src/utils/pagePermission.js and with the tab= each
# endpoint passes to _require_aop in app/routes/pms_routes.py.
AOP_TAB_KEYS = (
    "targets",      # Target Master
    "srtypes",      # SR Type Master (Sales and Labour)
    "mxtypes",      # SR Type Master (MaxTTR)
    "eftypes",      # SR Type Master (EFSR)
    "leadcats",     # Lead Category Master
    "cditargets",   # CDI Target Master
    "amctargets",   # AMC & Bandhan AOP
    "sltypes",      # SR Type Master (Service Load)
    "sltargets",    # Service Load AOP
)

_AOP_RANK = {"none": 0, "view": 1, "edit": 2}


def aop_tabs_map(user: User):
    """users.aop_tabs as a clean {tab_key: 'view'|'edit'} dict, or None.

    None means NO per-tab restriction was ever set (the column is NULL, or its
    contents are unreadable) — then every tab runs at the user's overall
    aop_access level, exactly as it did before per-tab rights existed. An empty
    dict is the opposite: the admin ticked no tab at all, so none is visible."""
    raw = getattr(user, "aop_tabs", None)
    if raw is None or raw == "":
        return None
    try:
        data = json.loads(raw) if isinstance(raw, str) else raw
    except (ValueError, TypeError):
        return None
    if not isinstance(data, dict):
        return None
    return {
        k: str(v).lower() for k, v in data.items()
        if k in AOP_TAB_KEYS and str(v).lower() in ("view", "edit")
    }


def aop_level_for_tab(user: User, tab: str = None) -> str:
    """Effective 'none' | 'view' | 'edit' for one tab of the AOP & Master page.

    tab=None asks about the page as a whole: the best level held on any tab."""
    if user.user_id in AOP_RIGHTS_ADMIN_IDS:
        return "edit"                      # rights admins always hold everything
    base = (user.aop_access or "none").lower()
    if base not in ("view", "edit"):
        return "none"
    tabs = aop_tabs_map(user)
    if tabs is None:
        return base                        # no per-tab map = whole page at base
    if not tabs:
        return "none"                      # map set, but no tab ticked
    if tab is None:
        best = max(tabs.values(), key=lambda v: _AOP_RANK[v])
        return best if _AOP_RANK[best] <= _AOP_RANK[base] else base
    level = tabs.get(tab, "none")
    # A tab can never outrank the overall right.
    return level if _AOP_RANK[level] <= _AOP_RANK[base] else base


class UserController:
    _admin_initialized = False
    
    @staticmethod
    def hash_password(password: str) -> str:
        """Store password as plain text (no hashing)."""
        return password

    @staticmethod
    def verify_password(plain_password: str, stored_password: str) -> bool:
        """Compare password as plain text. Falls back to legacy
        Argon2/bcrypt verification for users created before this change."""
        if plain_password == stored_password:
            return True
        try:
            return pwd_context.verify(plain_password, stored_password)
        except Exception:
            return False
    
    @staticmethod
    def initialize_admin_user(db: Session):
        """Create initial master admin user if no users exist in the database"""
        # Skip if already initialized in this session
        if UserController._admin_initialized:
            return
        
        user_count = db.query(User).count()
        
        if user_count == 0:
            if not INITIAL_ADMIN_PASSWORD:
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail="INITIAL_ADMIN_PASSWORD environment variable is not set"
                )
            
            existing_admin = db.query(User).filter(User.user_id == INITIAL_ADMIN_ID).first()
            if existing_admin:
                print(f"Master admin user {INITIAL_ADMIN_ID} already exists")
                UserController._admin_initialized = True
                return
            
            hashed_password = UserController.hash_password(INITIAL_ADMIN_PASSWORD)
            initial_admin = User(
                user_id=INITIAL_ADMIN_ID,
                name=INITIAL_ADMIN_NAME,
                branch=INITIAL_ADMIN_BRANCH,
                branch_name=INITIAL_ADMIN_BRANCH_NAME,
                password=hashed_password,
                role=UserRole.MASTER_ADMIN,
                is_blocked=False,
                can_export=True
            )
            
            db.add(initial_admin)
            db.commit()
            db.refresh(initial_admin)
        
        UserController._admin_initialized = True  # Mark as initialized
    
    @staticmethod
    def can_admin_manage_role(admin_role: UserRole, target_role: UserRole) -> bool:
        """Check if admin can manage a specific role"""
        role_hierarchy = {
            UserRole.MASTER_ADMIN: [UserRole.MASTER_ADMIN, UserRole.BRANCH_ADMIN, UserRole.EMPLOYEE],
            UserRole.BRANCH_ADMIN: [UserRole.BRANCH_ADMIN, UserRole.EMPLOYEE],
            UserRole.EMPLOYEE: []
        }
        return target_role in role_hierarchy.get(admin_role, [])
    
    @staticmethod
    def can_admin_see_user(admin_user: User, target_user: User) -> bool:
        """Check if admin can see a specific user"""
        if admin_user.role == UserRole.MASTER_ADMIN:
            return True
        elif admin_user.role == UserRole.BRANCH_ADMIN:
            # A branch admin may hold access to several branches (primary +
            # user_branch_access rows) — they see users of ALL those branches.
            access = {admin_user.branch}
            try:
                access |= {ba.branch for ba in (admin_user.branch_accesses or [])}
            except Exception:
                pass
            return target_user.branch in access
        return False
    
    @staticmethod
    def create_user(db: Session, user: UserCreate, creator_user_id: str):
        """Create a new user with role-based restrictions"""
        UserController.initialize_admin_user(db)
        
        # Get creator
        creator = db.query(User).filter(User.user_id == creator_user_id).first()
        if not creator:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Invalid creator"
            )
        
        # Check if creator can create users (Master Admin or IT Admin)
        if creator.role not in [UserRole.MASTER_ADMIN]:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only Master Admins and IT Admins can create employees"
            )
        
        # Check if user_id already exists
        db_user = db.query(User).filter(User.user_id == user.user_id).first()
        if db_user:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="User ID already exists"
            )
        
        # Prevent creating another user with master admin ID
        if user.user_id == INITIAL_ADMIN_ID:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="This user ID is reserved for the master admin"
            )
        
        # Check if creator can assign the requested role
        if not UserController.can_admin_manage_role(creator.role, user.role):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Cannot create user with role {user.role.value}"
            )
        
        # Branch admin can only create users in their branch
        if creator.role == UserRole.BRANCH_ADMIN and user.branch != creator.branch:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Branch admins can only create users in their branch"
            )
        
        # Create new user
        hashed_password = UserController.hash_password(user.password)
        db_user = User(
            user_id=user.user_id,
            name=user.name,
            branch=user.branch,
            branch_name=user.branch_name,
            mobile_number=user.mobile_number,
            email=getattr(user, 'email', None),
            password=hashed_password,
            role=user.role,
            is_blocked=user.is_blocked,
            can_export=user.can_export,
            can_access_expense=getattr(user, 'can_access_expense', False)
        )
        
        db.add(db_user)
        db.commit()
        db.refresh(db_user)
        from app.models.user_model import UserBranchAccess
        db.add(UserBranchAccess(
            user_id=db_user.user_id,
            branch=db_user.branch,
            branch_name=db_user.branch_name,
            is_primary=True
        ))
        db.commit()
        return db_user
        return db_user
    
    @staticmethod
    def create_bulk_users(db: Session, users_data, admin_user_id: str):
        """Create multiple users at once"""
        admin = db.query(User).filter(User.user_id == admin_user_id).first()
        if not admin or admin.role not in [UserRole.MASTER_ADMIN, UserRole.BRANCH_ADMIN]:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only admins can create employees"
            )
        
        created_users = []
        errors = []
        
        for user_data in users_data:
            try:
                existing = db.query(User).filter(User.user_id == user_data.user_id).first()
                if existing:
                    errors.append(f"User ID {user_data.user_id} already exists")
                    continue
                
                if user_data.user_id == INITIAL_ADMIN_ID:
                    errors.append(f"Cannot create master admin user")
                    continue
                
                # Check role assignment permission
                if not UserController.can_admin_manage_role(admin.role, user_data.role):
                    errors.append(f"Cannot create user {user_data.user_id} with role {user_data.role.value}")
                    continue
                
                # Branch admin branch check
                if admin.role == UserRole.BRANCH_ADMIN and user_data.branch != admin.branch:
                    errors.append(f"Branch admin cannot create user in different branch")
                    continue
                
                hashed_password = UserController.hash_password(user_data.password)
                new_user = User(
                    user_id=user_data.user_id,
                    name=user_data.name,
                    branch=user_data.branch,
                    branch_name=user_data.branch_name,
                    password=hashed_password,
                    role=user_data.role,
                    is_blocked=False,
                    can_export=user_data.can_export
                )
                
                db.add(new_user)
                db.flush()
                created_users.append(new_user)
                
            except Exception as e:
                errors.append(f"Error creating user {user_data.user_id}: {str(e)}")
        
        if created_users:
            db.commit()
            for user in created_users:
                db.refresh(user)
        
        return created_users, errors
    
    @staticmethod
    def authenticate_user(db: Session, user_id: str, password: str):
        if not UserController._admin_initialized:
            UserController.initialize_admin_user(db)
    
        user = db.query(User).filter(User.user_id == user_id).first()
        if not user or user.is_blocked or getattr(user, "is_deleted", False):
            return None
    
        if not UserController.verify_password(password, user.password):
            return None
    
        # Ensure at least one branch_access row exists (handles legacy users)
        from app.models.user_model import UserBranchAccess
        accesses = db.query(UserBranchAccess).filter(UserBranchAccess.user_id == user.user_id).all()
        if not accesses:
            primary = UserBranchAccess(
                user_id=user.user_id, branch=user.branch,
                branch_name=user.branch_name, is_primary=True
            )
            db.add(primary)
            db.commit()
            accesses = [primary]
    
        user._branch_accesses = accesses  # attach for the route to read
        return user
    
    @staticmethod
    def get_user_by_id(db: Session, user_id: str):
        UserController.initialize_admin_user(db)
        return db.query(User).filter(User.user_id == user_id).first()
    
    @staticmethod
    def get_user_by_db_id(db: Session, id: int):
        UserController.initialize_admin_user(db)
        return db.query(User).filter(User.id == id).first()
    
    @staticmethod
    def get_all_employees(db: Session, admin_user_id: str):
        UserController.initialize_admin_user(db)
        
        admin = db.query(User).filter(User.user_id == admin_user_id).first()
        if not admin or admin.role not in [UserRole.MASTER_ADMIN, UserRole.BRANCH_ADMIN]:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only admins can view employees"
            )
        
        # Get all users (soft-deleted employees stay hidden everywhere)
        all_users = db.query(User).filter(User.is_deleted == False).all()  # noqa: E712

        # Filter based on admin role
        filtered_users = []
        for user in all_users:
            if user.user_id == admin_user_id:
                continue  # Skip the admin themselves
            if UserController.can_admin_see_user(admin, user):
                filtered_users.append(user)

        return filtered_users
    
    @staticmethod
    def update_employee(db: Session, employee_id: int, admin_user_id: str, user_update: UserUpdate):
        UserController.initialize_admin_user(db)
        
        admin = db.query(User).filter(User.user_id == admin_user_id).first()
        if not admin or admin.role not in [UserRole.MASTER_ADMIN, UserRole.BRANCH_ADMIN]:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only admins can update employees"
            )
        
        employee = db.query(User).filter(User.id == employee_id).first()
        if not employee:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Employee not found"
            )
        
        # Check if admin can see this employee
        if not UserController.can_admin_see_user(admin, employee):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Cannot access this employee"
            )
        
        # Master admin protection
        if employee.user_id == INITIAL_ADMIN_ID:
            if admin_user_id != INITIAL_ADMIN_ID:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Cannot modify the master admin user"
                )
            
            if user_update.is_blocked is not None and user_update.is_blocked:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Master admin cannot be blocked"
                )
            
            if user_update.can_export is not None and not user_update.can_export:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Master admin must have export permission"
                )
            
            if user_update.role is not None and user_update.role != UserRole.MASTER_ADMIN:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Master admin role cannot be changed"
                )
        
        # Check role change permission
        if user_update.role and user_update.role != employee.role:
            if not UserController.can_admin_manage_role(admin.role, user_update.role):
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail=f"Cannot assign role {user_update.role.value}"
                )
        
        # Update fields
        if user_update.name:
            employee.name = user_update.name
        if user_update.branch:
            employee.branch = user_update.branch
        if user_update.branch_name is not None:
            employee.branch_name = user_update.branch_name
        if user_update.mobile_number is not None:
            employee.mobile_number = user_update.mobile_number or None
        if user_update.email is not None:
            employee.email = (user_update.email or '').strip() or None
        if user_update.password:
            employee.password = UserController.hash_password(user_update.password)
        if user_update.role and employee.user_id != INITIAL_ADMIN_ID:
            employee.role = user_update.role
        if user_update.is_blocked is not None and employee.user_id != INITIAL_ADMIN_ID:
            employee.is_blocked = user_update.is_blocked
        if user_update.can_export is not None and employee.user_id != INITIAL_ADMIN_ID:
            employee.can_export = user_update.can_export
        if user_update.can_access_expense is not None and employee.user_id != INITIAL_ADMIN_ID:
            employee.can_access_expense = user_update.can_access_expense
        
        db.commit()
        db.refresh(employee)
        return employee
    
    @staticmethod
    def update_profile(db: Session, user_id: str, profile_update: UserProfileUpdate):
        UserController.initialize_admin_user(db)
        
        user = db.query(User).filter(User.user_id == user_id).first()
        if not user:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User not found"
            )
        
        if profile_update.name:
            user.name = profile_update.name
        if profile_update.branch:
            user.branch = profile_update.branch
        if profile_update.branch_name is not None:
            user.branch_name = profile_update.branch_name
        if profile_update.password:
            user.password = UserController.hash_password(profile_update.password)
        
        db.commit()
        db.refresh(user)
        return user
    
    @staticmethod
    def delete_employee(db: Session, employee_id: int, admin_user_id: str):
        UserController.initialize_admin_user(db)
        
        admin = db.query(User).filter(User.user_id == admin_user_id).first()
        if not admin or admin.role not in [UserRole.MASTER_ADMIN]:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only Master Admin and IT Admin can delete employees"
            )
        
        employee = db.query(User).filter(User.id == employee_id).first()
        if not employee:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Employee not found"
            )
        
        if employee.user_id == INITIAL_ADMIN_ID:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Cannot delete the master admin user"
            )

        # SOFT delete: keep the row so every module's history (MOM meetings,
        # followups, expenses, approval trails) keeps its person. The user is
        # hidden from all lists and can never log in again.
        employee.is_deleted = True
        employee.is_blocked = True
        db.commit()

        # Approval Application clean-up: drop their approver configuration and
        # forward any records that were waiting on them to the next authority.
        try:
            from app.controllers import approval_controller as _apv
            _apv.cleanup_user_config(db, employee.user_id)
            _apv.reroute_pending(db)
        except Exception as e:
            print(f"[approval] cleanup after delete skipped: {e}")

        return employee
    
    @staticmethod
    def toggle_block_employee(db: Session, employee_id: int, admin_user_id: str, block_status: bool):
        """Toggle employee block status"""
        admin = db.query(User).filter(User.user_id == admin_user_id).first()
        if not admin or admin.role not in [UserRole.MASTER_ADMIN, UserRole.BRANCH_ADMIN]:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only admins can block/unblock employees"
            )
        
        employee = db.query(User).filter(User.id == employee_id).first()
        if not employee:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Employee not found"
            )
        
        if not UserController.can_admin_see_user(admin, employee):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Cannot access this employee"
            )
        
        if employee.user_id == INITIAL_ADMIN_ID:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Cannot block the master admin user"
            )
        
        employee.is_blocked = block_status
        db.commit()
        db.refresh(employee)

        # Approval Application: a blocked approver is unusable — forward any
        # records waiting on them to the next authority (block is reversible,
        # so their matrix configuration itself is kept).
        if block_status:
            try:
                from app.controllers import approval_controller as _apv
                _apv.reroute_pending(db)
            except Exception as e:
                print(f"[approval] reroute after block skipped: {e}")

        return employee
    
    @staticmethod
    def toggle_export_permission(db: Session, employee_id: int, admin_user_id: str, export_status: bool):
        """Toggle employee export permission"""
        admin = db.query(User).filter(User.user_id == admin_user_id).first()
        if not admin or admin.role not in [UserRole.MASTER_ADMIN]:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only Master Admin and IT Admin can toggle export permission"
            )
        
        employee = db.query(User).filter(User.id == employee_id).first()
        if not employee:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Employee not found"
            )
        
        if not UserController.can_admin_see_user(admin, employee):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Cannot access this employee"
            )
        
        if employee.user_id == INITIAL_ADMIN_ID:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Master admin always has export permission"
            )
        
        employee.can_export = export_status
        db.commit()
        db.refresh(employee)
        return employee

    @staticmethod
    def toggle_page_access(db: Session, employee_id: int, admin_user_id: str, page: str, allowed: bool):
        """Grant/revoke access to the Part Detail Info or MOM Tracking pages.
        Master Admin only; the initial admin can never be locked out."""
        admin = db.query(User).filter(User.user_id == admin_user_id).first()
        if not admin or admin.role not in [UserRole.MASTER_ADMIN]:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only Master Admin can change page access"
            )

        if page not in ("part_detail", "mom", "approval", "pms"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Unknown page — expected 'part_detail', 'mom', 'approval' or 'pms'"
            )

        # PMS — and everything inside it — is handed out only by the PMS & AOP
        # rights admins (AOP_RIGHTS_ADMIN_IDS), not by every Master Admin.
        if page == "pms" and admin.user_id not in AOP_RIGHTS_ADMIN_IDS:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You are not allowed to grant PMS rights"
            )

        employee = db.query(User).filter(User.id == employee_id).first()
        if not employee:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Employee not found"
            )

        if employee.user_id == INITIAL_ADMIN_ID and not allowed:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="The initial master admin always keeps page access"
            )

        if page == "part_detail":
            employee.can_access_part_detail = allowed
        elif page == "approval":
            employee.can_access_approval = allowed
        elif page == "quotation_tracker":
            employee.can_access_quotation_tracker = allowed
        elif page == "pms":
            employee.can_access_pms = allowed
            # Hiding PMS hides everything inside it — drop AOP rights too, so a
            # re-granted user does not silently get the old AOP level back.
            if not allowed:
                employee.aop_access = "none"
                employee.aop_tabs = None
                employee.pms_pages = None
                employee.annual_tabs = None
        else:
            employee.can_access_mom = allowed
        db.commit()
        db.refresh(employee)
        return employee

    @staticmethod
    def set_pms_pages(db: Session, employee_id: int, admin_user_id: str, pages):
        """Choose WHICH PMS report pages a user gets: a list of PMS_PAGE_KEYS.

        pages=None clears the restriction, so PMS Access opens every report page
        again (how it worked before per-page rights). An empty list hides them
        all. AOP & Master is never part of this — it keeps its own rights.
        Only the PMS & AOP rights admins may call it, same as the PMS Access
        flag itself."""
        admin = db.query(User).filter(User.user_id == admin_user_id).first()
        if not admin or admin.user_id not in AOP_RIGHTS_ADMIN_IDS:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You are not allowed to grant PMS rights"
            )

        if pages is not None and not isinstance(pages, list):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="pages must be a list of PMS page keys"
            )

        for key in (pages or []):
            if key not in PMS_PAGE_KEYS:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Unknown PMS page '{key}'"
                )
        cleaned = [k for k in PMS_PAGE_KEYS if k in (pages or [])]   # menu order

        employee = db.query(User).filter(User.id == employee_id).first()
        if not employee:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Employee not found"
            )

        if not employee.can_access_pms:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Grant PMS Access first, then choose the pages"
            )

        # json.dumps([]) — "[]" — is stored deliberately: it means "no report
        # page", which is not the same as NULL ("no per-page restriction").
        employee.pms_pages = None if pages is None else json.dumps(cleaned)
        # Nothing to scope per sheet once the Annual Reports page is hidden.
        if pages is not None and "annual" not in cleaned:
            employee.annual_tabs = None
        db.commit()
        db.refresh(employee)
        return employee

    @staticmethod
    def set_annual_tabs(db: Session, employee_id: int, admin_user_id: str, tabs):
        """Choose WHICH sheets of the Annual Reports page a user gets: a list of
        ANNUAL_TAB_KEYS.

        tabs=None clears the restriction, so the page shows every sheet again
        (how it worked before per-sheet rights). An empty list hides them all —
        the page itself is then dropped from the menu. The sheets only read, so
        there is no view/edit level here. Same gate as the PMS pages above."""
        admin = db.query(User).filter(User.user_id == admin_user_id).first()
        if not admin or admin.user_id not in AOP_RIGHTS_ADMIN_IDS:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You are not allowed to grant PMS rights"
            )

        if tabs is not None and not isinstance(tabs, list):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="tabs must be a list of Annual Reports sheet keys"
            )

        for key in (tabs or []):
            if key not in ANNUAL_TAB_KEYS:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Unknown Annual Reports sheet '{key}'"
                )
        cleaned = [k for k in ANNUAL_TAB_KEYS if k in (tabs or [])]   # page order

        employee = db.query(User).filter(User.id == employee_id).first()
        if not employee:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Employee not found"
            )

        if not can_open_pms_page(employee, "annual"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Grant the Annual Reports page first, then choose the sheets"
            )

        # json.dumps([]) — "[]" — is stored deliberately: it means "no sheet at
        # all", which is not the same as NULL ("no per-sheet restriction").
        employee.annual_tabs = None if tabs is None else json.dumps(cleaned)
        db.commit()
        db.refresh(employee)
        return employee

    @staticmethod
    def set_aop_access(db: Session, employee_id: int, admin_user_id: str, level: str):
        """Set a user's AOP & Master rights: 'none' | 'view' | 'edit'.

        Only the AOP rights admins (AOP_RIGHTS_ADMIN_IDS in the server .env —
        the same ids the client lists in VITE_PMS_AOP_ADMIN_IDS) may grant this;
        they always hold 'edit' themselves and can never be demoted."""
        if level not in ("none", "view", "edit"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Unknown level — expected 'none', 'view' or 'edit'"
            )

        admin = db.query(User).filter(User.user_id == admin_user_id).first()
        if not admin or admin.user_id not in AOP_RIGHTS_ADMIN_IDS:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You are not allowed to grant AOP & Master rights"
            )

        employee = db.query(User).filter(User.id == employee_id).first()
        if not employee:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Employee not found"
            )

        if employee.user_id in AOP_RIGHTS_ADMIN_IDS and level != "edit":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="This user always keeps full AOP & Master rights"
            )

        employee.aop_access = level
        # AOP & Master lives inside PMS — granting it opens the module too.
        if level != "none":
            employee.can_access_pms = True
        else:
            employee.aop_tabs = None       # nothing to scope once the page is hidden
        db.commit()
        db.refresh(employee)
        return employee

    @staticmethod
    def set_aop_tabs(db: Session, employee_id: int, admin_user_id: str, tabs):
        """Set WHICH tabs of the AOP & Master page a user gets, and at which
        level: {tab_key: 'none'|'view'|'edit'}. Tabs left out (or sent as
        'none') are hidden for that user. Send tabs=None to clear the
        restriction, so the whole page runs at their overall aop_access level
        again (how it worked before per-tab rights).

        Same gate as set_aop_access — only the AOP rights admins may call it."""
        admin = db.query(User).filter(User.user_id == admin_user_id).first()
        if not admin or admin.user_id not in AOP_RIGHTS_ADMIN_IDS:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You are not allowed to grant AOP & Master rights"
            )

        if tabs is not None and not isinstance(tabs, dict):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="tabs must be an object of { tab: 'none'|'view'|'edit' }"
            )

        cleaned = {}
        for key, value in (tabs or {}).items():
            if key not in AOP_TAB_KEYS:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Unknown AOP tab '{key}'"
                )
            level = str(value or "none").strip().lower()
            if level not in ("none", "view", "edit"):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Unknown level '{value}' for tab '{key}'"
                )
            if level != "none":
                cleaned[key] = level

        employee = db.query(User).filter(User.id == employee_id).first()
        if not employee:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Employee not found"
            )

        if employee.user_id in AOP_RIGHTS_ADMIN_IDS:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="This user always keeps full AOP & Master rights"
            )

        if (employee.aop_access or "none") == "none":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Grant AOP & Master rights first, then choose the tabs"
            )

        # json.dumps({}) — "{}" — is stored deliberately: it means "no tab at
        # all", which is not the same as NULL ("no per-tab restriction").
        employee.aop_tabs = None if tabs is None else json.dumps(cleaned)
        db.commit()
        db.refresh(employee)
        return employee

    @staticmethod
    def create_or_update_bulk_users(db: Session, users_data, admin_user_id: str):
        """Create new users or update existing ones based on user_id"""
        admin = db.query(User).filter(User.user_id == admin_user_id).first()
        if not admin or admin.role not in [UserRole.MASTER_ADMIN, UserRole.BRANCH_ADMIN]:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only admins can create/update employees"
            )
        
        created_users = []
        updated_users = []
        errors = []
        
        for user_data in users_data:
            try:
                # Check if user already exists
                existing_user = db.query(User).filter(User.user_id == user_data.user_id).first()
                
                if existing_user:
                    # Check if admin can modify this user
                    if not UserController.can_admin_see_user(admin, existing_user):
                        errors.append(f"Cannot update user {user_data.user_id}: No permission")
                        continue
                    
                    # Check role assignment permission for update
                    if not UserController.can_admin_manage_role(admin.role, user_data.role):
                        errors.append(f"Cannot update user {user_data.user_id} with role {user_data.role.value}")
                        continue
                    
                    # Check master admin protection
                    if existing_user.user_id == INITIAL_ADMIN_ID:
                        errors.append(f"Cannot modify master admin user {user_data.user_id}")
                        continue
                    
                    # Branch admin branch check
                    if admin.role == UserRole.BRANCH_ADMIN and user_data.branch != admin.branch:
                        errors.append(f"Branch admin cannot update user in different branch")
                        continue
                    
                    # Update existing user
                    existing_user.name = user_data.name
                    existing_user.branch = user_data.branch
                    existing_user.branch_name = user_data.branch_name
                    # Only update password if provided
                    if user_data.password and user_data.password.strip():
                        existing_user.password = UserController.hash_password(user_data.password)
                    existing_user.role = user_data.role
                    existing_user.can_export = user_data.can_export
                    # Don't change is_blocked status during import
                    
                    db.flush()
                    updated_users.append(existing_user)
                    
                else:
                    # Create new user
                    if user_data.user_id == INITIAL_ADMIN_ID:
                        errors.append(f"Cannot create master admin user")
                        continue
                    
                    # Check role assignment permission
                    if not UserController.can_admin_manage_role(admin.role, user_data.role):
                        errors.append(f"Cannot create user {user_data.user_id} with role {user_data.role.value}")
                        continue
                    
                    # Branch admin branch check
                    if admin.role == UserRole.BRANCH_ADMIN and user_data.branch != admin.branch:
                        errors.append(f"Branch admin cannot create user in different branch")
                        continue
                    
                    hashed_password = UserController.hash_password(user_data.password)
                    new_user = User(
                        user_id=user_data.user_id,
                        name=user_data.name,
                        branch=user_data.branch,
                        branch_name=user_data.branch_name,
                        password=hashed_password,
                        role=user_data.role,
                        is_blocked=False,
                        can_export=user_data.can_export
                    )
                    
                    db.add(new_user)
                    db.flush()
                    created_users.append(new_user)
                    
            except Exception as e:
                errors.append(f"Error processing user {user_data.user_id}: {str(e)}")
        
        if created_users or updated_users:
            db.commit()
            for user in created_users:
                db.refresh(user)
            for user in updated_users:
                db.refresh(user)
        
        return created_users, updated_users, errors    

    @staticmethod
    def get_user_branches(db: Session, user_id: str):
        from app.models.user_model import UserBranchAccess
        return db.query(UserBranchAccess).filter(
            UserBranchAccess.user_id == user_id
        ).order_by(UserBranchAccess.is_primary.desc(), UserBranchAccess.branch).all()
    
    @staticmethod
    def add_branch_access(db: Session, employee_user_id: str, branch: str,
                          branch_name: str, admin_user_id: str):
        from app.models.user_model import UserBranchAccess
        admin = db.query(User).filter(User.user_id == admin_user_id).first()
        if not admin or admin.role not in [UserRole.MASTER_ADMIN]:
            raise HTTPException(403, "Only Master/IT Admin can manage branch access")
    
        employee = db.query(User).filter(User.user_id == employee_user_id).first()
        if not employee:
            raise HTTPException(404, "Employee not found")
    
        existing = db.query(UserBranchAccess).filter_by(
            user_id=employee_user_id, branch=branch
        ).first()
        if existing:
            raise HTTPException(400, "Branch access already exists")
    
        access = UserBranchAccess(
            user_id=employee_user_id, branch=branch,
            branch_name=branch_name, is_primary=False
        )
        db.add(access)
        db.commit()
        db.refresh(access)
        return access
    
    @staticmethod
    def remove_branch_access(db: Session, access_id: int, admin_user_id: str):
        from app.models.user_model import UserBranchAccess
        admin = db.query(User).filter(User.user_id == admin_user_id).first()
        if not admin or admin.role not in [UserRole.MASTER_ADMIN]:
            raise HTTPException(403, "Only Master/IT Admin can manage branch access")
    
        access = db.query(UserBranchAccess).filter_by(id=access_id).first()
        if not access:
            raise HTTPException(404, "Branch access not found")
        if access.is_primary:
            raise HTTPException(400, "Cannot remove primary branch. Change primary first.")
    
        db.delete(access)
        db.commit()
        return True
    
    @staticmethod
    def set_primary_branch(db: Session, employee_user_id: str, branch: str, admin_user_id: str):
        from app.models.user_model import UserBranchAccess
        admin = db.query(User).filter(User.user_id == admin_user_id).first()
        if not admin or admin.role not in [UserRole.MASTER_ADMIN]:
            raise HTTPException(403, "Only Master/IT Admin can change primary branch")
    
        target = db.query(UserBranchAccess).filter_by(
            user_id=employee_user_id, branch=branch
        ).first()
        if not target:
            raise HTTPException(404, "User does not have access to this branch")
    
        # Flip all to non-primary, then set target
        db.query(UserBranchAccess).filter_by(user_id=employee_user_id).update(
            {"is_primary": False}
        )
        target.is_primary = True
    
        # Also update the User row to reflect new primary
        employee = db.query(User).filter(User.user_id == employee_user_id).first()
        employee.branch = target.branch
        employee.branch_name = target.branch_name
    
        db.commit()
        db.refresh(target)
        return target        