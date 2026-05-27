from sqlalchemy import text
from sqlalchemy.orm import Session
from datetime import datetime
import pandas as pd
from io import BytesIO
import zipfile
import logging
import traceback

logger = logging.getLogger(__name__)

class DeleteController:
    
    @staticmethod
    def convert_to_excel_compatible(df):
        """Convert timezone-aware datetimes to timezone-naive for Excel compatibility"""
        for col in df.columns:
            if df[col].dtype == 'datetime64[ns, UTC]' or 'datetime' in str(df[col].dtype):
                try:
                    df[col] = pd.to_datetime(df[col]).dt.tz_localize(None)
                except:
                    try:
                        df[col] = pd.to_datetime(df[col], utc=True).dt.tz_localize(None)
                    except:
                        pass
        return df
    
    @staticmethod
    def backup_data(db: Session, data_type: str):
        """Create backup of selected data type"""
        try:
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            excel_files = []
            
            if data_type == "customerData":
                tables_to_backup = [
                    "customers",
                    "amc_agreements",
                    "asset_detailed",
                    "oil_services",
                    "anubandhan_plus_quotes",
                    "anubandhan_quotes",
                    "bandhan_plus_quotes",
                    "pulse_quotations",
                    "regular_bandhan",
                    "lms_data",
                    "open_sr_load_reports",
                    "campaigns",
                    "campaign_services",
                    "followups",
                    "activities",
                    "rr",
                    "non_followups"
                ]
                
                for table_name in tables_to_backup:
                    try:
                        result = db.execute(text(f"SELECT TOP 1 * FROM {table_name}"))
                        if result.fetchone():
                            result = db.execute(text(f"SELECT * FROM {table_name}"))
                            rows = result.fetchall()
                            if rows:
                                columns = result.keys()
                                data = [dict(zip(columns, row)) for row in rows]
                                df = pd.DataFrame(data)
                                df = DeleteController.convert_to_excel_compatible(df)
                                excel_files.append((table_name, df))
                    except Exception as e:
                        logger.warning(f"Table {table_name} may not exist or error: {str(e)}")
                        
            elif data_type == "usersData":
                try:
                    result = db.execute(text("SELECT * FROM users WHERE role != 'master_admin'"))
                    rows = result.fetchall()
                    if rows:
                        columns = result.keys()
                        data = [dict(zip(columns, row)) for row in rows]
                        df = pd.DataFrame(data)
                        if 'password' in df.columns:
                            df = df.drop(columns=['password'])
                        df = DeleteController.convert_to_excel_compatible(df)
                        excel_files.append(("users", df))
                except Exception as e:
                    logger.warning(f"Error backing up users: {str(e)}")
                    
            elif data_type == "updateHistory":
                try:
                    result = db.execute(text("SELECT * FROM customer_edit_history"))
                    rows = result.fetchall()
                    if rows:
                        columns = result.keys()
                        data = [dict(zip(columns, row)) for row in rows]
                        df = pd.DataFrame(data)
                        df = DeleteController.convert_to_excel_compatible(df)
                        excel_files.append(("customer_edit_history", df))
                except Exception as e:
                    logger.warning(f"Error backing up edit history: {str(e)}")
                    
            elif data_type == "employeeQueries":
                try:
                    result = db.execute(text("SELECT * FROM employee_queries"))
                    rows = result.fetchall()
                    if rows:
                        columns = result.keys()
                        data = [dict(zip(columns, row)) for row in rows]
                        df = pd.DataFrame(data)
                        df = DeleteController.convert_to_excel_compatible(df)
                        excel_files.append(("employee_queries", df))
                except Exception as e:
                    logger.warning(f"Error backing up employee queries: {str(e)}")
            
            if not excel_files:
                raise Exception(f"No data found to backup for {data_type}")
                
            zip_buffer = BytesIO()
            with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zip_file:
                for table_name, df in excel_files:
                    excel_buffer = BytesIO()
                    with pd.ExcelWriter(excel_buffer, engine='openpyxl') as writer:
                        df.to_excel(writer, sheet_name=table_name[:31], index=False)
                    excel_buffer.seek(0)
                    zip_file.writestr(f"{table_name}_{timestamp}.xlsx", excel_buffer.getvalue())
            
            zip_buffer.seek(0)
            return zip_buffer
            
        except Exception as e:
            logger.error(f"Backup error: {str(e)}")
            logger.error(f"Traceback: {traceback.format_exc()}")
            raise Exception(f"Failed to create backup: {str(e)}")
    
    @staticmethod
    def clear_table_data(db: Session, table_name: str, force_delete: bool = False):
        """Clear data from a table using DELETE"""
        try:
            if force_delete:
                db.execute(text(f"DELETE FROM {table_name}"))
            else:
                try:
                    db.execute(text(f"TRUNCATE TABLE {table_name}"))
                    return True
                except Exception:
                    db.execute(text(f"DELETE FROM {table_name}"))
            
            try:
                db.execute(text(f"DBCC CHECKIDENT ('{table_name}', RESEED, 0)"))
            except:
                pass
            
            return True
        except Exception:
            return False
    
    @staticmethod
    def delete_selected_data(db: Session, confirm: str, data_types: dict):
        """Delete selected data types"""
                
        if confirm != "DELETE DATA":
            raise Exception("Confirmation text mismatch")
        
        deleted_status = {
            "customerData": False,
            "usersData": False,
            "updateHistory": False,
            "employeeQueries": False
        }
        
        try:
            db.execute(text("EXEC sp_msforeachtable 'ALTER TABLE ? NOCHECK CONSTRAINT all'"))
            
            if data_types.get("customerData"):
                DeleteController.clear_table_data(db, "non_followups", force_delete=True)
                DeleteController.clear_table_data(db, "followups", force_delete=True)
                DeleteController.clear_table_data(db, "activities", force_delete=True)
                DeleteController.clear_table_data(db, "rr", force_delete=True)
                DeleteController.clear_table_data(db, "campaign_services", force_delete=True)
                DeleteController.clear_table_data(db, "campaigns", force_delete=True)
                DeleteController.clear_table_data(db, "amc_agreements", force_delete=True)
                DeleteController.clear_table_data(db, "asset_detailed", force_delete=True)
                DeleteController.clear_table_data(db, "oil_services", force_delete=True)
                DeleteController.clear_table_data(db, "anubandhan_plus_quotes", force_delete=True)
                DeleteController.clear_table_data(db, "anubandhan_quotes", force_delete=True)
                DeleteController.clear_table_data(db, "bandhan_plus_quotes", force_delete=True)
                DeleteController.clear_table_data(db, "pulse_quotations", force_delete=True)
                DeleteController.clear_table_data(db, "regular_bandhan", force_delete=True)
                DeleteController.clear_table_data(db, "lms_data", force_delete=True)
                DeleteController.clear_table_data(db, "open_sr_load_reports", force_delete=True)
                DeleteController.clear_table_data(db, "customers", force_delete=True)
                deleted_status["customerData"] = True
            
            if data_types.get("usersData"):
                db.execute(text("DELETE FROM users WHERE role != 'master_admin'"))
                try:
                    db.execute(text("DBCC CHECKIDENT ('users', RESEED, 0)"))
                except:
                    pass
                deleted_status["usersData"] = True
            
            if data_types.get("updateHistory"):
                DeleteController.clear_table_data(db, "customer_edit_history", force_delete=True)
                deleted_status["updateHistory"] = True
            
            if data_types.get("employeeQueries"):
                DeleteController.clear_table_data(db, "employee_queries", force_delete=True)
                deleted_status["employeeQueries"] = True
            
            db.commit()
            db.execute(text("EXEC sp_msforeachtable 'ALTER TABLE ? WITH CHECK CHECK CONSTRAINT all'"))
            db.commit()
            
            return {
                "success": True,
                "message": "Selected data deleted successfully",
                "deleted": deleted_status
            }
            
        except Exception as e:
            db.rollback()
            try:
                db.execute(text("EXEC sp_msforeachtable 'ALTER TABLE ? WITH CHECK CHECK CONSTRAINT all'"))
                db.commit()
            except:
                pass
            raise Exception(f"Failed to delete data: {str(e)}")