Frontend:

cd client
npm install
npm run dev / npm run build


Backend: 

cd server
Remove-Item -Path "venv" -Recurse -Force -ErrorAction SilentlyContinue
python -m venv venv
.\venv\Scripts\activate
python -m pip install --upgrade pip
pip install -r requirements.txt
pip install fastapi uvicorn sqlalchemy pyodbc python-dotenv pandas openpyxl
uvicorn app.main:app --host 127.0.0.1 --port 5004 --reload



Backend exe: 

cd server
.\venv\Scripts\pyinstaller.exe --onefile --name backend --add-data "app;app" --add-data ".env;." --collect-all fastapi --collect-all uvicorn --collect-all sqlalchemy --collect-all pandas --collect-all openpyxl --collect-all passlib --collect-all bcrypt --collect-all argon2 --collect-all cryptography --collect-all pyodbc --collect-all email app\run.py



CREATE INDEX idx_fu_user_created ON followups(user_id, created_at);
CREATE INDEX idx_fu_campaign_status ON followups(campaign_id, status);
CREATE INDEX idx_fu_customer_instance ON followups(customer_instance_id);
CREATE INDEX idx_fu_status ON followups(status);
CREATE INDEX idx_fu_user_campaign ON followups(user_id, campaign_id);
CREATE INDEX idx_users_branch ON users(branch);




IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'idx_customers_branch_instance')
    CREATE INDEX idx_customers_branch_instance ON customers(branch_id, instance_id);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'idx_fu_campaign_customer')
    CREATE INDEX idx_fu_campaign_customer ON followups(campaign_id, customer_instance_id);



CREATE INDEX idx_followups_customer_date ON followups(customer_id, followup_date DESC);




IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'idx_asset_detailed_instance')
    CREATE INDEX idx_asset_detailed_instance ON asset_detailed(instance_id);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'idx_amc_agreements_instance_start')
    CREATE INDEX idx_amc_agreements_instance_start ON amc_agreements(instance_id, agreement_start_date DESC);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'idx_non_followups_customer_date')
    CREATE INDEX idx_non_followups_customer_date ON non_followups(customer_id, followup_date DESC);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'idx_non_followups_status')
    CREATE INDEX idx_non_followups_status ON non_followups(status);



CREATE NONCLUSTERED INDEX idx_customers_customer_name
ON customers (customer_name);



CREATE INDEX ix_customers_branch_id ON customers (branch_id);
CREATE INDEX ix_followups_user_id ON followups (user_id);
CREATE INDEX ix_followups_campaign_status ON followups (campaign_id, status);
CREATE INDEX ix_users_branch_blocked ON users (branch, is_blocked);






CREATE INDEX ix_non_followups_customer_date
    ON non_followups (customer_id, followup_date DESC, id DESC);

CREATE INDEX ix_non_followups_status
    ON non_followups (status);

CREATE INDEX ix_nonfollowups_cust_date ON non_followups (customer_id, followup_date DESC, id DESC);
CREATE INDEX ix_followups_cust_date    ON followups     (customer_id, followup_date DESC);
CREATE INDEX ix_assetdetailed_instance ON asset_detailed (instance_id);
CREATE INDEX ix_amc_instance_start     ON amc_agreements (instance_id, agreement_start_date DESC);
CREATE INDEX ix_customers_name         ON customers (customer_name);    


IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_followups_customer_date' AND object_id=OBJECT_ID('followups'))
    CREATE INDEX IX_followups_customer_date ON followups (customer_id, followup_date);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_campaigns_status' AND object_id=OBJECT_ID('campaigns'))
    CREATE INDEX IX_campaigns_status ON campaigns (status);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_customers_customer_name' AND object_id=OBJECT_ID('customers'))
    CREATE INDEX IX_customers_customer_name ON customers (customer_name);


CREATE NONCLUSTERED INDEX IX_letter_send_records_sent_by_id ON letter_send_records (sent_by_id);    





IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_kb_files_folder' AND object_id=OBJECT_ID('dbo.kb_files'))
    CREATE NONCLUSTERED INDEX IX_kb_files_folder
        ON dbo.kb_files (folder_id, original_name)
        INCLUDE (is_hidden, kind, description, category_id, size_bytes, created_at);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_kb_files_category' AND object_id=OBJECT_ID('dbo.kb_files'))
    CREATE NONCLUSTERED INDEX IX_kb_files_category
        ON dbo.kb_files (category_id, original_name)
        INCLUDE (is_hidden, kind, description, size_bytes, folder_id, created_at);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_kb_folders_parent' AND object_id=OBJECT_ID('dbo.kb_folders'))
    CREATE NONCLUSTERED INDEX IX_kb_folders_parent
        ON dbo.kb_folders (parent_id)
        INCLUDE (name, is_system, is_hidden, description, created_at, updated_at);
