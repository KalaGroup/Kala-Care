/* =============================================================================
   Expense system (Branch + HO) — recommended indexes
   -----------------------------------------------------------------------------
   Run ONCE in SQL Server Management Studio against the KalaCare database.
   Safe to re-run (each is guarded by IF NOT EXISTS). If your schema is not
   "dbo", replace dbo. throughout.

   Why: every expense list & dashboard query filters by branch (branch_code or
   sd_branch_code) and usually also by verification_status / a date / is_deleted.
   None of those columns are indexed today, so each query scans the whole table.
   The composite indexes below match the actual WHERE clauses so SQL Server can
   SEEK straight to a branch's rows instead of scanning everything. This is the
   single biggest speed-up for "load data filtered by branch", both at Branch
   Admin and HO level, and it changes no application behaviour.

   (Columns already indexed by the app and NOT repeated here: every voucher_no,
   branch_km_rates.branch_code, branch_employees.employee_id/branch_code,
   imprest_amounts.branch_code, and all primary keys.)
   ============================================================================= */

/* ---------------------------- TADA (imports) ------------------------------- */
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_tada_imports_sdbranch_status' AND object_id=OBJECT_ID('dbo.tada_imports'))
    CREATE NONCLUSTERED INDEX IX_tada_imports_sdbranch_status
        ON dbo.tada_imports (sd_branch_code, verification_status);   -- HO unverified counts / dashboards
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_tada_imports_branch_status' AND object_id=OBJECT_ID('dbo.tada_imports'))
    CREATE NONCLUSTERED INDEX IX_tada_imports_branch_status
        ON dbo.tada_imports (branch_code, verification_status);      -- branch admin lists
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_tada_imports_engineer_uid' AND object_id=OBJECT_ID('dbo.tada_imports'))
    CREATE NONCLUSTERED INDEX IX_tada_imports_engineer_uid
        ON dbo.tada_imports (service_engineer_uid);                  -- engineer→branch resolution
GO

/* ---------------------------- TADA (history) ------------------------------- */
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_tada_history_sdbranch_status' AND object_id=OBJECT_ID('dbo.tada_history'))
    CREATE NONCLUSTERED INDEX IX_tada_history_sdbranch_status
        ON dbo.tada_history (sd_branch_code, verification_status);   -- verified KPIs / all-branches verified
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_tada_history_sdbranch_movedat' AND object_id=OBJECT_ID('dbo.tada_history'))
    CREATE NONCLUSTERED INDEX IX_tada_history_sdbranch_movedat
        ON dbo.tada_history (sd_branch_code, moved_at);              -- monthly trend
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_tada_history_branch' AND object_id=OBJECT_ID('dbo.tada_history'))
    CREATE NONCLUSTERED INDEX IX_tada_history_branch
        ON dbo.tada_history (branch_code);                          -- branch history lists
GO

/* ---------------------------- TADA bill-wise ------------------------------- */
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_tada_bill_wise_branch_status' AND object_id=OBJECT_ID('dbo.tada_bill_wise'))
    CREATE NONCLUSTERED INDEX IX_tada_bill_wise_branch_status
        ON dbo.tada_bill_wise (branch_code, verification_status);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_tada_bill_wise_branch_entry' AND object_id=OBJECT_ID('dbo.tada_bill_wise'))
    CREATE NONCLUSTERED INDEX IX_tada_bill_wise_branch_entry
        ON dbo.tada_bill_wise (branch_code, entry_type);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_tada_bill_wise_employee' AND object_id=OBJECT_ID('dbo.tada_bill_wise'))
    CREATE NONCLUSTERED INDEX IX_tada_bill_wise_employee
        ON dbo.tada_bill_wise (employee_id);
GO

/* ---------------------------- Sales & BM ----------------------------------- */
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_sales_bm_branch_status' AND object_id=OBJECT_ID('dbo.sales_bm'))
    CREATE NONCLUSTERED INDEX IX_sales_bm_branch_status
        ON dbo.sales_bm (branch_code, verification_status);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_sales_bm_engineer_uid' AND object_id=OBJECT_ID('dbo.sales_bm'))
    CREATE NONCLUSTERED INDEX IX_sales_bm_engineer_uid
        ON dbo.sales_bm (engineer_uid);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_sales_bm_history_branch_movedat' AND object_id=OBJECT_ID('dbo.sales_bm_history'))
    CREATE NONCLUSTERED INDEX IX_sales_bm_history_branch_movedat
        ON dbo.sales_bm_history (branch_code, moved_at);
GO

