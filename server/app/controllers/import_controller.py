import pandas as pd
from datetime import datetime
from sqlalchemy.orm import Session
from sqlalchemy import and_, or_
from sqlalchemy.exc import IntegrityError
from fastapi import UploadFile, HTTPException
import io
import re

from app.models.customer_model import (
    Customer, AMCAgreement, AssetDetailed, AssetService,
    AnubandhanPlusQuote, AnubandhanQuote, BandhanPlusQuote,
    PulseQuotation, RegularBandhan, LMSData, OpenSRLoadReport
)

class ImportController:
    def __init__(self, db: Session):
        self.db = db
    
    # ============ BULK PRELOAD HELPERS (NEW) ============
    def _bulk_load_by_instance_id(self, model, instance_ids):
        """Load all rows of `model` whose instance_id is in the list. Returns {instance_id: row}."""
        ids = list({iid for iid in instance_ids if iid})
        if not ids:
            return {}
        result = {}
        # Chunk to stay under DB IN-clause limits
        for i in range(0, len(ids), 1000):
            chunk = ids[i:i + 1000]
            rows = self.db.query(model).filter(model.instance_id.in_(chunk)).all()
            for r in rows:
                if r.instance_id and r.instance_id not in result:
                    result[r.instance_id] = r
        return result

    def _build_engine_to_instance_map(self, engine_serials):
        """One-shot map engine_serial_no -> instance_id from all source tables."""
        serials = list({s for s in engine_serials if s})
        if not serials:
            return {}
        mapping = {}
        sources = [
            (AssetDetailed, AssetDetailed.engine_serial_no),
            (AssetService, AssetService.engine_serial_no),
            (AnubandhanPlusQuote, AnubandhanPlusQuote.engine_no),
            (AnubandhanQuote, AnubandhanQuote.engine_no),
            (BandhanPlusQuote, BandhanPlusQuote.engine_no),
            (OpenSRLoadReport, OpenSRLoadReport.engine_serial_no),
        ]
        for i in range(0, len(serials), 1000):
            chunk = serials[i:i + 1000]
            for model, col in sources:
                rows = self.db.query(col, model.instance_id).filter(
                    col.in_(chunk), model.instance_id.isnot(None)
                ).all()
                for serial, iid in rows:
                    if serial and iid and serial not in mapping:
                        mapping[serial] = iid
        return mapping

    def _build_instance_to_branch_map(self, instance_ids):
        """One-shot map instance_id -> branch_id from all source tables."""
        ids = list({iid for iid in instance_ids if iid})
        if not ids:
            return {}
        mapping = {}
        sources = [AMCAgreement, AssetDetailed, AssetService, LMSData]
        for i in range(0, len(ids), 1000):
            chunk = ids[i:i + 1000]
            for model in sources:
                rows = self.db.query(model.instance_id, model.branch_id).filter(
                    model.instance_id.in_(chunk), model.branch_id.isnot(None)
                ).all()
                for iid, bid in rows:
                    if iid and bid and iid not in mapping:
                        mapping[iid] = bid
        return mapping
    # ============ END NEW HELPERS ============
    
    def parse_date(self, date_value):
        """Parse various date formats"""
        if pd.isna(date_value) or date_value is None or date_value == '':
            return None
        
        if isinstance(date_value, datetime):
            return date_value
        
        if isinstance(date_value, pd.Timestamp):
            return date_value.to_pydatetime()
        
        date_str = str(date_value).strip()
        
        # Try different date formats
        date_formats = [
            '%Y-%m-%d %H:%M:%S',
            '%Y-%m-%d',
            '%d-%m-%Y %H:%M:%S',
            '%d-%m-%Y',
            '%m/%d/%Y %H:%M:%S',
            '%m/%d/%Y',
            '%d/%m/%Y %H:%M:%S',
            '%d/%m/%Y',
            '%d-%m-%y %H:%M',
            '%d-%m-%y',
            '%d/%m/%y',
            '%Y/%m/%d'
        ]
        
        for fmt in date_formats:
            try:
                return datetime.strptime(date_str, fmt)
            except:
                continue
        
        return None
    
    def convert_to_string(self, value):
        """Convert any value to string without .0 decimal suffix"""
        if pd.isna(value) or value is None or value == '':
            return None
        
        # Convert to string
        str_value = str(value).strip()
        
        # Remove .0 at the end if it exists (for numbers like 123.0)
        if str_value.endswith('.0'):
            str_value = str_value[:-2]
        
        return str_value
    
    def clean_instance_id(self, value):
        """Clean and validate instance ID"""
        if pd.isna(value) or value is None or value == '':
            return None
        
        # Convert to string using convert_to_string to remove .0
        instance_id = self.convert_to_string(value)
        
        if not instance_id:
            return None
        
        # Check if it's a valid ID (not just a number or special chars)
        # Allow alphanumeric, hyphens, underscores, dots, slashes
        if re.match(r'^[A-Za-z0-9_\-\.\/]+$', instance_id):
            return instance_id
        else:
            # If it contains invalid characters, still return but log warning
            # This ensures data isn't lost
            return instance_id
    
    def truncate_string(self, value, max_length=500):
        """Truncate string to max_length if needed"""
        if value is None or pd.isna(value):
            return None
        
        # Convert to string using convert_to_string
        value_str = self.convert_to_string(value)
        
        if not value_str:
            return None
        
        if len(value_str) > max_length:
            return value_str[:max_length-3] + "..."
        return value_str
    
    def extract_instance_id(self, row, file_type):
        """Extract instance_id from row based on file type"""
        instance_id = None
        
        # Exact column names for each file type
        column_mapping = {
            'AMC Agreement History': 'INSTANCE ID',
            'Asset Detailed Report': 'ASSET NUMBER',
            'Asset Details with Last Oil Service': 'ASSET NUMBER',
            'Anubandhan Plus Quotes Report': 'Pulse Instance ID',
            'Anubandhan Quotes Report': 'Pulse Instance ID',
            'BandhanPlus Quotes Report': 'Pulse Instance ID',
            'Pulse Quotation - Service Only': 'Instance Id',
            'Regular Bandhan Customers Report': None,  # No instance_id in this file
            'LMS Data for ERP': 'Instance ID',
            'Open SR Load Report': 'Instance Id [Asset #]'  # Fixed: Added the correct column name
        }
        
        col_name = column_mapping.get(file_type)
        if col_name and col_name in row and pd.notna(row[col_name]) and row[col_name] != '':
            instance_id = self.clean_instance_id(row[col_name])
        
        return instance_id
    
    def extract_instance_id_from_asset(self, instance_id_asset):
        """Extract instance_id from instance_id_asset field (format: 'Asset #: INSTANCE_ID')"""
        if pd.isna(instance_id_asset) or instance_id_asset is None or instance_id_asset == '':
            return None
        
        instance_str = self.convert_to_string(instance_id_asset)
        
        if not instance_str:
            return None
        
        # Check if it contains "Asset #: " pattern
        if "Asset #:" in instance_str:
            # Extract the part after "Asset #: "
            parts = instance_str.split("Asset #:")
            if len(parts) > 1:
                instance_id = parts[1].strip()
                return self.clean_instance_id(instance_id)
        
        # If no pattern, just clean and return
        return self.clean_instance_id(instance_str)
    
    def extract_engine_serial_no(self, row, file_type):
        """Extract engine serial number from row based on file type"""
        engine_serial_no = None
        
        # Exact column names for each file type
        column_mapping = {
            'AMC Agreement History': None,
            'Asset Detailed Report': 'ENGINE SERIAL NO',
            'Asset Details with Last Oil Service': 'ENGINE SERIAL NO',
            'Anubandhan Plus Quotes Report': 'EngineNo',
            'Anubandhan Quotes Report': 'EngineNo',
            'BandhanPlus Quotes Report': 'EngineNo',
            'Pulse Quotation - Service Only': None,
            'Regular Bandhan Customers Report': 'Genset Number',
            'LMS Data for ERP': None,
            'Open SR Load Report': 'Engine Serial#'
        }
        
        col_name = column_mapping.get(file_type)
        if col_name and col_name in row and pd.notna(row[col_name]) and row[col_name] != '':
            engine_serial_no = self.convert_to_string(row[col_name])
        
        return engine_serial_no
    
    def extract_branch_id(self, row, file_type):
        """Extract branch ID from row based on file type"""
        branch_id = None
        
        # Exact column names for each file type that contain branch ID
        column_mapping = {
            'AMC Agreement History': 'BRANCH ID',
            'Asset Detailed Report': 'BRANCH ID',
            'Asset Details with Last Oil Service': 'BRANCH ID',
            'Anubandhan Plus Quotes Report': None,  # No branch ID in this file
            'Anubandhan Quotes Report': None,  # No branch ID in this file
            'BandhanPlus Quotes Report': None,  # No branch ID in this file
            'Pulse Quotation - Service Only': None,  # No branch ID in this file
            'Regular Bandhan Customers Report': None,  # No branch ID in this file
            'LMS Data for ERP': 'BRANCH ID',
            'Open SR Load Report': None  # No branch ID in this file
        }
        
        col_name = column_mapping.get(file_type)
        if col_name and col_name in row and pd.notna(row[col_name]) and row[col_name] != '':
            branch_id = self.truncate_string(row[col_name], 100)
        
        return branch_id
    
    def find_instance_id_by_engine_no(self, engine_serial_no):
        """Find instance_id from any table using engine serial number"""
        if not engine_serial_no:
            return None
        
        # Search in Asset Detailed table
        asset = self.db.query(AssetDetailed).filter(
            AssetDetailed.engine_serial_no == engine_serial_no,
            AssetDetailed.instance_id.isnot(None)
        ).first()
        if asset and asset.instance_id:
            return asset.instance_id
        
        # Search in Asset Service table
        asset_service = self.db.query(AssetService).filter(
            AssetService.engine_serial_no == engine_serial_no,
            AssetService.instance_id.isnot(None)
        ).first()
        if asset_service and asset_service.instance_id:
            return asset_service.instance_id
        
        # Search in Anubandhan Plus table
        anubandhan_plus = self.db.query(AnubandhanPlusQuote).filter(
            AnubandhanPlusQuote.engine_no == engine_serial_no,
            AnubandhanPlusQuote.instance_id.isnot(None)
        ).first()
        if anubandhan_plus and anubandhan_plus.instance_id:
            return anubandhan_plus.instance_id
        
        # Search in Anubandhan table
        anubandhan = self.db.query(AnubandhanQuote).filter(
            AnubandhanQuote.engine_no == engine_serial_no,
            AnubandhanQuote.instance_id.isnot(None)
        ).first()
        if anubandhan and anubandhan.instance_id:
            return anubandhan.instance_id
        
        # Search in BandhanPlus table
        bandhan_plus = self.db.query(BandhanPlusQuote).filter(
            BandhanPlusQuote.engine_no == engine_serial_no,
            BandhanPlusQuote.instance_id.isnot(None)
        ).first()
        if bandhan_plus and bandhan_plus.instance_id:
            return bandhan_plus.instance_id
        
        # Search in Open SR Load Report table
        open_sr = self.db.query(OpenSRLoadReport).filter(
            OpenSRLoadReport.engine_serial_no == engine_serial_no,
            OpenSRLoadReport.instance_id.isnot(None)
        ).first()
        if open_sr and open_sr.instance_id:
            return open_sr.instance_id
        
        return None
    
    def find_branch_id_by_instance_id(self, instance_id):
        """Find branch_id from any table using instance_id"""
        if not instance_id:
            return None
        
        # Search in AMC Agreement table
        amc = self.db.query(AMCAgreement).filter(
            AMCAgreement.instance_id == instance_id,
            AMCAgreement.branch_id.isnot(None)
        ).first()
        if amc and amc.branch_id:
            return amc.branch_id
        
        # Search in Asset Detailed table
        asset = self.db.query(AssetDetailed).filter(
            AssetDetailed.instance_id == instance_id,
            AssetDetailed.branch_id.isnot(None)
        ).first()
        if asset and asset.branch_id:
            return asset.branch_id
        
        # Search in Asset Service table
        asset_service = self.db.query(AssetService).filter(
            AssetService.instance_id == instance_id,
            AssetService.branch_id.isnot(None)
        ).first()
        if asset_service and asset_service.branch_id:
            return asset_service.branch_id
        
        # Search in LMS Data table
        lms = self.db.query(LMSData).filter(
            LMSData.instance_id == instance_id,
            LMSData.branch_id.isnot(None)
        ).first()
        if lms and lms.branch_id:
            return lms.branch_id
        
        return None
    
    def update_customer_branch_id(self, customer, branch_id):
        """Update customer's branch_id if it's not already set"""
        if not branch_id:
            return False
        
        # Only update if current branch_id is None or different
        if customer.branch_id is None or customer.branch_id != branch_id:
            customer.branch_id = branch_id
            return True
        
        return False
    
    def update_or_create_customer(self, instance_id, row=None, file_type=None, cache=None):
        """Update or create customer record. `cache` is a dict {instance_id: Customer} for O(1) lookup."""
        if not instance_id:
            return None
        
        # Clean instance_id again just to be safe
        instance_id = self.clean_instance_id(instance_id)
        if not instance_id:
            return None
        
        # O(1) cache hit instead of SELECT-per-row
        customer = cache.get(instance_id) if cache is not None else None
        if customer is None and cache is None:
            customer = self.db.query(Customer).filter(
                Customer.instance_id == instance_id
            ).first()
        
        if not customer:
            # Create new customer
            customer_data = {'instance_id': instance_id}
            
            # Extract customer details from row if available
            if row is not None:
                self.extract_customer_details_from_row(customer_data, row, file_type)
                
                # Extract branch_id from current row if file_type is provided
                if file_type:
                    branch_id = self.extract_branch_id(row, file_type)
                    if branch_id:
                        customer_data['branch_id'] = branch_id
            
            try:
                customer = Customer(**customer_data)
                self.db.add(customer)
                # No flush — autoflush will fire when needed; cache prevents duplicate adds
                if cache is not None:
                    cache[instance_id] = customer
            except IntegrityError:
                self.db.rollback()
                customer = self.db.query(Customer).filter(
                    Customer.instance_id == instance_id
                ).first()
                if cache is not None and customer:
                    cache[instance_id] = customer
        else:
            # Update existing customer with new details if available
            if row is not None:
                self.update_customer_details(customer, row, file_type)
                
                # Update branch_id from current row if file_type is provided
                if file_type:
                    branch_id = self.extract_branch_id(row, file_type)
                    if branch_id:
                        self.update_customer_branch_id(customer, branch_id)
                # No per-row flush
        
        return customer

    def update_customer_details(self, customer, row, file_type=None):
        """Update customer details from row data - only updates if field is None or new data is different"""
        updated = False
        
        if file_type == 'Open SR Load Report':
            field_mappings = {
                'customer_name': ['Account'],  # Only 'Account' column for Open SR
                'phone_number': ['Customer Mobile #', 'Primary Phone#', 'Contact Phone Number'],
                'email': ['Account/Contact Primary Email', 'Contact Email'],
                'pan_number': ['PAN Card No.', 'PAN Number'],
                'location': ['Installation Site Address', 'Location']
            }
        elif file_type == 'Pulse Quotation - Service Only':
            field_mappings = {
                'customer_name': ['Account'],  # Only 'Account' column
                'phone_number': ['Account/Contact Phone Number', 'CONTACT PHONE NUMBER', 'MobileNo', 'Mobile', 'Customer Mobile #', 'Primary Phone#'],
                'email': ['Account/Contact Primary Email', 'CONTACT EMAIL ID', 'EmailId', 'Email'],
                'pan_number': ['PAN Card No.', 'PAN Number', 'PAN'],
                'location': ['Installation Site Address', 'INSTALLATION SITE ADDRESS', 'Location', 'DG Location', 'Billing Location']
            }
        elif file_type == 'BandhanPlus Quotes Report':
            field_mappings = {
                'customer_name': ['CompanyName', 'Account'],
                'phone_number': ['MobileNo', 'ContactPersonName', 'Account/Contact Phone Number'],
                'email': ['EmailId', 'Account/Contact Primary Email'],
                'pan_number': ['PAN Card No.', 'PAN Number', 'PAN'],
                'location': ['City']
            }
        elif file_type == 'Asset Detailed Report':
            field_mappings = {
                'customer_name': ['ACCOUNT NAME'],
                'phone_number': ['CONTACT PHONE NUMBER'],
                'email': ['CONTACT EMAIL ID'],
                'pan_number': [],
                'location': ['INSTALLATION SITE ADDRESS']
            }
        elif file_type == 'Regular Bandhan Customers Report':
            field_mappings = {
                'customer_name': ['Name'],
                'phone_number': ['Mobile'],
                'email': ['Email'],
                'pan_number': ['PAN Card No.'],
                'location': ['Billing Location', 'DG Location', 'City']
            }
        elif file_type == 'LMS Data for ERP':
            field_mappings = {
                'customer_name': ['Account Name'],
                'phone_number': ['Account Contact Number'],
                'email': ['Account Contact Email ID'],
                'pan_number': [],
                'location': ['Installation Site Address']
            }
        else:
            field_mappings = {
                'customer_name': ['CUSTOMER NAME', 'Name', 'CompanyName', 'ACCOUNT NAME', 'Account', 'Customer Name', 'customer_name', 'name'],
                'phone_number': ['CONTACT PHONE NUMBER', 'MobileNo', 'Mobile', 'CONTACT PHONE NUMBER', 'Account/Contact Phone Number', 'Customer Mobile #', 'Primary Phone#', 'phone_number', 'mobile_no', 'mobile'],
                'email': ['CONTACT EMAIL ID', 'EmailId', 'Email', 'CONTACT EMAIL ID', 'Account/Contact Primary Email', 'email_id', 'email'],
                'pan_number': ['PAN Card No.', 'PAN Number', 'PAN', 'pan_card_no', 'pan_number'],
                'location': ['INSTALLATION SITE ADDRESS', 'Location', 'DG Location', 'Installation Site Address', 'Billing Location', 'location', 'address']
            }
        
        for field, possible_cols in field_mappings.items():
            current_value = getattr(customer, field)
            
            for col in possible_cols:
                if col in row and pd.notna(row[col]) and row[col] != '':
                    value = row[col]
                    
                    if field == 'phone_number':
                        processed_value = re.sub(r'\D', '', self.convert_to_string(value))
                    elif field in ['customer_name', 'email', 'location']:
                        processed_value = self.truncate_string(value, 500)
                    else:
                        processed_value = self.convert_to_string(value)
                    
                    if current_value is None or current_value != processed_value:
                        setattr(customer, field, processed_value)
                        updated = True
                        break
        
        return updated
    
    def extract_customer_details_from_row(self, customer_data, row, file_type=None):
        """Extract customer details from row for new customer creation"""
        
        if file_type == 'Open SR Load Report':
            field_mappings = {
                'customer_name': ['Account'],
                'phone_number': ['Customer Mobile #', 'Primary Phone#', 'Contact Phone Number'],
                'email': ['Account/Contact Primary Email', 'Contact Email'],
                'pan_number': ['PAN Card No.', 'PAN Number'],
                'location': ['Installation Site Address', 'Location']
            }
        elif file_type == 'Pulse Quotation - Service Only':
            field_mappings = {
                'customer_name': ['Account'],
                'phone_number': ['Account/Contact Phone Number', 'CONTACT PHONE NUMBER', 'MobileNo', 'Mobile', 'Customer Mobile #', 'Primary Phone#'],
                'email': ['Account/Contact Primary Email', 'CONTACT EMAIL ID', 'EmailId', 'Email'],
                'pan_number': ['PAN Card No.', 'PAN Number', 'PAN'],
                'location': ['Installation Site Address', 'INSTALLATION SITE ADDRESS', 'Location', 'DG Location', 'Billing Location']
            }
        elif file_type == 'BandhanPlus Quotes Report':
            field_mappings = {
                'customer_name': ['CompanyName', 'Account'],
                'phone_number': ['MobileNo', 'ContactPersonName', 'Account/Contact Phone Number'],
                'email': ['EmailId', 'Account/Contact Primary Email'],
                'pan_number': ['PAN Card No.', 'PAN Number', 'PAN'],
                'location': ['City']
            }
        elif file_type == 'Asset Detailed Report':  # ADD THIS BLOCK
            field_mappings = {
                'customer_name': ['ACCOUNT NAME'],  # Take from ACCOUNT NAME only
                'phone_number': ['CONTACT PHONE NUMBER'],
                'email': ['CONTACT EMAIL ID'],
                'pan_number': [],
                'location': ['INSTALLATION SITE ADDRESS']
            }
        elif file_type == 'Regular Bandhan Customers Report':
            field_mappings = {
                'customer_name': ['Name'],
                'phone_number': ['Mobile'],
                'email': ['Email'],
                'pan_number': ['PAN Card No.'],
                'location': ['Billing Location', 'DG Location', 'City']
            }
        elif file_type == 'LMS Data for ERP':
            field_mappings = {
                'customer_name': ['Account Name'],
                'phone_number': ['Account Contact Number'],
                'email': ['Account Contact Email ID'],
                'pan_number': [],
                'location': ['Installation Site Address']
            }
        else:
            field_mappings = {
                'customer_name': ['CUSTOMER NAME', 'Name', 'CompanyName', 'ACCOUNT NAME', 'Account', 'Customer Name', 'customer_name', 'name'],
                'phone_number': ['CONTACT PHONE NUMBER', 'MobileNo', 'Mobile', 'CONTACT PHONE NUMBER', 'Account/Contact Phone Number', 'Customer Mobile #', 'Primary Phone#', 'phone_number', 'mobile_no', 'mobile'],
                'email': ['CONTACT EMAIL ID', 'EmailId', 'Email', 'CONTACT EMAIL ID', 'Account/Contact Primary Email', 'email_id', 'email'],
                'pan_number': ['PAN Card No.', 'PAN Number', 'PAN', 'pan_card_no', 'pan_number'],
                'location': ['INSTALLATION SITE ADDRESS', 'Location', 'DG Location', 'Installation Site Address', 'Billing Location', 'location', 'address']
            }
        
        for field, possible_cols in field_mappings.items():
            for col in possible_cols:
                if col in row and pd.notna(row[col]) and row[col] != '':
                    value = row[col]
                    if field == 'phone_number':
                        value = re.sub(r'\D', '', self.convert_to_string(value))
                    elif field in ['customer_name', 'email', 'location']:
                        value = self.truncate_string(value, 500)
                    else:
                        value = self.convert_to_string(value)
                    customer_data[field] = value
                    break
    
    def validate_file_format(self, df, file_type):
        """Validate if file has all required columns based on file type"""
        
        expected_columns = {
            'AMC Agreement History': [
                'ZONE NAME', 'SD ID', 'SD NAME', 'BRANCH ID', 'BRANCH NAME', 
                'INSTANCE ID', 'SEGMENT', 'KVA RATING', 'ENGINE MODEL', 
                'AGREEMENT NUMBER', 'NUMBER OF AGREEMENT YEARS', 'AGREEMENT NAME',
                'AGREEMENT STATUS', 'AGREEMENT TYPE', 'AGREEMENT CREATED DATE',
                'AGREEMENT START DATE', 'AGREEMENT END DATE', 'AGREEMENT PRODUCT NAME',
                'LAST AGREEMENT NUMBER', 'LAST AGREEMENT NO OF YEARS', 'LAST AGREEMENT TYPE',
                'LAST AGREEMENT STATUS', 'LAST AGREEMENT PRODUCT NAME',
                'LAST AGREEMENT START DATE', 'LAST AGREEMENT END DATE'
            ],
            'Asset Detailed Report': [
                'ZONE NAME', 'SD ID', 'SD NAME', 'BRANCH ID', 'BRANCH NAME',
                'DISTRICT', 'ASSET NUMBER', 'COMMISSIONING DATE', 'INSTALLATION DATE',
                'GOEM OEM', 'APPLICATION CODE', 'ENGINE SERIAL NO', 'ENGINE MODEL',
                'ACCOUNT NAME', 'CUSTOMER NAME', 'CONTACT PHONE NUMBER', 'CONTACT EMAIL ID',
                'WARRANTY EXPIRY DATE', 'INSTALLATION SITE ADDRESS', 'PRODUCT SEGMENT',
                'SEGMENT', 'CUSTOMER SEGMENT', 'ASSET OPERATIONAL STATUS',
                'KRM NUMBER', 'KRM STATUS', 'KRM ACTIVE DATE', 'KRM INACTIVE DATE',
                'KRM SUBSCRIPTION START DATE', 'KRM SUBSCRIPTION END DATE', 'KVA RATING'
            ],
            'Asset Details with Last Oil Service': [
                'ZONE NAME', 'SD ID', 'SD NAME', 'BRANCH ID', 'BRANCH NAME',
                'ASSET NUMBER', 'COMMISSIONING DATE', 'PRODUCT SEGMENT', 'APPLICATION CODE',
                'ENGINE SERIAL NO', 'ACCOUNT NAME', 'CONTACT PHONE NUMBER',
                'LAST CLOSED SR NUMBER', 'LAST SR TYPE', 'LAST SR SUBTYPE',
                'LAST SR CLOSE DATE', 'LAST OIL CHANGE SR NUMBER', 'LAST OIL CHANGE SR TYPE',
                'LAST OIL CHANGE SR SUB TYPE', 'LAST OIL CHANGE DATE',
                'INSTALLATION SITE ADDRESS', 'LAST SERVICE HRS'
            ],
            'Anubandhan Plus Quotes Report': [
                'Id', 'QuotationRefNo', 'CompanyName', 'EngineNo', 'ContactPersonName',
                'MobileNo', 'EmailId', 'GensetKVA', 'Zone', 'State', 'City', 'Location',
                'NoOfYears', 'GensetRunningPerYear', 'CreatedDateTime', 'Status',
                'PaymentType', 'TransactionId', 'BankName', 'AccountNo', 'DateOfPayment',
                'PaymentUpdateDateTime', 'IsNEFTConfirm', 'IsChequeConfirm',
                'Cheque deposited-Address of YES Bank Branch', 'cheque given-Name of KOEL Dealership',
                'Cheque Deposited', 'Cheque To Dealer', 'Employee Name', 'Pulse Id',
                'IsInvoiceSent', 'IsRefund', 'AgentId', 'QuotePrice',
                'Quotation Value Including tax', 'Name of Agent', 'Actual Amount',
                'Reason of Short Payment', 'Status updated by Admin', 'Quotation Expiry Date',
                'IsExpired', 'Payment Updated Month', 'Pulse Instance ID', 'New Price Applicable',
                'QuotationType'
            ],
            'Anubandhan Quotes Report': [
                'Id', 'QuotationRefNo', 'CompanyName', 'EngineNo', 'ContactPersonName',
                'MobileNo', 'EmailId', 'GensetKVA', 'Zone', 'State', 'City', 'Location',
                'NoOfYears', 'GensetRunningPerYear', 'CreatedDateTime', 'Status',
                'PaymentType', 'TransactionId', 'BankName', 'AccountNo', 'DateOfPayment',
                'PaymentUpdateDateTime', 'IsNEFTConfirm', 'IsChequeConfirm',
                'Cheque deposited-Address of YES Bank Branch', 'cheque given-Name of KOEL Dealership',
                'Cheque Deposited', 'Cheque To Dealer', 'Employee Name', 'Pulse Id',
                'IsInvoiceSent', 'IsRefund', 'AgentId', 'QuotePrice',
                'Quotation Value Including tax', 'Name of Agent', 'Actual Amount',
                'Reason of Short Payment', 'Status updated by Admin', 'Quotation Expiry Date',
                'IsExpired', 'Payment Updated Month', 'Pulse Instance ID', 'New Price Applicable',
                'QuotationType'
            ],
            'BandhanPlus Quotes Report': [
                'Id', 'QuotationRefNo', 'CompanyName', 'EngineNo', 'ContactPersonName',
                'MobileNo', 'EmailId', 'GensetKVA', 'Zone', 'State', 'City', 'Location',
                'NoOfYears', 'GensetRunningPerYear', 'CreatedDateTime', 'Status',
                'PaymentType', 'TransactionId', 'BankName', 'AccountNo', 'DateOfPayment',
                'PaymentUpdateDateTime', 'IsNEFTConfirm', 'IsChequeConfirm',
                'Cheque deposited-Address of YES Bank Branch', 'cheque given-Name of KOEL Dealership',
                'Cheque Deposited', 'Cheque To Dealer', 'Employee Name', 'Pulse Id',
                'IsInvoiceSent', 'IsRefund', 'AgentId', 'QuotePrice',
                'Quotation Value Including tax', 'Name of Agent', 'Actual Amount',
                'Reason of Short Payment', 'Status updated by Admin', 'Quotation Expiry Date',
                'IsExpired', 'Payment Updated Month', 'Pulse Instance ID', 'New Price Applicable',
                'QuotationType'
            ],
            'Pulse Quotation - Service Only': [
                'Creation Date', 'Quote ID', 'First level observations', 'Quote Status',
                'SR Type', 'SR Sub Type', 'Instance Id', 'Account', 'Bill To Address',
                'Ship To Address', 'First Name', 'Last Name', 'Account/Contact Phone Number',
                'Installation Site Address', 'Account/Contact Primary Email', 'Service Dealer',
                'Labor Amount', 'Parts Amount', 'Total Amount', 'Prepared By', 'Recommended By',
                'Finance Company Address', 'Account Number', 'Purpose Of Quotation', 'SR#:',
                'Quote Revised Flag', 'Quote Submitted Date', 'Exception Enquiry #', 'Lead #',
                'Quotation Lead Assigned Name', 'Quotation Lead Assigned Job Title',
                'Quotation Lead Assigned Phone Number', 'Quotation Lead Assigned UID'
            ],
            'Regular Bandhan Customers Report': [
                'Name of Agent', 'Quotation Ref No.', 'Password', 'Genset Number', 'Name',
                'Email', 'Mobile', 'PAN Card No.', 'Billing State', 'Billing City',
                'Billing Location', 'Billing Address 1', 'Billing Address 2', 'Billing Pincode',
                'DG State', 'DG City', 'DG Location', 'DG Address 1', 'DG Address 2',
                'DG Pincode', 'Type of Customer', 'Date', 'GSTN No.', 'Payment type',
                'Payment Update Date', 'Contact Person Name', 'Zone', 'Actual Amount',
                'Reason of Short Payment', 'Status updated by Admin'
            ],
            'LMS Data for ERP': [
                'LEAD NUMBER', 'LEAD CREATED DATE', 'MODE OF LEAD CREATION', 'LEAD RAISED BY',
                'LEAD RAISED FOR', 'SD NAME', 'SD ID', 'BRANCH NAME', 'BRANCH ID',
                'PRODUCT LIST', 'PRODUCT TYPE', 'LEAD ASSIGNED TO', 'LEAD STATUS',
                'ACCOUNT ID', 'ACCOUNT NAME', 'ZONE', 'LEAD SR NUMBER', 'INSTANCE ID',
                'ENGINE MODEL', 'KVA RATING', 'SERVICE ENGINEER NAME', 'TELE CALLER NAME',
                'QUOTATION NUMBER', 'QUOTATION SUBMIT DATE', 'QUOTATION APPROVAL DATE',
                'ORDER NUMBER', 'ORDER CREATION DATE'
            ],
            'Open SR Load Report': [
                'Instance Id [Asset #]', 'Service Request #', 'SR Due Date', 'SR Type',
                'Appointment Date', 'Service Dealer', 'Status', 'Problem Code',
                'Close Date/Time', 'VOC', 'Contact Last Name', 'Installation Site Address',
                'Account', 'Engine App Code', 'Engine Serial#', 'Segment', 'Engine Series',
                'Engine Model', 'Ticket#', 'Task Start Date', 'Task End Date',
                'Under Monitoring Date', 'Under Monitoring Remark', 'Convert PM to Wet PM Flag',
                'Convert PM to Wet PM Flag updated Date', 'Convert PM to Wet PM Flag updated by',
                'eFSR Engineer Remarks', 'Quick Ticket SR Comments', 'Actual SR Due Date',
                'SR Sub-Type', 'Customer Name', 'Customer Mobile #', 'Genset Appcode',
                'Primary Phone#', 'Contact Name', 'Mode', 'Special Tool', 'Special Tool Name',
                'Repeat', 'Assigned To', 'Oil Change Flg', 'Claim Created', 'Agreement #',
                'Cancellation Reason', 'CSP Cancellation Reasons', 'CSP Cancellation Remarks',
                'ASM/ASE Remarks', 'ASM/ASE Remarks Date', 'Battery Charger Availability',
                'Wet PM Due Flag', 'Cap Limit Approval Remarks', 'Cap Limit Deviation Remarks',
                'Cap Limit Deviation Status', 'Cap limit User details', 'CSP Prepone Flag',
                'CSP Prepone Flag updated By', 'Bandhan PM SR closure within 15 days flag',
                'Bandhan PM Lock Removal flag updated by', 'Bandhan PM Lock Removal flag updated Date',
                'Bandhan PM SR Closure @90 days max after PM Due Date flag',
                'Bandhan PM Due Date Lock Removal flag updated by',
                'Bandhan PM Due Date Lock Removal flag updated Date',
                'Bandhan Job card creation prior to 60 days flag',
                'Bandhan PM JC creation Lock Removal flag updated by',
                'Bandhan PM JC creation Lock Removal flag updated Date',
                'Account Id', 'SR Created BY', 'eFSR KRM Number',
                'Dry CSP Approved by', 'Dry CSP Approved Date'
            ]
        }
        
        expected = expected_columns.get(file_type, [])
        if not expected:
            return True, "No validation required"
        
        actual_columns = set(str(col).strip() for col in df.columns if pd.notna(col))
        critical_columns = self.get_critical_columns(file_type)
        
        if file_type == 'LMS Data for ERP':
            required = ['Instance ID', 'Lead Number']
            missing = [col for col in required if col not in actual_columns]
            if missing:
                return False, f"Missing required columns for LMS Data: {', '.join(missing)}"
            return True, "Format valid"
        
        missing_critical = [col for col in critical_columns if col not in actual_columns]
        
        if missing_critical:
            return False, f"Missing critical columns: {', '.join(missing_critical)}"
        
        return True, "Format valid"
    
    def get_critical_columns(self, file_type):
        """Get critical columns that must be present for each file type"""
        critical = {
            'AMC Agreement History': ['INSTANCE ID', 'AGREEMENT NUMBER'],
            'Asset Detailed Report': ['ASSET NUMBER', 'ENGINE SERIAL NO'],
            'Asset Details with Last Oil Service': ['ASSET NUMBER', 'ENGINE SERIAL NO'],
            'Anubandhan Plus Quotes Report': ['Pulse Instance ID', 'QuotationRefNo', 'EngineNo'],
            'Anubandhan Quotes Report': ['Pulse Instance ID', 'QuotationRefNo', 'EngineNo'],
            'BandhanPlus Quotes Report': ['Pulse Instance ID', 'QuotationRefNo', 'EngineNo'],
            'Pulse Quotation - Service Only': ['Instance Id', 'Quote ID'],
            'Regular Bandhan Customers Report': ['Genset Number', 'Quotation Ref No.'],
            'LMS Data for ERP': ['INSTANCE ID', 'LEAD NUMBER'],
            'Open SR Load Report': ['Service Request #', 'Instance Id [Asset #]', 'Engine Serial#']
        }
        return critical.get(file_type, [])
    
    def get_existing_record(self, model, instance_id, unique_field=None, unique_value=None):
        """Get existing record from table"""
        try:
            if instance_id:
                return self.db.query(model).filter(
                    model.instance_id == instance_id
                ).first()
            elif unique_field and unique_value:
                return self.db.query(model).filter(
                    getattr(model, unique_field) == unique_value
                ).first()
            return None
        except Exception as e:
            return None
    
    def update_record(self, existing_record, new_data):
        """Update existing record with new data"""
        for key, value in new_data.items():
            if hasattr(existing_record, key):
                setattr(existing_record, key, value)
        return existing_record
    
    def import_amc_agreement(self, file: UploadFile):
        """Import AMC Agreement History Report - Only take first ACTIVE record per instance_id"""
        contents = file.file.read()
        df = pd.read_excel(io.BytesIO(contents))
        
        is_valid, message = self.validate_file_format(df, 'AMC Agreement History')
        if not is_valid:
            raise HTTPException(status_code=400, detail=f"Invalid file format for AMC Agreement History: {message}")
        
        # Group by instance_id and take only the first ACTIVE record for each
        # First, filter for Active agreements
        active_df = df[df['AGREEMENT STATUS'].astype(str).str.upper() == 'ACTIVE']
        
        # Group by instance_id and take first row (keeping original order)
        first_active_df = active_df.groupby('INSTANCE ID').first().reset_index()
        
        # ── FAST: dict iteration + bulk preload ──
        records = first_active_df.to_dict('records')
        instance_ids = [self.extract_instance_id(r, 'AMC Agreement History') for r in records]
        existing_map = self._bulk_load_by_instance_id(AMCAgreement, instance_ids)
        customer_cache = self._bulk_load_by_instance_id(Customer, instance_ids)
        
        imported_count = 0
        updated_count = 0
        
        # Disable autoflush during the loop — we know our cache is consistent
        with self.db.no_autoflush:
            for row in records:
                try:
                    instance_id = self.extract_instance_id(row, 'AMC Agreement History')
                    
                    if not instance_id:
                        continue
                    
                    # Update or create customer
                    self.update_or_create_customer(instance_id, row, 'AMC Agreement History', cache=customer_cache)
                    
                    # Prepare agreement data
                    agreement_data = {
                        'instance_id': instance_id,
                        'zone_name': self.truncate_string(row.get('ZONE NAME')),
                        'sd_id': self.truncate_string(row.get('SD ID'), 100),
                        'sd_name': self.truncate_string(row.get('SD NAME')),
                        'branch_id': self.truncate_string(row.get('BRANCH ID'), 100),
                        'branch_name': self.truncate_string(row.get('BRANCH NAME')),
                        'segment': self.truncate_string(row.get('SEGMENT'), 200),
                        'kva_rating': self.truncate_string(row.get('KVA RATING'), 100),
                        'engine_model': self.truncate_string(row.get('ENGINE MODEL'), 200),
                        'agreement_number': self.truncate_string(row.get('AGREEMENT NUMBER'), 200),
                        'number_of_agreement_years': self.convert_to_numeric(row.get('NUMBER OF AGREEMENT YEARS')),
                        'agreement_name': self.truncate_string(row.get('AGREEMENT NAME')),
                        'agreement_status': self.truncate_string(row.get('AGREEMENT STATUS'), 100),
                        'agreement_type': self.truncate_string(row.get('AGREEMENT TYPE'), 100),
                        'agreement_created_date': self.parse_date(row.get('AGREEMENT CREATED DATE')),
                        'agreement_start_date': self.parse_date(row.get('AGREEMENT START DATE')),
                        'agreement_end_date': self.parse_date(row.get('AGREEMENT END DATE')),
                        'agreement_product_name': self.truncate_string(row.get('AGREEMENT PRODUCT NAME')),
                        'last_agreement_number': self.truncate_string(row.get('LAST AGREEMENT NUMBER'), 200),
                        'last_agreement_no_of_years': self.convert_to_numeric(row.get('LAST AGREEMENT NO OF YEARS')),
                        'last_agreement_type': self.truncate_string(row.get('LAST AGREEMENT TYPE'), 100),
                        'last_agreement_status': self.truncate_string(row.get('LAST AGREEMENT STATUS'), 100),
                        'last_agreement_product_name': self.truncate_string(row.get('LAST AGREEMENT PRODUCT NAME')),
                        'last_agreement_start_date': self.parse_date(row.get('LAST AGREEMENT START DATE')),
                        'last_agreement_end_date': self.parse_date(row.get('LAST AGREEMENT END DATE')),
                    }
                    
                    # O(1) lookup from preloaded map
                    existing = existing_map.get(instance_id)
                    
                    if existing:
                        # Update existing record with new data
                        self.update_record(existing, agreement_data)
                        updated_count += 1
                    else:
                        # Create new record
                        agreement = AMCAgreement(**agreement_data)
                        self.db.add(agreement)
                        existing_map[instance_id] = agreement  # prevent duplicate adds in same file
                        imported_count += 1
                        
                except IntegrityError:
                    self.db.rollback()
                    continue
                except Exception:
                    continue
        
        self.db.commit()
        return imported_count, updated_count
    
    def convert_to_numeric(self, value):
        """Convert value to integer if possible, otherwise return None"""
        if pd.isna(value) or value is None or value == '':
            return None
        
        try:
            str_val = self.convert_to_string(value)
            if str_val and str_val.isdigit():
                return int(str_val)
            return None
        except:
            return None
    
    def import_asset_detailed(self, file: UploadFile):
        """Import Asset Detailed Report - Override existing records"""
        contents = file.file.read()
        df = pd.read_excel(io.BytesIO(contents))
        
        is_valid, message = self.validate_file_format(df, 'Asset Detailed Report')
        if not is_valid:
            raise HTTPException(status_code=400, detail=f"Invalid file format for Asset Detailed Report: {message}")
        
        # ── FAST: dict iteration + bulk preload ──
        records = df.to_dict('records')
        instance_ids = [self.extract_instance_id(r, 'Asset Detailed Report') for r in records]
        existing_map = self._bulk_load_by_instance_id(AssetDetailed, instance_ids)
        customer_cache = self._bulk_load_by_instance_id(Customer, instance_ids)
        
        imported_count = 0
        updated_count = 0
        
        with self.db.no_autoflush:
            for row in records:
                try:
                    instance_id = self.extract_instance_id(row, 'Asset Detailed Report')
                    engine_serial_no = self.extract_engine_serial_no(row, 'Asset Detailed Report')
                    
                    # Update or create customer
                    if instance_id:
                        self.update_or_create_customer(instance_id, row, 'Asset Detailed Report', cache=customer_cache)
                    
                    # Prepare asset data
                    asset_data = {
                        'instance_id': instance_id,
                        'zone_name': self.truncate_string(row.get('ZONE NAME')),
                        'sd_id': self.truncate_string(row.get('SD ID'), 100),
                        'sd_name': self.truncate_string(row.get('SD NAME')),
                        'branch_id': self.truncate_string(row.get('BRANCH ID'), 100),
                        'branch_name': self.truncate_string(row.get('BRANCH NAME')),
                        'district': self.truncate_string(row.get('DISTRICT'), 200),
                        'asset_number': self.truncate_string(row.get('ASSET NUMBER'), 200),
                        'commissioning_date': self.parse_date(row.get('COMMISSIONING DATE')),
                        'installation_date': self.parse_date(row.get('INSTALLATION DATE')),
                        'goem_oem': self.truncate_string(row.get('GOEM OEM'), 200),
                        'application_code': self.truncate_string(row.get('APPLICATION CODE'), 200),
                        'engine_serial_no': engine_serial_no,
                        'engine_model': self.truncate_string(row.get('ENGINE MODEL'), 200),
                        'account_name': self.truncate_string(row.get('ACCOUNT NAME')),
                        'customer_name': self.truncate_string(row.get('CUSTOMER NAME')),
                        'contact_phone_number': self.truncate_string(row.get('CONTACT PHONE NUMBER'), 50),
                        'contact_email_id': self.truncate_string(row.get('CONTACT EMAIL ID')),
                        'warranty_expiry_date': self.parse_date(row.get('WARRANTY EXPIRY DATE')),
                        'installation_site_address': self.convert_to_string(row.get('INSTALLATION SITE ADDRESS')),
                        'product_segment': self.truncate_string(row.get('PRODUCT SEGMENT'), 200),
                        'segment': self.truncate_string(row.get('SEGMENT'), 200),
                        'customer_segment': self.truncate_string(row.get('CUSTOMER SEGMENT'), 200),
                        'asset_operational_status': self.truncate_string(row.get('ASSET OPERATIONAL STATUS'), 200),
                        'krm_number': self.truncate_string(row.get('KRM NUMBER'), 200),
                        'krm_status': self.truncate_string(row.get('KRM STATUS'), 100),
                        'krm_active_date': self.parse_date(row.get('KRM ACTIVE DATE')),
                        'krm_inactive_date': self.parse_date(row.get('KRM INACTIVE DATE')),
                        'krm_subscription_start_date': self.parse_date(row.get('KRM SUBSCRIPTION START DATE')),
                        'krm_subscription_end_date': self.parse_date(row.get('KRM SUBSCRIPTION END DATE')),
                        'kva_rating': self.truncate_string(row.get('KVA RATING'), 100),
                    }
                    
                    # O(1) lookup from preloaded map
                    existing = existing_map.get(instance_id) if instance_id else None
                    
                    if existing:
                        # Update existing record
                        self.update_record(existing, asset_data)
                        updated_count += 1
                    else:
                        # Create new record
                        asset = AssetDetailed(**asset_data)
                        self.db.add(asset)
                        if instance_id:
                            existing_map[instance_id] = asset
                        imported_count += 1
                        
                except IntegrityError:
                    self.db.rollback()
                    continue
                except Exception:
                    continue
        
        self.db.commit()
        return imported_count, updated_count
    
    def import_asset_service(self, file: UploadFile):
        """Import Asset Details with Last Oil Service - Override existing records"""
        contents = file.file.read()
        df = pd.read_excel(io.BytesIO(contents))
        
        is_valid, message = self.validate_file_format(df, 'Asset Details with Last Oil Service')
        if not is_valid:
            raise HTTPException(status_code=400, detail=f"Invalid file format for Asset Details with Last Oil Service: {message}")
        
        # ── FAST: dict iteration + bulk preload ──
        records = df.to_dict('records')
        instance_ids = [self.extract_instance_id(r, 'Asset Details with Last Oil Service') for r in records]
        existing_map = self._bulk_load_by_instance_id(AssetService, instance_ids)
        customer_cache = self._bulk_load_by_instance_id(Customer, instance_ids)
        
        imported_count = 0
        updated_count = 0
        
        with self.db.no_autoflush:
            for row in records:
                try:
                    instance_id = self.extract_instance_id(row, 'Asset Details with Last Oil Service')
                    engine_serial_no = self.extract_engine_serial_no(row, 'Asset Details with Last Oil Service')
                    
                    # Update or create customer
                    if instance_id:
                        self.update_or_create_customer(instance_id, row, 'Asset Details with Last Oil Service', cache=customer_cache)
                    
                    # Prepare service data
                    service_data = {
                        'instance_id': instance_id,
                        'zone_name': self.truncate_string(row.get('ZONE NAME')),
                        'sd_id': self.truncate_string(row.get('SD ID'), 100),
                        'sd_name': self.truncate_string(row.get('SD NAME')),
                        'branch_id': self.truncate_string(row.get('BRANCH ID'), 100),
                        'branch_name': self.truncate_string(row.get('BRANCH NAME')),
                        'asset_number': self.truncate_string(row.get('ASSET NUMBER'), 200),
                        'commissioning_date': self.parse_date(row.get('COMMISSIONING DATE')),
                        'product_segment': self.truncate_string(row.get('PRODUCT SEGMENT'), 200),
                        'application_code': self.truncate_string(row.get('APPLICATION CODE'), 200),
                        'engine_serial_no': engine_serial_no,
                        'account_name': self.truncate_string(row.get('ACCOUNT NAME')),
                        'contact_phone_number': self.truncate_string(row.get('CONTACT PHONE NUMBER'), 50),
                        'last_closed_sr_number': self.truncate_string(row.get('LAST CLOSED SR NUMBER'), 200),
                        'last_sr_type': self.truncate_string(row.get('LAST SR TYPE'), 200),
                        'last_sr_subtype': self.truncate_string(row.get('LAST SR SUBTYPE'), 200),
                        'last_sr_close_date': self.parse_date(row.get('LAST SR CLOSE DATE')),
                        'last_oil_change_sr_number': self.truncate_string(row.get('LAST OIL CHANGE SR NUMBER'), 200),
                        'last_oil_change_sr_type': self.truncate_string(row.get('LAST OIL CHANGE SR TYPE'), 200),
                        'last_oil_change_sr_sub_type': self.truncate_string(row.get('LAST OIL CHANGE SR SUB TYPE'), 200),
                        'last_oil_change_date': self.parse_date(row.get('LAST OIL CHANGE DATE')),
                        'installation_site_address': self.convert_to_string(row.get('INSTALLATION SITE ADDRESS')),
                        'last_service_hrs': self.truncate_string(row.get('LAST SERVICE HRS'), 100),
                    }
                    
                    # O(1) lookup from preloaded map
                    existing = existing_map.get(instance_id) if instance_id else None
                    
                    if existing:
                        # Update existing record
                        self.update_record(existing, service_data)
                        updated_count += 1
                    else:
                        # Create new record
                        asset_service = AssetService(**service_data)
                        self.db.add(asset_service)
                        if instance_id:
                            existing_map[instance_id] = asset_service
                        imported_count += 1
                        
                except IntegrityError:
                    self.db.rollback()
                    continue
                except Exception:
                    continue
        
        self.db.commit()
        return imported_count, updated_count
    
    def import_anubandhan_plus_quotes(self, file: UploadFile):
        """Import Anubandhan Plus Quotes Report - Only take first record per instance_id"""
        contents = file.file.read()
        df = pd.read_excel(io.BytesIO(contents))
        
        is_valid, message = self.validate_file_format(df, 'Anubandhan Plus Quotes Report')
        if not is_valid:
            raise HTTPException(status_code=400, detail=f"Invalid file format for Anubandhan Plus Quotes Report: {message}")
        
        # Group by Pulse Instance ID and take first record for each
        first_records_df = df.groupby('Pulse Instance ID').first().reset_index()
        
        # ── FAST: dict iteration + bulk preload ──
        records = first_records_df.to_dict('records')
        instance_ids = [self.extract_instance_id(r, 'Anubandhan Plus Quotes Report') for r in records]
        existing_map = self._bulk_load_by_instance_id(AnubandhanPlusQuote, instance_ids)
        customer_cache = self._bulk_load_by_instance_id(Customer, instance_ids)
        
        imported_count = 0
        updated_count = 0
        
        with self.db.no_autoflush:
            for row in records:
                try:
                    instance_id = self.extract_instance_id(row, 'Anubandhan Plus Quotes Report')
                    engine_no = self.extract_engine_serial_no(row, 'Anubandhan Plus Quotes Report')
                    
                    if not instance_id:
                        continue
                    
                    # Get branch_id from preloaded customer cache (O(1))
                    cust = customer_cache.get(instance_id)
                    branch_id = cust.branch_id if (cust and cust.branch_id) else None
                    
                    # Update or create customer
                    self.update_or_create_customer(instance_id, row, 'Anubandhan Plus Quotes Report', cache=customer_cache)
                    
                    # Prepare quote data
                    quote_data = {
                        'instance_id': instance_id,
                        'branch_id': branch_id,
                        'id_col': self.truncate_string(row.get('Id'), 100),
                        'quotation_ref_no': self.convert_to_string(row.get('QuotationRefNo')),
                        'company_name': self.truncate_string(row.get('CompanyName')),
                        'engine_no': engine_no,
                        'contact_person_name': self.truncate_string(row.get('ContactPersonName')),
                        'mobile_no': self.truncate_string(row.get('MobileNo'), 50),
                        'email_id': self.truncate_string(row.get('EmailId')),
                        'genset_kva': self.truncate_string(row.get('GensetKVA'), 100),
                        'zone': self.truncate_string(row.get('Zone'), 200),
                        'state': self.truncate_string(row.get('State'), 200),
                        'city': self.truncate_string(row.get('City'), 200),
                        'location': self.truncate_string(row.get('Location')),
                        'no_of_years': self.convert_to_numeric(row.get('NoOfYears')),
                        'genset_running_per_year': self.truncate_string(row.get('GensetRunningPerYear'), 100),
                        'created_date_time': self.parse_date(row.get('CreatedDateTime')),
                        'status': self.truncate_string(row.get('Status'), 100),
                        'payment_type': self.truncate_string(row.get('PaymentType'), 100),
                        'transaction_id': self.truncate_string(row.get('TransactionId'), 200),
                        'bank_name': self.truncate_string(row.get('BankName')),
                        'account_no': self.truncate_string(row.get('AccountNo'), 200),
                        'date_of_payment': self.parse_date(row.get('DateOfPayment')),
                        'payment_update_date_time': self.parse_date(row.get('PaymentUpdateDateTime')),
                        'is_neft_confirm': self.convert_to_boolean(row.get('IsNEFTConfirm')),
                        'is_cheque_confirm': self.convert_to_boolean(row.get('IsChequeConfirm')),
                        'cheque_deposited_address': self.convert_to_string(row.get('Cheque deposited-Address of YES Bank Branch')),
                        'cheque_given_dealership': self.truncate_string(row.get('cheque given-Name of KOEL Dealership')),
                        'cheque_deposited': self.truncate_string(row.get('Cheque Deposited'), 200),
                        'cheque_to_dealer': self.truncate_string(row.get('Cheque To Dealer'), 200),
                        'employee_name': self.truncate_string(row.get('Employee Name')),
                        'pulse_id': self.truncate_string(row.get('Pulse Id'), 200),
                        'is_invoice_sent': self.convert_to_boolean(row.get('IsInvoiceSent')),
                        'is_refund': self.convert_to_boolean(row.get('IsRefund')),
                        'agent_id': self.truncate_string(row.get('AgentId'), 200),
                        'quote_price': self.convert_to_float(row.get('QuotePrice')),
                        'quotation_value_including_tax': self.convert_to_float(row.get('Quotation Value Including tax')),
                        'name_of_agent': self.truncate_string(row.get('Name of Agent')),
                        'actual_amount': self.convert_to_float(row.get('Actual Amount')),
                        'reason_of_short_payment': self.convert_to_string(row.get('Reason of Short Payment')),
                        'status_updated_by_admin': self.convert_to_string(row.get('Status updated by Admin')),
                        'quotation_expiry_date': self.parse_date(row.get('Quotation Expiry Date')),
                        'is_expired': self.convert_to_boolean(row.get('IsExpired')),
                        'payment_updated_month': self.truncate_string(row.get('Payment Updated Month'), 50),
                        'pulse_instance_id': self.truncate_string(row.get('Pulse Instance ID'), 200),
                        'new_price_applicable': self.convert_to_boolean(row.get('New Price Applicable')),
                        'quotation_type': 'Anubandhan Plus',
                    }
                    
                    # O(1) lookup from preloaded map
                    existing = existing_map.get(instance_id)
                    
                    if existing:
                        # Update existing record with new data
                        self.update_record(existing, quote_data)
                        updated_count += 1
                    else:
                        # Create new record
                        quote = AnubandhanPlusQuote(**quote_data)
                        self.db.add(quote)
                        existing_map[instance_id] = quote
                        imported_count += 1
                        
                except IntegrityError:
                    self.db.rollback()
                    continue
                except Exception:
                    continue
        
        self.db.commit()
        return imported_count, updated_count
    
    def convert_to_boolean(self, value):
        """Convert value to boolean"""
        if pd.isna(value) or value is None:
            return False
        
        str_val = self.convert_to_string(value)
        if str_val:
            return str_val.lower() in ['true', 'yes', '1', 'y']
        return False
    
    def convert_to_float(self, value):
        """Convert value to float"""
        if pd.isna(value) or value is None:
            return None
        
        try:
            return float(value)
        except:
            return None
    
    def import_anubandhan_quotes(self, file: UploadFile):
        """Import Anubandhan Quotes Report - Only take first record per instance_id"""
        contents = file.file.read()
        df = pd.read_excel(io.BytesIO(contents))
        
        is_valid, message = self.validate_file_format(df, 'Anubandhan Quotes Report')
        if not is_valid:
            raise HTTPException(status_code=400, detail=f"Invalid file format for Anubandhan Quotes Report: {message}")
        
        # Group by Pulse Instance ID and take first record for each
        first_records_df = df.groupby('Pulse Instance ID').first().reset_index()
        
        # ── FAST: dict iteration + bulk preload ──
        records = first_records_df.to_dict('records')
        instance_ids = [self.extract_instance_id(r, 'Anubandhan Quotes Report') for r in records]
        existing_map = self._bulk_load_by_instance_id(AnubandhanQuote, instance_ids)
        customer_cache = self._bulk_load_by_instance_id(Customer, instance_ids)
        
        imported_count = 0
        updated_count = 0
        
        with self.db.no_autoflush:
            for row in records:
                try:
                    instance_id = self.extract_instance_id(row, 'Anubandhan Quotes Report')
                    engine_no = self.extract_engine_serial_no(row, 'Anubandhan Quotes Report')
                    
                    if not instance_id:
                        continue
                    
                    # Get branch_id from preloaded customer cache (O(1))
                    cust = customer_cache.get(instance_id)
                    branch_id = cust.branch_id if (cust and cust.branch_id) else None
                    
                    # Update or create customer
                    self.update_or_create_customer(instance_id, row, 'Anubandhan Quotes Report', cache=customer_cache)
                    
                    # Prepare quote data
                    quote_data = {
                        'instance_id': instance_id,
                        'branch_id': branch_id,
                        'id_col': self.truncate_string(row.get('Id'), 100),
                        'quotation_ref_no': self.convert_to_string(row.get('QuotationRefNo')),
                        'company_name': self.truncate_string(row.get('CompanyName')),
                        'engine_no': engine_no,
                        'contact_person_name': self.truncate_string(row.get('ContactPersonName')),
                        'mobile_no': self.truncate_string(row.get('MobileNo'), 50),
                        'email_id': self.truncate_string(row.get('EmailId')),
                        'genset_kva': self.truncate_string(row.get('GensetKVA'), 100),
                        'zone': self.truncate_string(row.get('Zone'), 200),
                        'state': self.truncate_string(row.get('State'), 200),
                        'city': self.truncate_string(row.get('City'), 200),
                        'location': self.truncate_string(row.get('Location')),
                        'no_of_years': self.convert_to_numeric(row.get('NoOfYears')),
                        'genset_running_per_year': self.truncate_string(row.get('GensetRunningPerYear'), 100),
                        'created_date_time': self.parse_date(row.get('CreatedDateTime')),
                        'status': self.truncate_string(row.get('Status'), 100),
                        'payment_type': self.truncate_string(row.get('PaymentType'), 100),
                        'transaction_id': self.truncate_string(row.get('TransactionId'), 200),
                        'bank_name': self.truncate_string(row.get('BankName')),
                        'account_no': self.truncate_string(row.get('AccountNo'), 200),
                        'date_of_payment': self.parse_date(row.get('DateOfPayment')),
                        'payment_update_date_time': self.parse_date(row.get('PaymentUpdateDateTime')),
                        'is_neft_confirm': self.convert_to_boolean(row.get('IsNEFTConfirm')),
                        'is_cheque_confirm': self.convert_to_boolean(row.get('IsChequeConfirm')),
                        'cheque_deposited_address': self.convert_to_string(row.get('Cheque deposited-Address of YES Bank Branch')),
                        'cheque_given_dealership': self.truncate_string(row.get('cheque given-Name of KOEL Dealership')),
                        'cheque_deposited': self.truncate_string(row.get('Cheque Deposited'), 200),
                        'cheque_to_dealer': self.truncate_string(row.get('Cheque To Dealer'), 200),
                        'employee_name': self.truncate_string(row.get('Employee Name')),
                        'pulse_id': self.truncate_string(row.get('Pulse Id'), 200),
                        'is_invoice_sent': self.convert_to_boolean(row.get('IsInvoiceSent')),
                        'is_refund': self.convert_to_boolean(row.get('IsRefund')),
                        'agent_id': self.truncate_string(row.get('AgentId'), 200),
                        'quote_price': self.convert_to_float(row.get('QuotePrice')),
                        'quotation_value_including_tax': self.convert_to_float(row.get('Quotation Value Including tax')),
                        'name_of_agent': self.truncate_string(row.get('Name of Agent')),
                        'actual_amount': self.convert_to_float(row.get('Actual Amount')),
                        'reason_of_short_payment': self.convert_to_string(row.get('Reason of Short Payment')),
                        'status_updated_by_admin': self.convert_to_string(row.get('Status updated by Admin')),
                        'quotation_expiry_date': self.parse_date(row.get('Quotation Expiry Date')),
                        'is_expired': self.convert_to_boolean(row.get('IsExpired')),
                        'payment_updated_month': self.truncate_string(row.get('Payment Updated Month'), 50),
                        'pulse_instance_id': self.truncate_string(row.get('Pulse Instance ID'), 200),
                        'new_price_applicable': self.convert_to_boolean(row.get('New Price Applicable')),
                        'quotation_type': 'Anubandhan',
                    }
                    
                    # O(1) lookup from preloaded map
                    existing = existing_map.get(instance_id)
                    
                    if existing:
                        # Update existing record with new data
                        self.update_record(existing, quote_data)
                        updated_count += 1
                    else:
                        # Create new record
                        quote = AnubandhanQuote(**quote_data)
                        self.db.add(quote)
                        existing_map[instance_id] = quote
                        imported_count += 1
                        
                except IntegrityError:
                    self.db.rollback()
                    continue
                except Exception:
                    continue
        
        self.db.commit()
        return imported_count, updated_count
    
    def import_bandhan_plus_quotes(self, file: UploadFile):
        """Import BandhanPlus Quotes Report - Only take first record per instance_id"""
        contents = file.file.read()
        df = pd.read_excel(io.BytesIO(contents))
        
        is_valid, message = self.validate_file_format(df, 'BandhanPlus Quotes Report')
        if not is_valid:
            raise HTTPException(status_code=400, detail=f"Invalid file format for BandhanPlus Quotes Report: {message}")
        
        # Group by Pulse Instance ID and take first record for each
        first_records_df = df.groupby('Pulse Instance ID').first().reset_index()
        
        # ── FAST: dict iteration + bulk preload ──
        records = first_records_df.to_dict('records')
        instance_ids = [self.extract_instance_id(r, 'BandhanPlus Quotes Report') for r in records]
        existing_map = self._bulk_load_by_instance_id(BandhanPlusQuote, instance_ids)
        customer_cache = self._bulk_load_by_instance_id(Customer, instance_ids)
        
        imported_count = 0
        updated_count = 0
        
        with self.db.no_autoflush:
            for row in records:
                try:
                    instance_id = self.extract_instance_id(row, 'BandhanPlus Quotes Report')
                    engine_no = self.extract_engine_serial_no(row, 'BandhanPlus Quotes Report')
                    
                    if not instance_id:
                        continue
                    
                    # Get branch_id from preloaded customer cache (O(1))
                    cust = customer_cache.get(instance_id)
                    branch_id = cust.branch_id if (cust and cust.branch_id) else None
                    
                    # Update or create customer
                    self.update_or_create_customer(instance_id, row, 'BandhanPlus Quotes Report', cache=customer_cache)
                    
                    # Prepare quote data
                    quote_data = {
                        'instance_id': instance_id,
                        'branch_id': branch_id,
                        'id_col': self.truncate_string(row.get('Id'), 100),
                        'quotation_ref_no': self.convert_to_string(row.get('QuotationRefNo')),
                        'company_name': self.truncate_string(row.get('CompanyName')),
                        'engine_no': engine_no,
                        'contact_person_name': self.truncate_string(row.get('ContactPersonName')),
                        'mobile_no': self.truncate_string(row.get('MobileNo'), 50),
                        'email_id': self.truncate_string(row.get('EmailId')),
                        'genset_kva': self.truncate_string(row.get('GensetKVA'), 100),
                        'zone': self.truncate_string(row.get('Zone'), 200),
                        'state': self.truncate_string(row.get('State'), 200),
                        'city': self.truncate_string(row.get('City'), 200),
                        'location': self.truncate_string(row.get('Location')),
                        'no_of_years': self.convert_to_numeric(row.get('NoOfYears')),
                        'genset_running_per_year': self.truncate_string(row.get('GensetRunningPerYear'), 100),
                        'created_date_time': self.parse_date(row.get('CreatedDateTime')),
                        'status': self.truncate_string(row.get('Status'), 100),
                        'payment_type': self.truncate_string(row.get('PaymentType'), 100),
                        'transaction_id': self.truncate_string(row.get('TransactionId'), 200),
                        'bank_name': self.truncate_string(row.get('BankName')),
                        'account_no': self.truncate_string(row.get('AccountNo'), 200),
                        'date_of_payment': self.parse_date(row.get('DateOfPayment')),
                        'payment_update_date_time': self.parse_date(row.get('PaymentUpdateDateTime')),
                        'is_neft_confirm': self.convert_to_boolean(row.get('IsNEFTConfirm')),
                        'is_cheque_confirm': self.convert_to_boolean(row.get('IsChequeConfirm')),
                        'cheque_deposited_address': self.convert_to_string(row.get('Cheque deposited-Address of YES Bank Branch')),
                        'cheque_given_dealership': self.truncate_string(row.get('cheque given-Name of KOEL Dealership')),
                        'cheque_deposited': self.truncate_string(row.get('Cheque Deposited'), 200),
                        'cheque_to_dealer': self.truncate_string(row.get('Cheque To Dealer'), 200),
                        'employee_name': self.truncate_string(row.get('Employee Name')),
                        'pulse_id': self.truncate_string(row.get('Pulse Id'), 200),
                        'is_invoice_sent': self.convert_to_boolean(row.get('IsInvoiceSent')),
                        'is_refund': self.convert_to_boolean(row.get('IsRefund')),
                        'agent_id': self.truncate_string(row.get('AgentId'), 200),
                        'quote_price': self.convert_to_float(row.get('QuotePrice')),
                        'quotation_value_including_tax': self.convert_to_float(row.get('Quotation Value Including tax')),
                        'name_of_agent': self.truncate_string(row.get('Name of Agent')),
                        'actual_amount': self.convert_to_float(row.get('Actual Amount')),
                        'reason_of_short_payment': self.convert_to_string(row.get('Reason of Short Payment')),
                        'status_updated_by_admin': self.convert_to_string(row.get('Status updated by Admin')),
                        'quotation_expiry_date': self.parse_date(row.get('Quotation Expiry Date')),
                        'is_expired': self.convert_to_boolean(row.get('IsExpired')),
                        'payment_updated_month': self.truncate_string(row.get('Payment Updated Month'), 50),
                        'pulse_instance_id': self.truncate_string(row.get('Pulse Instance ID'), 200),
                        'new_price_applicable': self.convert_to_boolean(row.get('New Price Applicable')),
                        'quotation_type': 'BandhanPlus',
                    }
                    
                    # O(1) lookup from preloaded map
                    existing = existing_map.get(instance_id)
                    
                    if existing:
                        # Update existing record with new data
                        self.update_record(existing, quote_data)
                        updated_count += 1
                    else:
                        # Create new record
                        quote = BandhanPlusQuote(**quote_data)
                        self.db.add(quote)
                        existing_map[instance_id] = quote
                        imported_count += 1
                        
                except IntegrityError:
                    self.db.rollback()
                    continue
                except Exception:
                    continue
        
        self.db.commit()
        return imported_count, updated_count
    
    def import_pulse_quotation(self, file: UploadFile):
        """Import Pulse Quotation - Service Only - Only take first record per instance_id"""
        contents = file.file.read()
        df = pd.read_excel(io.BytesIO(contents))
        
        is_valid, message = self.validate_file_format(df, 'Pulse Quotation - Service Only')
        if not is_valid:
            raise HTTPException(status_code=400, detail=f"Invalid file format for Pulse Quotation - Service Only: {message}")
        
        # Group by Instance Id and take first record for each
        first_records_df = df.groupby('Instance Id').first().reset_index()
        
        # ── FAST: dict iteration + bulk preload ──
        records = first_records_df.to_dict('records')
        instance_ids = [self.extract_instance_id(r, 'Pulse Quotation - Service Only') for r in records]
        existing_map = self._bulk_load_by_instance_id(PulseQuotation, instance_ids)
        customer_cache = self._bulk_load_by_instance_id(Customer, instance_ids)
        
        imported_count = 0
        updated_count = 0
        
        with self.db.no_autoflush:
            for row in records:
                try:
                    instance_id = self.extract_instance_id(row, 'Pulse Quotation - Service Only')
                    
                    if not instance_id:
                        continue
                    
                    # Get branch_id from preloaded customer cache (O(1))
                    cust = customer_cache.get(instance_id)
                    branch_id = cust.branch_id if (cust and cust.branch_id) else None
                    
                    # Update or create customer
                    self.update_or_create_customer(instance_id, row, 'Pulse Quotation - Service Only', cache=customer_cache)
                    
                    # Prepare quote data
                    quote_data = {
                        'instance_id': instance_id,
                        'branch_id': branch_id,
                        'creation_date': self.parse_date(row.get('Creation Date')),
                        'quote_id': self.convert_to_string(row.get('Quote ID')),
                        'first_level_observations': self.convert_to_string(row.get('First level observations')),
                        'quote_status': self.truncate_string(row.get('Quote Status'), 100),
                        'sr_type': self.truncate_string(row.get('SR Type'), 200),
                        'sr_sub_type': self.truncate_string(row.get('SR Sub Type'), 200),
                        'instance_id_col': self.truncate_string(row.get('Instance Id'), 200),
                        'account': self.truncate_string(row.get('Account')),
                        'bill_to_address': self.convert_to_string(row.get('Bill To Address')),
                        'ship_to_address': self.convert_to_string(row.get('Ship To Address')),
                        'first_name': self.truncate_string(row.get('First Name'), 200),
                        'last_name': self.truncate_string(row.get('Last Name'), 200),
                        'contact_phone_number': self.truncate_string(row.get('Account/Contact Phone Number'), 50),
                        'installation_site_address': self.convert_to_string(row.get('Installation Site Address')),
                        'contact_primary_email': self.truncate_string(row.get('Account/Contact Primary Email')),
                        'service_dealer': self.truncate_string(row.get('Service Dealer')),
                        'labor_amount': self.convert_to_float(row.get('Labor Amount')),
                        'parts_amount': self.convert_to_float(row.get('Parts Amount')),
                        'total_amount': self.convert_to_float(row.get('Total Amount')),
                        'prepared_by': self.truncate_string(row.get('Prepared By')),
                        'recommended_by': self.truncate_string(row.get('Recommended By')),
                        'finance_company_address': self.convert_to_string(row.get('Finance Company Address')),
                        'account_number': self.truncate_string(row.get('Account Number'), 200),
                        'purpose_of_quotation': self.convert_to_string(row.get('Purpose Of Quotation')),
                        'sr_number': self.truncate_string(row.get('SR#:'), 200),
                        'quote_revised_flag': self.convert_to_boolean(row.get('Quote Revised Flag')),
                        'quote_submitted_date': self.parse_date(row.get('Quote Submitted Date')),
                        'exception_enquiry_no': self.truncate_string(row.get('Exception Enquiry #'), 200),
                        'lead_no': self.truncate_string(row.get('Lead #'), 200),
                        'quotation_lead_assigned_name': self.truncate_string(row.get('Quotation Lead Assigned Name')),
                        'quotation_lead_assigned_job_title': self.truncate_string(row.get('Quotation Lead Assigned Job Title')),
                        'quotation_lead_assigned_phone': self.truncate_string(row.get('Quotation Lead Assigned Phone Number'), 50),
                        'quotation_lead_assigned_uid': self.truncate_string(row.get('Quotation Lead Assigned UID'), 200),
                    }
                    
                    # O(1) lookup from preloaded map
                    existing = existing_map.get(instance_id)
                    
                    if existing:
                        # Update existing record with new data
                        self.update_record(existing, quote_data)
                        updated_count += 1
                    else:
                        # Create new record
                        quote = PulseQuotation(**quote_data)
                        self.db.add(quote)
                        existing_map[instance_id] = quote
                        imported_count += 1
                        
                except IntegrityError:
                    self.db.rollback()
                    continue
                except Exception:
                    continue
        
        self.db.commit()
        return imported_count, updated_count
    
    def import_lms_data(self, file: UploadFile):
        """Import LMS Data for ERP - Allow multiple records per instance_id (upsert by Lead Number)"""
        contents = file.file.read()
        df = pd.read_excel(io.BytesIO(contents))

        is_valid, message = self.validate_file_format(df, 'LMS Data for ERP')
        if not is_valid:
            raise HTTPException(status_code=400, detail=f"Invalid file format for LMS Data for ERP: {message}")

        # Keep ALL rows — multiple leads can share the same instance_id
        records = df.to_dict('records')

        # Preload customers by instance_id (for customer upsert + branch lookup)
        instance_ids = [self.extract_instance_id(r, 'LMS Data for ERP') for r in records]
        customer_cache = self._bulk_load_by_instance_id(Customer, instance_ids)

        # Preload existing LMS rows keyed by lead_number (the real unique key of a lead)
        all_leads = list({self.convert_to_string(r.get('Lead Number')) for r in records if r.get('Lead Number') is not None})
        all_leads = [l for l in all_leads if l]
        existing_by_lead = {}
        for i in range(0, len(all_leads), 1000):
            chunk = all_leads[i:i + 1000]
            for lms in self.db.query(LMSData).filter(LMSData.lead_number.in_(chunk)).all():
                if lms.lead_number and lms.lead_number not in existing_by_lead:
                    existing_by_lead[lms.lead_number] = lms

        imported_count = 0
        updated_count = 0

        with self.db.no_autoflush:
            for row in records:
                try:
                    instance_id = self.extract_instance_id(row, 'LMS Data for ERP')
                    lead_number = self.convert_to_string(row.get('Lead Number'))

                    if not instance_id:
                        continue

                    # Update or create customer
                    self.update_or_create_customer(instance_id, row, 'LMS Data for ERP', cache=customer_cache)

                    # Prepare LMS data (new file format mapped onto model fields)
                    lms_data = {
                        'instance_id': instance_id,
                        'lead_number': lead_number,
                        'lead_created_date': self.parse_date(row.get('Lead Created Date')),
                        'lead_raised_by': self.truncate_string(row.get('Lead Raised By')),
                        'lead_status': self.truncate_string(row.get('Lead Status'), 200),
                        'lead_raised_for': self.truncate_string(row.get('Lead Raised For')),
                        'lead_assigned_to': self.truncate_string(row.get('Lead Assigned To')),
                        'sd_id': self.truncate_string(row.get('SD Code'), 100),
                        'sd_name': self.truncate_string(row.get('SD Name')),
                        'branch_name': self.truncate_string(row.get('SD Branch Name')),
                        'branch_id': self.truncate_string(row.get('SD Branch Code'), 100),
                        'lead_sr_number': self.truncate_string(row.get('Service Request Number'), 200),
                        'sr_type': self.truncate_string(row.get('SR Type'), 200),
                        'sr_sub_type': self.truncate_string(row.get('SR Sub Type'), 200),
                        'sr_sub_type_2': self.truncate_string(row.get('SR Sub Type.1'), 200),
                        'account_id': self.truncate_string(row.get('Account ID'), 200),
                        'account_name': self.truncate_string(row.get('Account Name')),
                        'account_contact_number': self.truncate_string(row.get('Account Contact Number'), 50),
                        'account_contact_email_id': self.truncate_string(row.get('Account Contact Email ID'), 500),
                        'tele_caller_name': self.truncate_string(row.get('Tele-Caller Name')),
                        'tele_caller_uid': self.truncate_string(row.get('Tele-Caller UID'), 100),
                        'tele_caller_mobile_number': self.truncate_string(row.get('Tele Caller Mobile Number'), 50),
                        'enquiry_allocation_remarks': self.convert_to_string(row.get('Enquiry Allocation Remarks')),
                        'instance_id_col': self.truncate_string(row.get('Instance ID'), 200),
                        'engine_app_code': self.truncate_string(row.get('Engine App Code'), 200),
                        'engine_serial_no': self.truncate_string(row.get('Engine Serial No'), 200),
                        'engine_model': self.truncate_string(row.get('Engine Model'), 200),
                        'pin_code': self.truncate_string(row.get('Pin Code'), 20),
                        'segment': self.truncate_string(row.get('Segment'), 200),
                        'kva_rating': self.truncate_string(row.get('kVA Rating'), 100),
                        'commissioning_date': self.parse_date(row.get('Commissioning Date')),
                        'installation_site_address': self.convert_to_string(row.get('Installation Site Address')),
                        'city': self.truncate_string(row.get('City'), 200),
                        'district': self.truncate_string(row.get('District'), 200),
                        'state': self.truncate_string(row.get('State'), 200),
                        'asset_contact_name': self.truncate_string(row.get('Asset Contact Name')),
                        'asset_contact_phone_number': self.truncate_string(row.get('Asset Contact Phone Number'), 50),
                        'efsr_contact_name': self.truncate_string(row.get('eFSR Contact Name')),
                        'efsr_customer_number': self.truncate_string(row.get('eFSR Customer Number'), 100),
                        'qualifying_date': self.parse_date(row.get('Qualifying Date')),
                        'quotation_type': self.truncate_string(row.get('Quotation Type'), 200),
                        'quotation_number': self.truncate_string(row.get('Quotation Number'), 200),
                        'quotation_approval_date': self.parse_date(row.get('Quotation Approved Date')),
                        'mode_of_lead_creation': self.truncate_string(row.get('Mode Of Lead Creation'), 200),
                        'quotation_submit_date': self.parse_date(row.get('Quotation Submit Date')),
                        'quotation_labour_amt': self.convert_to_float(row.get('Quotation Labour Amt')),
                        'quotation_part_amt': self.convert_to_float(row.get('Quotation Part Amt')),
                        'total_quote_amount': self.convert_to_float(row.get('Total Quote Amount')),
                        'quotation_lead_assigned_name': self.truncate_string(row.get('Quotation Lead Assigned Name')),
                        'quotation_lead_assigned_uid': self.truncate_string(row.get('Quotation Lead Assigned UID'), 100),
                        'quotation_lead_assigned_job_title': self.truncate_string(row.get('Quotation Lead Assigned Job Title')),
                        'enquiry_loss_reason': self.convert_to_string(row.get('Enquiry Loss Reason')),
                        'service_engineer_name': self.truncate_string(row.get('Service Engineer Name')),
                        'service_engineer_uid': self.truncate_string(row.get('Service Engineer UID'), 100),
                        'service_engineer_mobile_number': self.truncate_string(row.get('Service Engineer Mobile Number'), 50),
                        'order_number': self.truncate_string(row.get('Order Number'), 200),
                        'sic_code': self.truncate_string(row.get('SIC Code'), 200),
                        'sic_code_type': self.truncate_string(row.get('SIC Code Type'), 200),
                        'labour_invoice_number': self.truncate_string(row.get('Labour Invoice Number'), 200),
                        'part_invoice_amount': self.convert_to_float(row.get('Part Invoice Amount')),
                        'part_invoice_number': self.truncate_string(row.get('Part Invoice Number'), 200),
                        'lead_source': self.truncate_string(row.get('Lead Source'), 200),
                        'next_action_required': self.truncate_string(row.get('Next Action Required')),
                        'new_contact': self.truncate_string(row.get('New Contact')),
                        'lead_contact_number': self.truncate_string(row.get('Lead Contact Number'), 50),
                        'next_action_date': self.parse_date(row.get('Next Action Date')),
                        'lead_assign_to_sd': self.truncate_string(row.get('Lead Assign To SD')),
                    }

                    # Upsert by lead_number so multiple leads per instance_id are ALL kept
                    existing = existing_by_lead.get(lead_number) if lead_number else None

                    if existing:
                        # Update existing record with new data
                        self.update_record(existing, lms_data)
                        updated_count += 1
                    else:
                        # Create new record (duplicate instance_id is fine)
                        lms = LMSData(**lms_data)
                        self.db.add(lms)
                        if lead_number:
                            existing_by_lead[lead_number] = lms
                        imported_count += 1

                except IntegrityError:
                    self.db.rollback()
                    continue
                except Exception:
                    continue

        self.db.commit()
        return imported_count, updated_count
    
    def import_regular_bandhan(self, file: UploadFile):
        """Import Regular Bandhan Customers Report - Override existing records"""
        contents = file.file.read()
        df = pd.read_excel(io.BytesIO(contents))
        
        is_valid, message = self.validate_file_format(df, 'Regular Bandhan Customers Report')
        if not is_valid:
            raise HTTPException(status_code=400, detail=f"Invalid file format for Regular Bandhan Customers Report: {message}")
        
        # ── FAST: dict iteration + bulk preload ──
        records = df.to_dict('records')
        
        # Pre-build engine_serial -> instance_id map ONCE (instead of 6 queries per row)
        all_serials = [self.extract_engine_serial_no(r, 'Regular Bandhan Customers Report') for r in records]
        engine_to_iid = self._build_engine_to_instance_map(all_serials)
        
        all_iids = list(engine_to_iid.values())
        customer_cache = self._bulk_load_by_instance_id(Customer, all_iids)
        
        # Pre-load existing RegularBandhan rows by quotation_ref_no in ONE query batch
        all_quote_refs = [self.convert_to_string(r.get('Quotation Ref No.')) for r in records]
        all_quote_refs = list({q for q in all_quote_refs if q})
        existing_by_quote = {}
        for i in range(0, len(all_quote_refs), 1000):
            chunk = all_quote_refs[i:i + 1000]
            for rb in self.db.query(RegularBandhan).filter(RegularBandhan.quotation_ref_no.in_(chunk)).all():
                if rb.quotation_ref_no and rb.quotation_ref_no not in existing_by_quote:
                    existing_by_quote[rb.quotation_ref_no] = rb
        
        imported_count = 0
        updated_count = 0
        
        with self.db.no_autoflush:
            for row in records:
                try:
                    engine_serial_no = self.extract_engine_serial_no(row, 'Regular Bandhan Customers Report')
                    quotation_ref_no = self.convert_to_string(row.get('Quotation Ref No.'))
                    
                    if not engine_serial_no:
                        continue
                    
                    # O(1) lookup instead of 6 queries per row
                    instance_id = engine_to_iid.get(engine_serial_no)
                    
                    # Get branch_id from preloaded customer cache (O(1))
                    branch_id = None
                    if instance_id:
                        cust = customer_cache.get(instance_id)
                        if cust and cust.branch_id:
                            branch_id = cust.branch_id
                    
                    # Update or create customer
                    if instance_id:
                        self.update_or_create_customer(instance_id, row, 'Regular Bandhan Customers Report', cache=customer_cache)
                    
                    # Prepare bandhan data
                    bandhan_data = {
                        'instance_id': instance_id,
                        'branch_id': branch_id,
                        'name_of_agent': self.truncate_string(row.get('Name of Agent')),
                        'quotation_ref_no': quotation_ref_no,
                        'password': self.truncate_string(row.get('Password'), 200),
                        'genset_number': engine_serial_no,
                        'name': self.truncate_string(row.get('Name')),
                        'email': self.truncate_string(row.get('Email')),
                        'mobile': self.truncate_string(row.get('Mobile'), 50),
                        'pan_card_no': self.truncate_string(row.get('PAN Card No.'), 50),
                        'billing_state': self.truncate_string(row.get('Billing State'), 200),
                        'billing_city': self.truncate_string(row.get('Billing City'), 200),
                        'billing_location': self.truncate_string(row.get('Billing Location')),
                        'billing_address_1': self.convert_to_string(row.get('Billing Address 1')),
                        'billing_address_2': self.convert_to_string(row.get('Billing Address 2')),
                        'billing_pincode': self.truncate_string(row.get('Billing Pincode'), 20),
                        'dg_state': self.truncate_string(row.get('DG State'), 200),
                        'dg_city': self.truncate_string(row.get('DG City'), 200),
                        'dg_location': self.truncate_string(row.get('DG Location')),
                        'dg_address_1': self.convert_to_string(row.get('DG Address 1')),
                        'dg_address_2': self.convert_to_string(row.get('DG Address 2')),
                        'dg_pincode': self.truncate_string(row.get('DG Pincode'), 20),
                        'type_of_customer': self.truncate_string(row.get('Type of Customer'), 200),
                        'date': self.parse_date(row.get('Date')),
                        'gstn_no': self.truncate_string(row.get('GSTN No.'), 100),
                        'payment_type': self.truncate_string(row.get('Payment type'), 100),
                        'payment_update_date': self.parse_date(row.get('Payment Update Date')),
                        'contact_person_name': self.truncate_string(row.get('Contact Person Name')),
                        'zone': self.truncate_string(row.get('Zone'), 200),
                        'actual_amount': self.convert_to_float(row.get('Actual Amount')),
                        'reason_of_short_payment': self.convert_to_string(row.get('Reason of Short Payment')),
                        'status_updated_by_admin': self.convert_to_string(row.get('Status updated by Admin')),
                    }
                    
                    # O(1) lookup instead of SELECT per row
                    existing = existing_by_quote.get(quotation_ref_no) if quotation_ref_no else None
                    
                    if existing:
                        # Update existing record
                        self.update_record(existing, bandhan_data)
                        updated_count += 1
                    else:
                        # Create new record
                        bandhan = RegularBandhan(**bandhan_data)
                        self.db.add(bandhan)
                        if quotation_ref_no:
                            existing_by_quote[quotation_ref_no] = bandhan
                        imported_count += 1
                        
                except IntegrityError:
                    self.db.rollback()
                    continue
                except Exception:
                    continue
        
        self.db.commit()
        return imported_count, updated_count
    
    def import_open_sr_load_report(self, file: UploadFile):
        """Import Open SR Load Report - Override existing records"""
        contents = file.file.read()
        df = pd.read_excel(io.BytesIO(contents))
        
        is_valid, message = self.validate_file_format(df, 'Open SR Load Report')
        if not is_valid:
            raise HTTPException(status_code=400, detail=f"Invalid file format for Open SR Load Report: {message}")
        
        # ── FAST: dict iteration + bulk preload ──
        records = df.to_dict('records')
        
        all_iids = [self.extract_instance_id(r, 'Open SR Load Report') for r in records]
        all_serials = [self.extract_engine_serial_no(r, 'Open SR Load Report') for r in records]
        engine_to_iid = self._build_engine_to_instance_map(all_serials)
        all_iids_full = list({*all_iids, *engine_to_iid.values()})
        customer_cache = self._bulk_load_by_instance_id(Customer, all_iids_full)
        
        # Pre-load existing OpenSRLoadReport rows by service_request_no in ONE query batch
        all_srs = list({self.convert_to_string(r.get('Service Request #')) for r in records if r.get('Service Request #') is not None})
        all_srs = [s for s in all_srs if s]
        existing_by_sr = {}
        for i in range(0, len(all_srs), 1000):
            chunk = all_srs[i:i + 1000]
            for sr in self.db.query(OpenSRLoadReport).filter(OpenSRLoadReport.service_request_no.in_(chunk)).all():
                if sr.service_request_no and sr.service_request_no not in existing_by_sr:
                    existing_by_sr[sr.service_request_no] = sr
        
        imported_count = 0
        updated_count = 0
        
        with self.db.no_autoflush:
            for row in records:
                try:
                    instance_id = self.extract_instance_id(row, 'Open SR Load Report')
                    
                    service_request_no = self.convert_to_string(row.get('Service Request #'))
                    engine_serial_no = self.extract_engine_serial_no(row, 'Open SR Load Report')
                    
                    # Get branch_id from preloaded customer cache (O(1))
                    branch_id = None
                    if instance_id:
                        cust = customer_cache.get(instance_id)
                        if cust and cust.branch_id:
                            branch_id = cust.branch_id
                    
                    # Update or create customer
                    if instance_id:
                        self.update_or_create_customer(instance_id, row, 'Open SR Load Report', cache=customer_cache)
                    elif engine_serial_no:
                        found_instance_id = engine_to_iid.get(engine_serial_no)
                        if found_instance_id:
                            self.update_or_create_customer(found_instance_id, row, 'Open SR Load Report', cache=customer_cache)
                    
                    # Prepare SR data
                    sr_data = {
                        'instance_id': instance_id,
                        'branch_id': branch_id,
                        'service_request_no': service_request_no,
                        'sr_due_date': self.parse_date(row.get('SR Due Date')),
                        'appointment_date': self.parse_date(row.get('Appointment Date')),
                        'service_dealer': self.truncate_string(row.get('Service Dealer')),
                        'status': self.truncate_string(row.get('Status'), 100),
                        'sr_type': self.truncate_string(row.get('SR Type'), 200),
                        'sr_sub_type': self.truncate_string(row.get('SR Sub-Type'), 200),
                        'problem_code': self.truncate_string(row.get('Problem Code'), 200),
                        'installation_site_address': self.convert_to_string(row.get('Installation Site Address')),
                        'engine_app_code': self.truncate_string(row.get('Engine App Code'), 200),
                        'voc': self.truncate_string(row.get('VOC'), 200),
                        'engine_serial_no': engine_serial_no,
                        'engine_series': self.truncate_string(row.get('Engine Series'), 200),
                        'engine_model': self.truncate_string(row.get('Engine Model'), 200),
                        'ticket_no': self.truncate_string(row.get('Ticket#'), 200),
                        'segment': self.truncate_string(row.get('Segment'), 200),
                        'task_start_date': self.parse_date(row.get('Task Start Date')),
                        'task_end_date': self.parse_date(row.get('Task End Date')),
                        'account': self.truncate_string(row.get('Account')),
                        'under_monitoring_date': self.parse_date(row.get('Under Monitoring Date')),
                        'under_monitoring_remark': self.convert_to_string(row.get('Under Monitoring Remark')),
                        'convert_pm_to_wet_pm_flag': self.truncate_string(row.get('Convert PM to Wet PM Flag'), 100),
                        'efsr_engineer_remarks': self.convert_to_string(row.get('eFSR Engineer Remarks')),
                        'quick_ticket_sr_comments': self.convert_to_string(row.get('Quick Ticket SR Comments')),
                        'actual_sr_due_date': self.parse_date(row.get('Actual SR Due Date')),
                        'convert_pm_to_wet_pm_flag_updated_date': self.parse_date(row.get('Convert PM to Wet PM Flag updated Date')),
                        'convert_pm_to_wet_pm_flag_updated_by': self.truncate_string(row.get('Convert PM to Wet PM Flag updated by')),
                        'customer_name': self.truncate_string(row.get('Customer Name')),
                        'contact_last_name': self.truncate_string(row.get('Contact Last Name'), 200),
                        'customer_mobile_no': self.truncate_string(row.get('Customer Mobile #'), 50),
                        'genset_appcode': self.truncate_string(row.get('Genset Appcode'), 200),
                        'contact_name': self.truncate_string(row.get('Contact Name')),
                        'primary_phone_no': self.truncate_string(row.get('Primary Phone#'), 50),
                        'mode': self.truncate_string(row.get('Mode'), 100),
                        'close_date_time': self.parse_date(row.get('Close Date/Time')),
                        'special_tool': self.truncate_string(row.get('Special Tool'), 500),
                        'special_tool_name': self.truncate_string(row.get('Special Tool Name'), 500),
                        'repeat': self.truncate_string(row.get('Repeat'), 100),
                        'assigned_to': self.truncate_string(row.get('Assigned To')),
                        'oil_change_flg': self.truncate_string(row.get('Oil Change Flg'), 100),
                        'claim_created': self.truncate_string(row.get('Claim Created'), 100),
                        'agreement_no': self.truncate_string(row.get('Agreement #'), 200),
                        'cancellation_reason': self.convert_to_string(row.get('Cancellation Reason')),
                        'csp_cancellation_reasons': self.truncate_string(row.get('CSP Cancellation Reasons'), 500),
                        'csp_cancellation_remarks': self.convert_to_string(row.get('CSP Cancellation Remarks')),
                        'asm_ase_remarks': self.convert_to_string(row.get('ASM/ASE Remarks')),
                        'asm_ase_remarks_date': self.parse_date(row.get('ASM/ASE Remarks Date')),
                        'battery_charger_availability': self.truncate_string(row.get('Battery Charger Availability'), 100),
                        'wet_pm_due_flag': self.truncate_string(row.get('Wet PM Due Flag'), 100),
                        'cap_limit_approval_remarks': self.convert_to_string(row.get('Cap Limit Approval Remarks')),
                        'cap_limit_deviation_remarks': self.convert_to_string(row.get('Cap Limit Deviation Remarks')),
                        'cap_limit_deviation_status': self.truncate_string(row.get('Cap Limit Deviation Status'), 100),
                        'cap_limit_user_details': self.truncate_string(row.get('Cap limit User details'), 500),
                        'csp_prepone_flag': self.truncate_string(row.get('CSP Prepone Flag'), 100),
                        'csp_prepone_flag_updated_by': self.truncate_string(row.get('CSP Prepone Flag updated By')),
                        'bandhan_pm_sr_closure_within_15_days_flag': self.truncate_string(row.get('Bandhan PM SR closure within 15 days flag'), 100),
                        'bandhan_pm_lock_removal_flag_updated_by': self.truncate_string(row.get('Bandhan PM Lock Removal flag updated by')),
                        'bandhan_pm_lock_removal_flag_updated_date': self.parse_date(row.get('Bandhan PM Lock Removal flag updated Date')),
                        'bandhan_pm_sr_closure_90_days_max_after_pm_due_date_flag': self.truncate_string(row.get('Bandhan PM SR Closure @90 days max after PM Due Date flag'), 100),
                        'bandhan_pm_due_date_lock_removal_flag_updated_by': self.truncate_string(row.get('Bandhan PM Due Date Lock Removal flag updated by')),
                        'bandhan_pm_due_date_lock_removal_flag_updated_date': self.parse_date(row.get('Bandhan PM Due Date Lock Removal flag updated Date')),
                        'bandhan_job_card_creation_prior_to_60_days_flag': self.truncate_string(row.get('Bandhan Job card creation prior to 60 days flag'), 100),
                        'bandhan_pm_jc_creation_lock_removal_flag_updated_by': self.truncate_string(row.get('Bandhan PM JC creation Lock Removal flag updated by')),
                        'bandhan_pm_jc_creation_lock_removal_flag_updated_date': self.parse_date(row.get('Bandhan PM JC creation Lock Removal flag updated Date')),
                        'account_id': self.truncate_string(row.get('Account Id'), 200),
                        'sr_created_by': self.truncate_string(row.get('SR Created BY')),
                        'efsr_krm_number': self.truncate_string(row.get('eFSR KRM Number'), 200),
                        'dry_csp_approved_by': self.truncate_string(row.get('Dry CSP Approved by')),
                        'dry_csp_approved_date': self.parse_date(row.get('Dry CSP Approved Date')),
                    }
                    
                    # O(1) lookup instead of SELECT per row
                    existing = existing_by_sr.get(service_request_no) if service_request_no else None
                    
                    if existing:
                        # Update existing record
                        self.update_record(existing, sr_data)
                        updated_count += 1
                    else:
                        # Create new record
                        sr_report = OpenSRLoadReport(**sr_data)
                        self.db.add(sr_report)
                        if service_request_no:
                            existing_by_sr[service_request_no] = sr_report
                        imported_count += 1
                        
                except IntegrityError:
                    self.db.rollback()
                    continue
                except Exception:
                    continue
        
        self.db.commit()
        return imported_count, updated_count
    
    def match_pending_regular_bandhan(self):
        """Match Regular Bandhan records that don't have instance_id yet"""
        pending = self.db.query(RegularBandhan).filter(
            RegularBandhan.instance_id.is_(None)
        ).all()
        if not pending:
            return 0
        
        # Bulk pre-build the lookup maps (used to be 6 queries per row, now 6 queries TOTAL)
        serials = [p.genset_number for p in pending if p.genset_number]
        engine_to_iid = self._build_engine_to_instance_map(serials)
        
        iids_found = list(set(engine_to_iid.values()))
        customer_cache = self._bulk_load_by_instance_id(Customer, iids_found)
        iid_to_branch = self._build_instance_to_branch_map(iids_found)
        
        matched = 0
        for record in pending:
            if not record.genset_number:
                continue
            instance_id = engine_to_iid.get(record.genset_number)
            if not instance_id:
                continue
            
            record.instance_id = instance_id
            matched += 1
            
            # Update branch_id from customer
            customer = customer_cache.get(instance_id)
            if customer and customer.branch_id:
                record.branch_id = customer.branch_id
            
            # Update customer details
            if customer:
                if not customer.customer_name and record.name:
                    customer.customer_name = self.truncate_string(record.name, 500)
                if not customer.phone_number and record.mobile:
                    phone = re.sub(r'\D', '', record.mobile)
                    customer.phone_number = phone[:50]
                if not customer.email and record.email:
                    customer.email = self.truncate_string(record.email, 500)
                if not customer.pan_number and record.pan_card_no:
                    customer.pan_number = self.truncate_string(record.pan_card_no, 50)
                
                if not customer.branch_id:
                    branch_id = iid_to_branch.get(instance_id)
                    if branch_id:
                        customer.branch_id = branch_id
        
        if matched > 0:
            self.db.commit()
        
        return matched
    
    def match_pending_open_sr_records(self):
        """Match Open SR Load Report records that don't have instance_id yet"""
        pending = self.db.query(OpenSRLoadReport).filter(
            OpenSRLoadReport.instance_id.is_(None)
        ).all()
        if not pending:
            return 0
        
        # Bulk pre-build the lookup maps (used to be 6 queries per row, now 6 queries TOTAL)
        serials = [p.engine_serial_no for p in pending if p.engine_serial_no]
        engine_to_iid = self._build_engine_to_instance_map(serials)
        
        iids_found = list(set(engine_to_iid.values()))
        customer_cache = self._bulk_load_by_instance_id(Customer, iids_found)
        iid_to_branch = self._build_instance_to_branch_map(iids_found)
        
        matched = 0
        for record in pending:
            if not record.engine_serial_no:
                continue
            instance_id = engine_to_iid.get(record.engine_serial_no)
            if not instance_id:
                continue
            
            record.instance_id = instance_id
            matched += 1
            
            # Update branch_id from customer
            customer = customer_cache.get(instance_id)
            if customer and customer.branch_id:
                record.branch_id = customer.branch_id
            
            if customer and not customer.branch_id:
                branch_id = iid_to_branch.get(instance_id)
                if branch_id:
                    customer.branch_id = branch_id
        
        if matched > 0:
            self.db.commit()
        
        return matched
    
    def process_file(self, file: UploadFile, file_type: str):
        """Process uploaded file based on type"""
        try:
            import_functions = {
                'AMC Agreement History': self.import_amc_agreement,
                'Asset Detailed Report': self.import_asset_detailed,
                'Asset Details with Last Oil Service': self.import_asset_service,
                'Anubandhan Plus Quotes Report': self.import_anubandhan_plus_quotes,
                'Anubandhan Quotes Report': self.import_anubandhan_quotes,
                'BandhanPlus Quotes Report': self.import_bandhan_plus_quotes,
                'Pulse Quotation - Service Only': self.import_pulse_quotation,
                'Regular Bandhan Customers Report': self.import_regular_bandhan,
                'LMS Data for ERP': self.import_lms_data,
                'Open SR Load Report': self.import_open_sr_load_report
            }
            
            if file_type not in import_functions:
                raise HTTPException(status_code=400, detail=f"Unknown file type: {file_type}")
            
            imported_count, updated_count = import_functions[file_type](file)
            
            # Match pending records
            matched_regular = self.match_pending_regular_bandhan()
            matched_open_sr = self.match_pending_open_sr_records()
            
            # Update missing branch IDs in bulk (was 4 SELECTs per customer; now 4 SELECTs TOTAL)
            customers_missing_branch = self.db.query(Customer).filter(
                Customer.branch_id.is_(None)
            ).all()
            
            branch_updated = 0
            if customers_missing_branch:
                missing_iids = [c.instance_id for c in customers_missing_branch if c.instance_id]
                iid_to_branch = self._build_instance_to_branch_map(missing_iids)
                for customer in customers_missing_branch:
                    bid = iid_to_branch.get(customer.instance_id)
                    if bid:
                        customer.branch_id = bid
                        branch_updated += 1
                
                if branch_updated > 0:
                    self.db.commit()
            
            return {
                "imported": imported_count,
                "updated": updated_count,
                "total_processed": imported_count + updated_count,
                "matched_regular_bandhan": matched_regular,
                "matched_open_sr": matched_open_sr,
                "branch_updated": branch_updated
            }
            
        except HTTPException:
            raise
        except Exception as e:
            self.db.rollback()
            raise HTTPException(status_code=500, detail=f"Error processing file: {str(e)}")
        finally:
            file.file.close()