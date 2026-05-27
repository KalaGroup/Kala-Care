from sqlalchemy.orm import Session
from app.models.user_model import User, UserRole
from app.schemas.user_schema import UserCreate, UserUpdate, UserProfileUpdate, UserRoleUpdate
from passlib.context import CryptContext
from fastapi import HTTPException, status
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

class UserController:
    _admin_initialized = False
    
    @staticmethod
    def hash_password(password: str) -> str:
        """Hash password with Argon2"""
        return pwd_context.hash(password)
    
    @staticmethod
    def verify_password(plain_password: str, hashed_password: str) -> bool:
        """Verify password against hash"""
        try:
            return pwd_context.verify(plain_password, hashed_password)
        except Exception as e:
            print(f"Password verification error: {e}")
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
            UserRole.MASTER_ADMIN: [UserRole.MASTER_ADMIN, UserRole.IT_ADMIN, UserRole.BRANCH_ADMIN, UserRole.EMPLOYEE],
            UserRole.IT_ADMIN: [UserRole.IT_ADMIN, UserRole.BRANCH_ADMIN, UserRole.EMPLOYEE],
            UserRole.BRANCH_ADMIN: [UserRole.BRANCH_ADMIN, UserRole.EMPLOYEE],
            UserRole.EMPLOYEE: []
        }
        return target_role in role_hierarchy.get(admin_role, [])
    
    @staticmethod
    def can_admin_see_user(admin_user: User, target_user: User) -> bool:
        """Check if admin can see a specific user"""
        if admin_user.role == UserRole.MASTER_ADMIN:
            return True
        elif admin_user.role == UserRole.IT_ADMIN:
            return True  # IT Admin sees all employees
        elif admin_user.role == UserRole.BRANCH_ADMIN:
            return target_user.branch == admin_user.branch
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
        if creator.role not in [UserRole.MASTER_ADMIN, UserRole.IT_ADMIN]:
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
        if not admin or admin.role not in [UserRole.MASTER_ADMIN, UserRole.IT_ADMIN, UserRole.BRANCH_ADMIN]:
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
        if not user or user.is_blocked:
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
        if not admin or admin.role not in [UserRole.MASTER_ADMIN, UserRole.IT_ADMIN, UserRole.BRANCH_ADMIN]:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only admins can view employees"
            )
        
        # Get all users
        all_users = db.query(User).all()
        
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
        if not admin or admin.role not in [UserRole.MASTER_ADMIN, UserRole.IT_ADMIN, UserRole.BRANCH_ADMIN]:
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
        if not admin or admin.role not in [UserRole.MASTER_ADMIN, UserRole.IT_ADMIN]:
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
        
        # IT Admin cannot delete Master Admin or other IT Admins
        if admin.role == UserRole.IT_ADMIN:
            if employee.role == UserRole.MASTER_ADMIN:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="IT Admin cannot delete Master Admin"
                )
            if employee.role == UserRole.IT_ADMIN:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="IT Admin cannot delete another IT Admin"
                )
        
        db.delete(employee)
        db.commit()
        return employee
    
    @staticmethod
    def toggle_block_employee(db: Session, employee_id: int, admin_user_id: str, block_status: bool):
        """Toggle employee block status"""
        admin = db.query(User).filter(User.user_id == admin_user_id).first()
        if not admin or admin.role not in [UserRole.MASTER_ADMIN, UserRole.IT_ADMIN, UserRole.BRANCH_ADMIN]:
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
        return employee
    
    @staticmethod
    def toggle_export_permission(db: Session, employee_id: int, admin_user_id: str, export_status: bool):
        """Toggle employee export permission"""
        admin = db.query(User).filter(User.user_id == admin_user_id).first()
        if not admin or admin.role not in [UserRole.MASTER_ADMIN, UserRole.IT_ADMIN]:
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
    def create_or_update_bulk_users(db: Session, users_data, admin_user_id: str):
        """Create new users or update existing ones based on user_id"""
        admin = db.query(User).filter(User.user_id == admin_user_id).first()
        if not admin or admin.role not in [UserRole.MASTER_ADMIN, UserRole.IT_ADMIN, UserRole.BRANCH_ADMIN]:
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
        if not admin or admin.role not in [UserRole.MASTER_ADMIN, UserRole.IT_ADMIN]:
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
        if not admin or admin.role not in [UserRole.MASTER_ADMIN, UserRole.IT_ADMIN]:
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
        if not admin or admin.role not in [UserRole.MASTER_ADMIN, UserRole.IT_ADMIN]:
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