/* ---------------------------- Office expenses ------------------------------ */
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_office_expenses_branch_deleted' AND object_id=OBJECT_ID('dbo.office_expenses'))
    CREATE NONCLUSTERED INDEX IX_office_expenses_branch_deleted
        ON dbo.office_expenses (branch_code, is_deleted);           -- live branch lists / unverified
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_office_expenses_branch_paid' AND object_id=OBJECT_ID('dbo.office_expenses'))
    CREATE NONCLUSTERED INDEX IX_office_expenses_branch_paid
        ON dbo.office_expenses (branch_code, paid_date);            -- date-range filters
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_office_expenses_submit_voucher' AND object_id=OBJECT_ID('dbo.office_expenses'))
    CREATE NONCLUSTERED INDEX IX_office_expenses_submit_voucher
        ON dbo.office_expenses (submit_voucher_no);                 -- voucher grouping
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_office_exp_hist_branch_movedat' AND object_id=OBJECT_ID('dbo.office_expense_history'))
    CREATE NONCLUSTERED INDEX IX_office_exp_hist_branch_movedat
        ON dbo.office_expense_history (branch_code, moved_at);      -- monthly / category trends
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_office_exp_hist_submit_voucher' AND object_id=OBJECT_ID('dbo.office_expense_history'))
    CREATE NONCLUSTERED INDEX IX_office_exp_hist_submit_voucher
        ON dbo.office_expense_history (submit_voucher_no);
GO

/* ---------------------------- Local vendor bills --------------------------- */
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_lvb_branch_deleted' AND object_id=OBJECT_ID('dbo.local_vendor_bills'))
    CREATE NONCLUSTERED INDEX IX_lvb_branch_deleted
        ON dbo.local_vendor_bills (branch_code, is_deleted);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_lvb_branch_invoice' AND object_id=OBJECT_ID('dbo.local_vendor_bills'))
    CREATE NONCLUSTERED INDEX IX_lvb_branch_invoice
        ON dbo.local_vendor_bills (branch_code, invoice_date);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_lvb_submit_voucher' AND object_id=OBJECT_ID('dbo.local_vendor_bills'))
    CREATE NONCLUSTERED INDEX IX_lvb_submit_voucher
        ON dbo.local_vendor_bills (submit_voucher_no);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_lvb_hist_branch_movedat' AND object_id=OBJECT_ID('dbo.local_vendor_bills_history'))
    CREATE NONCLUSTERED INDEX IX_lvb_hist_branch_movedat
        ON dbo.local_vendor_bills_history (branch_code, moved_at);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_lvb_hist_submit_voucher' AND object_id=OBJECT_ID('dbo.local_vendor_bills_history'))
    CREATE NONCLUSTERED INDEX IX_lvb_hist_submit_voucher
        ON dbo.local_vendor_bills_history (submit_voucher_no);
GO

/* ---------------------------- Staging / temp tables ------------------------
   These hold only rows not yet submitted (usually small), but their list
   endpoints still filter by branch_code. Add these only if a branch's staging
   table grows large; otherwise they are optional. Uncomment table names that
   exist in your DB.
   --------------------------------------------------------------------------- */
-- IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_tada_imports_temp_branch' AND object_id=OBJECT_ID('dbo.tada_imports_temp'))
--     CREATE NONCLUSTERED INDEX IX_tada_imports_temp_branch ON dbo.tada_imports_temp (branch_code);
-- GO
-- IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_office_expense_temp_branch' AND object_id=OBJECT_ID('dbo.office_expense_temp'))
--     CREATE NONCLUSTERED INDEX IX_office_expense_temp_branch ON dbo.office_expense_temp (branch_code);
-- GO
-- IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_lvb_temp_branch' AND object_id=OBJECT_ID('dbo.local_vendor_bills_temp'))
--     CREATE NONCLUSTERED INDEX IX_lvb_temp_branch ON dbo.local_vendor_bills_temp (branch_code);
-- GO
-- IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_sales_bm_temp_branch' AND object_id=OBJECT_ID('dbo.sales_bm_temp'))
--     CREATE NONCLUSTERED INDEX IX_sales_bm_temp_branch ON dbo.sales_bm_temp (branch_code);
-- GO
-- IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_tada_bill_wise_temp_branch' AND object_id=OBJECT_ID('dbo.tada_bill_wise_temp'))
--     CREATE NONCLUSTERED INDEX IX_tada_bill_wise_temp_branch ON dbo.tada_bill_wise_temp (branch_code);
-- GO

/* After creating indexes, optionally refresh stats:
   EXEC sp_updatestats;  */