GO




IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_maintenance_parts_app_cover' AND object_id=OBJECT_ID('dbo.maintenance_parts'))
    CREATE NONCLUSTERED INDEX IX_maintenance_parts_app_cover
        ON dbo.maintenance_parts (app_code_id, sort_order)
        INCLUDE (part_number, part_desc, qty, action,
                 alt_part_no, alt_desc, alt_qty, alt_action,
                 service_hours, consumable, schedule);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_maintenance_activity_created' AND object_id=OBJECT_ID('dbo.maintenance_activity'))
    CREATE NONCLUSTERED INDEX IX_maintenance_activity_created
        ON dbo.maintenance_activity (created_at DESC, id DESC)
        INCLUDE (app_code, employee, engine_model, segment);
GO



-- TADA (Critical)
CREATE INDEX idx_tada_imports_branch_code ON tada_imports(branch_code);
CREATE INDEX idx_tada_imports_engineer_uid ON tada_imports(service_engineer_uid);
CREATE INDEX idx_tada_imports_task_start_date ON tada_imports(task_start_date);
CREATE INDEX idx_tada_imports_verification_status ON tada_imports(verification_status);
CREATE INDEX idx_tada_imports_sd_branch_code ON tada_imports(sd_branch_code);

-- TADA History
CREATE INDEX idx_tada_history_branch_code ON tada_history(branch_code);
CREATE INDEX idx_tada_history_verification_status ON tada_history(verification_status);

-- TADA Bill Wise
CREATE INDEX idx_tada_bill_wise_branch_code ON tada_bill_wise(branch_code);
CREATE INDEX idx_tada_bill_wise_verification_status ON tada_bill_wise(verification_status);
CREATE INDEX idx_tada_bill_wise_engineer_uid ON tada_bill_wise(service_engineer_uid);
CREATE INDEX idx_tada_bill_wise_employee_id ON tada_bill_wise(employee_id);
CREATE INDEX idx_tada_bill_wise_date ON tada_bill_wise(date);

-- Office Expenses
CREATE INDEX idx_office_expenses_branch_code ON office_expenses(branch_code);
CREATE INDEX idx_office_expenses_paid_date ON office_expenses(paid_date);
CREATE INDEX idx_office_expenses_expenses_head ON office_expenses(expenses_head);

-- Local Vendor Bills
CREATE INDEX idx_lvb_branch_code ON local_vendor_bills(branch_code);
CREATE INDEX idx_lvb_invoice_date ON local_vendor_bills(invoice_date);
CREATE INDEX idx_lvb_verification_status ON local_vendor_bills(verification_status);

-- Sales & BM
CREATE INDEX idx_sales_bm_branch_code ON sales_bm(branch_code);
CREATE INDEX idx_sales_bm_verification_status ON sales_bm(verification_status);
CREATE INDEX idx_sales_bm_engineer_uid ON sales_bm(engineer_uid);
CREATE INDEX idx_sales_bm_date ON sales_bm(date);




CREATE NONCLUSTERED INDEX IX_cust_edit_hist_deleted_customer ON dbo.customer_edit_history (is_deleted, customer_id);      -- distinct edited customers
CREATE NONCLUSTERED INDEX IX_cust_edit_hist_customer_edited  ON dbo.customer_edit_history (customer_id, last_edited_at DESC); -- per-customer history, newest first
CREATE NONCLUSTERED INDEX IX_cust_edit_hist_created          ON dbo.customer_edit_history (created_at);                    -- 10-day report




IF NOT EXISTS (SELECT 1 FROM sys.indexes
               WHERE name = 'IX_mom_meetings_branch_date'
                 AND object_id = OBJECT_ID('dbo.mom_meetings'))
    CREATE INDEX IX_mom_meetings_branch_date
        ON dbo.mom_meetings (branch_code, meeting_date DESC);

IF NOT EXISTS (SELECT 1 FROM sys.indexes
               WHERE name = 'IX_mom_rows_track_meeting'
                 AND object_id = OBJECT_ID('dbo.mom_rows'))
    CREATE INDEX IX_mom_rows_track_meeting
        ON dbo.mom_rows (track_id, meeting_id);