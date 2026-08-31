"""Performance indexes for hot query paths.

Applied once at server startup (see main.py). Every statement is
idempotent -- guarded by IF NOT EXISTS against sys.indexes -- so
restarts are no-ops after the first successful run. Each index was
derived from the WHERE / JOIN / ORDER BY columns of the hot list and
dashboard queries in the controllers; none change any behavior, they
only speed up reads. A failure on any single index (e.g. missing
table on a fresh install) is logged and skipped -- startup never
blocks on this.
"""

from sqlalchemy import text

INDEX_STATEMENTS = [
    # PMS preview pagination — filter record_type, newest-first pages by id
    "IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'ix_pms_records_type_id' AND object_id = OBJECT_ID('dbo.pms_sales_records')) CREATE NONCLUSTERED INDEX ix_pms_records_type_id ON dbo.pms_sales_records (record_type, id DESC);",
    # IX_pms_records_date_cancel — report generation: one covering seek over the
    # period's date range (cancelled filtered in the index); INCLUDE carries every
    # column the aggregation loop reads, so the wide base table is never touched.
    "IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_pms_records_date_cancel' AND object_id = OBJECT_ID('dbo.pms_sales_records')) CREATE NONCLUSTERED INDEX IX_pms_records_date_cancel ON dbo.pms_sales_records (claim_invoice_date, is_cancelled) INCLUDE (record_type, branch_id, branch_name, zone_name, claim_invoice_no, net_taxable_amount, segment, product_segment, sr_type, category, quantity);",
    # IX_pms_records_type_cancel_id — preview's Active/Cancelled filter pages and
    # the cancelled_total count: seek on (type, flag), rows already newest-first.
    "IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_pms_records_type_cancel_id' AND object_id = OBJECT_ID('dbo.pms_sales_records')) CREATE NONCLUSTERED INDEX IX_pms_records_type_cancel_id ON dbo.pms_sales_records (record_type, is_cancelled, id DESC);",
    # IX_pms_records_branch_date — selected-branch detail (week/month/breakdowns):
    # seek on the chosen branches + date range instead of scanning all rows.
    "IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_pms_records_branch_date' AND object_id = OBJECT_ID('dbo.pms_sales_records')) CREATE NONCLUSTERED INDEX IX_pms_records_branch_date ON dbo.pms_sales_records (branch_id, claim_invoice_date, is_cancelled) INCLUDE (record_type, claim_invoice_no, net_taxable_amount, segment, product_segment, sr_type, category, quantity);",
    # IX_pms_records_type_cancel_date — the report / FY-summary GROUP BYs. They
    # always pin ONE record type and a date range (each type has its own as-on
    # date), so the type leads the key; INCLUDE covers every grouped and summed
    # column, making each aggregate an index-only seek that returns a handful
    # of grouped rows instead of the whole period's rows.
    "IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_pms_records_type_cancel_date' AND object_id = OBJECT_ID('dbo.pms_sales_records')) CREATE NONCLUSTERED INDEX IX_pms_records_type_cancel_date ON dbo.pms_sales_records (record_type, is_cancelled, claim_invoice_date) INCLUDE (branch_id, branch_name, zone_name, claim_invoice_no, net_taxable_amount, segment, product_segment, sr_type, category, quantity);",
    # IX_pms_targets_month — AOP Master + every report reads a FY's targets by
    # month; INCLUDE returns the whole row from the index.
    "IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_pms_targets_month' AND object_id = OBJECT_ID('dbo.pms_branch_targets')) CREATE NONCLUSTERED INDEX IX_pms_targets_month ON dbo.pms_branch_targets (target_month) INCLUDE (branch_id, branch_name, region, responsible_person, spare_target, labour_target);",
    # Employee Productivity / SR Allocation sources — each report reads a few
    # columns of the whole file, so a narrow covering index replaces a full
    # scan of these wide import tables.
    "IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_efsr_uid_closed' AND object_id = OBJECT_ID('dbo.efsr_report')) CREATE NONCLUSTERED INDEX IX_efsr_uid_closed ON dbo.efsr_report (service_engineer_uid, sr_closed_date) INCLUDE (service_engineer_name, sd_branch_code, sr_type);",
    "IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_efsr_uid_assigned' AND object_id = OBJECT_ID('dbo.efsr_report')) CREATE NONCLUSTERED INDEX IX_efsr_uid_assigned ON dbo.efsr_report (service_engineer_uid, task_assigned_date) INCLUDE (service_engineer_name, sd_branch_code, sr_type);",
    "IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_lms_uid_created' AND object_id = OBJECT_ID('dbo.lms_data')) CREATE NONCLUSTERED INDEX IX_lms_uid_created ON dbo.lms_data (service_engineer_uid, lead_created_date) INCLUDE (lead_number, service_engineer_name, branch_id, branch_name, lead_raised_for, part_invoice_amount, labour_invoice_amount);",
    "IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_cdi_tech_end_date' AND object_id = OBJECT_ID('dbo.cdi_detail_report')) CREATE NONCLUSTERED INDEX IX_cdi_tech_end_date ON dbo.cdi_detail_report (x_technician_name, activity_end_date) INCLUDE (cdi_category);",
    # Customer Delight Index (Annual Reports): the branch x date x category
    # aggregate is served straight off this index instead of scanning the table.
    "IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_cdi_branch_end_date' AND object_id = OBJECT_ID('dbo.cdi_detail_report')) CREATE NONCLUSTERED INDEX IX_cdi_branch_end_date ON dbo.cdi_detail_report (branch_name, activity_end_date) INCLUDE (cdi_category);",
    "IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_maxttr_se_close' AND object_id = OBJECT_ID('dbo.response_time_maxttr')) CREATE NONCLUSTERED INDEX IX_maxttr_se_close ON dbo.response_time_maxttr (se_name, sr_close_date) INCLUDE (branch_id, branch_name, sr_type);",
    # IX_followups_customer_id_followup_date
    "IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_followups_customer_id_followup_date' AND object_id = OBJECT_ID('dbo.followups')) CREATE NONCLUSTERED INDEX IX_followups_customer_id_followup_date ON dbo.followups (customer_id, followup_date DESC) INCLUDE (status);",
    # IX_non_followups_customer_id_followup_date_id
    "IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_non_followups_customer_id_followup_date_id' AND object_id = OBJECT_ID('dbo.non_followups')) CREATE NONCLUSTERED INDEX IX_non_followups_customer_id_followup_date_id ON dbo.non_followups (customer_id, followup_date DESC, id DESC) INCLUDE (status);",
    # IX_customers_customer_name
    "IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_customers_customer_name' AND object_id = OBJECT_ID('dbo.customers')) CREATE NONCLUSTERED INDEX IX_customers_customer_name ON dbo.customers (customer_name);",
    # IX_customers_created_at
    "IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_customers_created_at' AND object_id = OBJECT_ID('dbo.customers')) CREATE NONCLUSTERED INDEX IX_customers_created_at ON dbo.customers (created_at DESC);",
    # IX_asset_detailed_created_at
    "IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_asset_detailed_created_at' AND object_id = OBJECT_ID('dbo.asset_detailed')) CREATE NONCLUSTERED INDEX IX_asset_detailed_created_at ON dbo.asset_detailed (created_at DESC);",
    # IX_oil_services_last_oil_change_date
    "IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_oil_services_last_oil_change_date' AND object_id = OBJECT_ID('dbo.oil_services')) CREATE NONCLUSTERED INDEX IX_oil_services_last_oil_change_date ON dbo.oil_services (last_oil_change_date DESC);",
    # IX_amc_agreements_agreement_start_date
    "IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_amc_agreements_agreement_start_date' AND object_id = OBJECT_ID('dbo.amc_agreements')) CREATE NONCLUSTERED INDEX IX_amc_agreements_agreement_start_date ON dbo.amc_agreements (agreement_start_date DESC);",
    # IX_lms_data_lead_created_date
    "IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_lms_data_lead_created_date' AND object_id = OBJECT_ID('dbo.lms_data')) CREATE NONCLUSTERED INDEX IX_lms_data_lead_created_date ON dbo.lms_data (lead_created_date DESC);",
    # IX_lms_data_se_uid_created — Employee Productivity: leads of one engineer
    # inside the reporting period, with the columns the aggregation reads.
    "IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_lms_data_se_uid_created' AND object_id = OBJECT_ID('dbo.lms_data')) CREATE NONCLUSTERED INDEX IX_lms_data_se_uid_created ON dbo.lms_data (service_engineer_uid, lead_created_date) INCLUDE (lead_number, lead_raised_for, branch_id, service_engineer_name, part_invoice_amount);",
    # IX_rtm_se_name_close — Employee Productivity: SRs by engineer / close date.
    "IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_rtm_se_name_close' AND object_id = OBJECT_ID('dbo.response_time_maxttr')) CREATE NONCLUSTERED INDEX IX_rtm_se_name_close ON dbo.response_time_maxttr (se_name, sr_close_date) INCLUDE (sr_number, branch_id, branch_name, sr_type);",
    # IX_rtm_se_name_task_end — Employee Productivity: "Days present on Task
    # end" is a DISTINCT (se_name, branch_id, sr_task_end_date) scan, so it gets
    # its own covering index the same way the close-date one does.
    "IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_rtm_se_name_task_end' AND object_id = OBJECT_ID('dbo.response_time_maxttr')) CREATE NONCLUSTERED INDEX IX_rtm_se_name_task_end ON dbo.response_time_maxttr (se_name, sr_task_end_date) INCLUDE (branch_id);",
    # The PMS report cache fingerprints MAX(updated_at) on this table (a MaxTTR
    # re-upload only UPDATES existing SR rows), so that MAX must be a seek.
    "IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'ix_response_time_maxttr_updated_at' AND object_id = OBJECT_ID('dbo.response_time_maxttr')) CREATE NONCLUSTERED INDEX ix_response_time_maxttr_updated_at ON dbo.response_time_maxttr (updated_at DESC);",
    # 2026-08-18: the Open SR soft delete was removed — an SR is CLOSED when the
    # same (instance_id, sr_number) is in the MaxTTR file, not when it drops out
    # of an upload. is_active is therefore dead; every row carried 1. Its index
    # and DEFAULT constraint must go before the column can be dropped.
    """
    IF EXISTS (SELECT 1 FROM sys.columns
               WHERE object_id = OBJECT_ID('dbo.open_sr_load_reports') AND name = 'is_active')
    BEGIN
        DECLARE @ix sysname, @df sysname;
        SELECT @ix = i.name FROM sys.indexes i
          JOIN sys.index_columns ic ON ic.object_id = i.object_id AND ic.index_id = i.index_id
          JOIN sys.columns c ON c.object_id = i.object_id AND c.column_id = ic.column_id
          WHERE i.object_id = OBJECT_ID('dbo.open_sr_load_reports') AND c.name = 'is_active'
            AND i.is_primary_key = 0;
        IF @ix IS NOT NULL EXEC('DROP INDEX [' + @ix + '] ON dbo.open_sr_load_reports');
        SELECT @df = dc.name FROM sys.default_constraints dc
          JOIN sys.columns c ON c.object_id = dc.parent_object_id AND c.column_id = dc.parent_column_id
          WHERE dc.parent_object_id = OBJECT_ID('dbo.open_sr_load_reports') AND c.name = 'is_active';
        IF @df IS NOT NULL EXEC('ALTER TABLE dbo.open_sr_load_reports DROP CONSTRAINT [' + @df + ']');
        ALTER TABLE dbo.open_sr_load_reports DROP COLUMN is_active;
    END
    """,

    # 2026-08-26: Part Detail Info — the master file's "Service schedules" column
    # was never used. A part is bound to its service by Service Hours, the import
    # stopped reading the column and the API stopped returning it, so the (always
    # blank) maintenance_parts.schedule column goes too. Any index / default
    # constraint on it must be dropped first.
    """
    IF EXISTS (SELECT 1 FROM sys.columns
               WHERE object_id = OBJECT_ID('dbo.maintenance_parts') AND name = 'schedule')
    BEGIN
        DECLARE @mpix sysname, @mpdf sysname;
        SELECT @mpix = i.name FROM sys.indexes i
          JOIN sys.index_columns ic ON ic.object_id = i.object_id AND ic.index_id = i.index_id
          JOIN sys.columns c ON c.object_id = i.object_id AND c.column_id = ic.column_id
          WHERE i.object_id = OBJECT_ID('dbo.maintenance_parts') AND c.name = 'schedule'
            AND i.is_primary_key = 0;
        IF @mpix IS NOT NULL EXEC('DROP INDEX [' + @mpix + '] ON dbo.maintenance_parts');
        SELECT @mpdf = dc.name FROM sys.default_constraints dc
          JOIN sys.columns c ON c.object_id = dc.parent_object_id AND c.column_id = dc.parent_column_id
          WHERE dc.parent_object_id = OBJECT_ID('dbo.maintenance_parts') AND c.name = 'schedule';
        IF @mpdf IS NOT NULL EXEC('ALTER TABLE dbo.maintenance_parts DROP CONSTRAINT [' + @mpdf + ']');
        ALTER TABLE dbo.maintenance_parts DROP COLUMN schedule;
    END
    """,

    # IX_open_sr_load_reports_sr_due_date
    "IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_open_sr_load_reports_sr_due_date' AND object_id = OBJECT_ID('dbo.open_sr_load_reports')) CREATE NONCLUSTERED INDEX IX_open_sr_load_reports_sr_due_date ON dbo.open_sr_load_reports (sr_due_date DESC);",
    # IX_letter_send_records_fy_format_type
    "IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_letter_send_records_fy_format_type' AND object_id = OBJECT_ID('dbo.letter_send_records')) CREATE NONCLUSTERED INDEX IX_letter_send_records_fy_format_type ON dbo.letter_send_records (financial_year, format_type_id);",
    # IX_followups_user_id_created_at
    "IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_followups_user_id_created_at' AND object_id = OBJECT_ID('dbo.followups')) CREATE NONCLUSTERED INDEX IX_followups_user_id_created_at ON dbo.followups (user_id, created_at);",
    # IX_followups_campaign_id_status
    "IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_followups_campaign_id_status' AND object_id = OBJECT_ID('dbo.followups')) CREATE NONCLUSTERED INDEX IX_followups_campaign_id_status ON dbo.followups (campaign_id, status);",
    # IX_followups_campaign_id_followup_date
    "IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_followups_campaign_id_followup_date' AND object_id = OBJECT_ID('dbo.followups')) CREATE NONCLUSTERED INDEX IX_followups_campaign_id_followup_date ON dbo.followups (campaign_id, followup_date);",
    # IX_non_followups_user_id_created_at
    "IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_non_followups_user_id_created_at' AND object_id = OBJECT_ID('dbo.non_followups')) CREATE NONCLUSTERED INDEX IX_non_followups_user_id_created_at ON dbo.non_followups (user_id, created_at);",
    # IX_users_branch
    "IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_users_branch' AND object_id = OBJECT_ID('dbo.users')) CREATE NONCLUSTERED INDEX IX_users_branch ON dbo.users (branch);",
    # IX_customers_branch_id
    "IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_customers_branch_id' AND object_id = OBJECT_ID('dbo.customers')) CREATE NONCLUSTERED INDEX IX_customers_branch_id ON dbo.customers (branch_id);",
    # IX_campaigns_status
    "IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_campaigns_status' AND object_id = OBJECT_ID('dbo.campaigns')) CREATE NONCLUSTERED INDEX IX_campaigns_status ON dbo.campaigns (status);",
    # IX_campaigns_service_status
    "IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_campaigns_service_status' AND object_id = OBJECT_ID('dbo.campaigns')) CREATE NONCLUSTERED INDEX IX_campaigns_service_status ON dbo.campaigns (service, status);",
    # IX_letter_send_records_sent_by_id
    "IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_letter_send_records_sent_by_id' AND object_id = OBJECT_ID('dbo.letter_send_records')) CREATE NONCLUSTERED INDEX IX_letter_send_records_sent_by_id ON dbo.letter_send_records (sent_by_id);",
    # IX_campaign_csp_info_campaign_id_sr_number
    "IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_campaign_csp_info_campaign_id_sr_number' AND object_id = OBJECT_ID('dbo.campaign_csp_info')) CREATE NONCLUSTERED INDEX IX_campaign_csp_info_campaign_id_sr_number ON dbo.campaign_csp_info (campaign_id, sr_number);",
    # IX_tada_imports_appt_task_engineer
    "IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_tada_imports_appt_task_engineer' AND object_id = OBJECT_ID('dbo.tada_imports')) CREATE NONCLUSTERED INDEX IX_tada_imports_appt_task_engineer ON dbo.tada_imports (appointment_number, task_start_date, service_engineer_name);",
    # IX_tada_imports_engineer_uid_branch
    "IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_tada_imports_engineer_uid_branch' AND object_id = OBJECT_ID('dbo.tada_imports')) CREATE NONCLUSTERED INDEX IX_tada_imports_engineer_uid_branch ON dbo.tada_imports (service_engineer_uid, branch_code);",
    # IX_tada_imports_branch_uploaded
    "IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_tada_imports_branch_uploaded' AND object_id = OBJECT_ID('dbo.tada_imports')) CREATE NONCLUSTERED INDEX IX_tada_imports_branch_uploaded ON dbo.tada_imports (branch_code, uploaded_at);",
    # IX_tada_imports_sdbranch_status
    "IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_tada_imports_sdbranch_status' AND object_id = OBJECT_ID('dbo.tada_imports')) CREATE NONCLUSTERED INDEX IX_tada_imports_sdbranch_status ON dbo.tada_imports (sd_branch_code, verification_status);",
    # IX_tada_history_appt_task_engineer
    "IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_tada_history_appt_task_engineer' AND object_id = OBJECT_ID('dbo.tada_history')) CREATE NONCLUSTERED INDEX IX_tada_history_appt_task_engineer ON dbo.tada_history (appointment_number, task_start_date, service_engineer_name);",
    # IX_tada_history_sdbranch_status_moved
    "IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_tada_history_sdbranch_status_moved' AND object_id = OBJECT_ID('dbo.tada_history')) CREATE NONCLUSTERED INDEX IX_tada_history_sdbranch_status_moved ON dbo.tada_history (sd_branch_code, verification_status, moved_at);",
    # IX_tada_imports_temp_branch_uploaded
    "IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_tada_imports_temp_branch_uploaded' AND object_id = OBJECT_ID('dbo.tada_imports_temp')) CREATE NONCLUSTERED INDEX IX_tada_imports_temp_branch_uploaded ON dbo.tada_imports_temp (branch_code, uploaded_at);",
    # IX_branch_employees_uid_active
    "IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_branch_employees_uid_active' AND object_id = OBJECT_ID('dbo.branch_employees')) CREATE NONCLUSTERED INDEX IX_branch_employees_uid_active ON dbo.branch_employees (employee_uid, is_active);",
    # IX_branch_employees_name_branch
    "IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_branch_employees_name_branch' AND object_id = OBJECT_ID('dbo.branch_employees')) CREATE NONCLUSTERED INDEX IX_branch_employees_name_branch ON dbo.branch_employees (employee_name, branch_code, is_active);",
    # IX_tada_bill_wise_branch_created
    "IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_tada_bill_wise_branch_created' AND object_id = OBJECT_ID('dbo.tada_bill_wise')) CREATE NONCLUSTERED INDEX IX_tada_bill_wise_branch_created ON dbo.tada_bill_wise (branch_code, created_at);",
    # IX_tada_bill_wise_temp_branch_created
    "IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_tada_bill_wise_temp_branch_created' AND object_id = OBJECT_ID('dbo.tada_bill_wise_temp')) CREATE NONCLUSTERED INDEX IX_tada_bill_wise_temp_branch_created ON dbo.tada_bill_wise_temp (branch_code, created_at);",
    # IX_tada_bill_wise_history_branch_moved
    "IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_tada_bill_wise_history_branch_moved' AND object_id = OBJECT_ID('dbo.tada_bill_wise_history')) CREATE NONCLUSTERED INDEX IX_tada_bill_wise_history_branch_moved ON dbo.tada_bill_wise_history (branch_code, moved_at);",
    # IX_office_expenses_branch_deleted_paid
    "IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_office_expenses_branch_deleted_paid' AND object_id = OBJECT_ID('dbo.office_expenses')) CREATE NONCLUSTERED INDEX IX_office_expenses_branch_deleted_paid ON dbo.office_expenses (branch_code, is_deleted, paid_date);",
    # IX_office_expense_temp_branch_deleted_created
    "IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_office_expense_temp_branch_deleted_created' AND object_id = OBJECT_ID('dbo.office_expense_temp')) CREATE NONCLUSTERED INDEX IX_office_expense_temp_branch_deleted_created ON dbo.office_expense_temp (branch_code, is_deleted, created_at);",
    # IX_office_expense_temp_branch_deleted_paid
    "IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_office_expense_temp_branch_deleted_paid' AND object_id = OBJECT_ID('dbo.office_expense_temp')) CREATE NONCLUSTERED INDEX IX_office_expense_temp_branch_deleted_paid ON dbo.office_expense_temp (branch_code, is_deleted, paid_date);",
    # IX_office_expense_history_branch_moved
    "IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_office_expense_history_branch_moved' AND object_id = OBJECT_ID('dbo.office_expense_history')) CREATE NONCLUSTERED INDEX IX_office_expense_history_branch_moved ON dbo.office_expense_history (branch_code, moved_at);",
    # IX_office_expense_history_branch_paid
    "IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_office_expense_history_branch_paid' AND object_id = OBJECT_ID('dbo.office_expense_history')) CREATE NONCLUSTERED INDEX IX_office_expense_history_branch_paid ON dbo.office_expense_history (branch_code, paid_date);",
    # IX_local_vendor_bills_branch_deleted_invdate
    "IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_local_vendor_bills_branch_deleted_invdate' AND object_id = OBJECT_ID('dbo.local_vendor_bills')) CREATE NONCLUSTERED INDEX IX_local_vendor_bills_branch_deleted_invdate ON dbo.local_vendor_bills (branch_code, is_deleted, invoice_date);",
    # IX_local_vendor_bill_temp_branch_deleted_created
    "IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_local_vendor_bill_temp_branch_deleted_created' AND object_id = OBJECT_ID('dbo.local_vendor_bill_temp')) CREATE NONCLUSTERED INDEX IX_local_vendor_bill_temp_branch_deleted_created ON dbo.local_vendor_bill_temp (branch_code, is_deleted, created_at);",
    # IX_local_vendor_bills_history_branch_moved
    "IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_local_vendor_bills_history_branch_moved' AND object_id = OBJECT_ID('dbo.local_vendor_bills_history')) CREATE NONCLUSTERED INDEX IX_local_vendor_bills_history_branch_moved ON dbo.local_vendor_bills_history (branch_code, moved_at);",
    # IX_local_vendor_bills_history_branch_invdate
    "IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_local_vendor_bills_history_branch_invdate' AND object_id = OBJECT_ID('dbo.local_vendor_bills_history')) CREATE NONCLUSTERED INDEX IX_local_vendor_bills_history_branch_invdate ON dbo.local_vendor_bills_history (branch_code, invoice_date);",
    # IX_sales_bm_temp_branch_created
    "IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_sales_bm_temp_branch_created' AND object_id = OBJECT_ID('dbo.sales_bm_temp')) CREATE NONCLUSTERED INDEX IX_sales_bm_temp_branch_created ON dbo.sales_bm_temp (branch_code, created_at);",
    # IX_sales_bm_temp_branch_engineer
    "IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_sales_bm_temp_branch_engineer' AND object_id = OBJECT_ID('dbo.sales_bm_temp')) CREATE NONCLUSTERED INDEX IX_sales_bm_temp_branch_engineer ON dbo.sales_bm_temp (branch_code, engineer_uid);",
    # IX_sales_bm_branch_submitted
    "IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_sales_bm_branch_submitted' AND object_id = OBJECT_ID('dbo.sales_bm')) CREATE NONCLUSTERED INDEX IX_sales_bm_branch_submitted ON dbo.sales_bm (branch_code, submitted_at);",
    # IX_sales_bm_branch_engineer
    "IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_sales_bm_branch_engineer' AND object_id = OBJECT_ID('dbo.sales_bm')) CREATE NONCLUSTERED INDEX IX_sales_bm_branch_engineer ON dbo.sales_bm (branch_code, engineer_uid);",
    # IX_sales_bm_history_branch_moved
    "IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_sales_bm_history_branch_moved' AND object_id = OBJECT_ID('dbo.sales_bm_history')) CREATE NONCLUSTERED INDEX IX_sales_bm_history_branch_moved ON dbo.sales_bm_history (branch_code, moved_at);",
    # IX_tada_imports_uid_name — HO expense branch cards: DISTINCT (uid, name)
    # engineer scans become index-only instead of scanning the wide base table.
    "IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_tada_imports_uid_name' AND object_id = OBJECT_ID('dbo.tada_imports')) CREATE NONCLUSTERED INDEX IX_tada_imports_uid_name ON dbo.tada_imports (service_engineer_uid, service_engineer_name);",
    # IX_tada_imports_uid_summary — HO branch-engineers-summary aggregate:
    # covers the per-branch batched rollup (status/amount/date per engineer).
    "IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_tada_imports_uid_summary' AND object_id = OBJECT_ID('dbo.tada_imports')) CREATE NONCLUSTERED INDEX IX_tada_imports_uid_summary ON dbo.tada_imports (service_engineer_uid) INCLUDE (verification_status, total_amount, sr_reach_at_site_datetime);",
    # IX_tada_history_branch_moved — HO branch-history list: seek on branch and
    # return rows already ordered by moved_at (existing index has
    # verification_status between the two, which blocks the ordered scan).
    "IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_tada_history_branch_moved' AND object_id = OBJECT_ID('dbo.tada_history')) CREATE NONCLUSTERED INDEX IX_tada_history_branch_moved ON dbo.tada_history (sd_branch_code, moved_at DESC);",
    # IX_maintenance_parts_appid_sort — Part Detail Info app-codes list:
    # selectinload fetches parts WHERE app_code_id IN (...) ORDER BY app_code_id,
    # sort_order; this composite returns them pre-sorted with no sort operator.
    "IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_maintenance_parts_appid_sort' AND object_id = OBJECT_ID('dbo.maintenance_parts')) CREATE NONCLUSTERED INDEX IX_maintenance_parts_appid_sort ON dbo.maintenance_parts (app_code_id, sort_order);",
    # IX_maintenance_activity_created_id — Part Detail Info activity report:
    # TOP-N ORDER BY created_at DESC, id DESC becomes an index-only ordered scan
    # (all serialized columns are INCLUDEd, so no key lookups on the base table).
    "IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_maintenance_activity_created_id' AND object_id = OBJECT_ID('dbo.maintenance_activity')) CREATE NONCLUSTERED INDEX IX_maintenance_activity_created_id ON dbo.maintenance_activity (created_at DESC, id DESC) INCLUDE (app_code, employee, engine_model, segment);",
    # IX_mom_meetings_date_id — MOM History list: TOP/ORDER BY date DESC, id DESC
    # becomes an index-ordered scan instead of sorting the whole meetings table.
    "IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_mom_meetings_date_id' AND object_id = OBJECT_ID('dbo.mom_meetings')) CREATE NONCLUSTERED INDEX IX_mom_meetings_date_id ON dbo.mom_meetings (date DESC, id DESC);",
    # IX_mom_meetings_branch_date — branch-filtered History/Reports: seek on the
    # primary branch and return rows already ordered by date DESC, id DESC.
    "IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_mom_meetings_branch_date' AND object_id = OBJECT_ID('dbo.mom_meetings')) CREATE NONCLUSTERED INDEX IX_mom_meetings_branch_date ON dbo.mom_meetings (branch_code, date DESC, id DESC);",
    # IX_mom_rows_meeting_position — selectinload of meeting rows fetches
    # WHERE meeting_id IN (...) ORDER BY position; this composite returns them
    # pre-sorted with no sort operator.
    "IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_mom_rows_meeting_position' AND object_id = OBJECT_ID('dbo.mom_rows')) CREATE NONCLUSTERED INDEX IX_mom_rows_meeting_position ON dbo.mom_rows (meeting_id, position);",
    # IX_mom_attendees_meeting_id — selectinload of attendees fetches
    # WHERE meeting_id IN (...) ORDER BY id; seek on meeting_id, PK gives the order.
    "IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_mom_attendees_meeting_id' AND object_id = OBJECT_ID('dbo.mom_attendees')) CREATE NONCLUSTERED INDEX IX_mom_attendees_meeting_id ON dbo.mom_attendees (meeting_id, id);",
    # IX_asset_detailed_application_code — Part Detail Info app-mapping + coverage
    # commissioning tabs: the GROUP BY over asset application codes (with MAX over
    # engine/segment/kva/commissioning) scans this covering index instead of the
    # wide asset_detailed base table.
    "IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_asset_detailed_application_code' AND object_id = OBJECT_ID('dbo.asset_detailed')) CREATE NONCLUSTERED INDEX IX_asset_detailed_application_code ON dbo.asset_detailed (application_code) INCLUDE (engine_model, segment, kva_rating, commissioning_date, emission_norm);",
    # --- Approval Application: app_no uniqueness that allows draft rows ---
    # SQL Server unique indexes treat NULL as a value, so the plain unique index
    # SQLAlchemy created blocked a SECOND draft (app_no NULL). Replace it with a
    # filtered unique index that only applies to real (numbered) applications.
    "IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'ix_approval_applications_app_no' AND object_id = OBJECT_ID('dbo.approval_applications') AND is_unique = 1) DROP INDEX ix_approval_applications_app_no ON dbo.approval_applications;",
    "IF EXISTS (SELECT 1 FROM sys.key_constraints WHERE name = 'UQ_approval_applications_app_no' AND parent_object_id = OBJECT_ID('dbo.approval_applications')) ALTER TABLE dbo.approval_applications DROP CONSTRAINT UQ_approval_applications_app_no;",
    "IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UX_approval_applications_app_no' AND object_id = OBJECT_ID('dbo.approval_applications')) CREATE UNIQUE NONCLUSTERED INDEX UX_approval_applications_app_no ON dbo.approval_applications (app_no) WHERE app_no IS NOT NULL;",
    # --- HOD category approvers: allow MULTIPLE approvers per category ---
    # The table originally had a unique constraint on category alone (one
    # approver per category). Drop any UQ key constraint and enforce
    # uniqueness per (category, user) via a filtered unique index instead.
    "DECLARE @uq NVARCHAR(256); SELECT TOP 1 @uq = name FROM sys.key_constraints WHERE parent_object_id = OBJECT_ID('dbo.approval_hod_categories') AND type = 'UQ' AND name <> 'uq_apv_hod_br_cat_user'; IF @uq IS NOT NULL EXEC('ALTER TABLE dbo.approval_hod_categories DROP CONSTRAINT [' + @uq + ']');",
    # --- HOD category approvers became PER-BRANCH ---
    "IF COL_LENGTH('dbo.approval_hod_categories', 'branch') IS NULL ALTER TABLE dbo.approval_hod_categories ADD branch NVARCHAR(20) NULL;",
    "IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UX_apv_hod_cat_user' AND object_id = OBJECT_ID('dbo.approval_hod_categories')) DROP INDEX UX_apv_hod_cat_user ON dbo.approval_hod_categories;",
    # legacy company-wide rows (no branch) are cleared — assignments are per branch now
    "DELETE FROM dbo.approval_hod_categories WHERE branch IS NULL;",
    "IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UX_apv_hod_br_cat_user' AND object_id = OBJECT_ID('dbo.approval_hod_categories')) CREATE UNIQUE NONCLUSTERED INDEX UX_apv_hod_br_cat_user ON dbo.approval_hod_categories (branch, category, user_id) WHERE user_id IS NOT NULL AND branch IS NOT NULL;",
    # --- Approver exclusions became CATEGORY-wise: add the column, drop the old
    # 2-column unique constraint, clear legacy category-less rows, and enforce
    # uniqueness on (employee, approver, category) instead.
    "IF COL_LENGTH('dbo.approval_approver_exclusions', 'category') IS NULL ALTER TABLE dbo.approval_approver_exclusions ADD category NVARCHAR(30) NULL;",
    "DECLARE @xq NVARCHAR(256); SELECT TOP 1 @xq = name FROM sys.key_constraints WHERE parent_object_id = OBJECT_ID('dbo.approval_approver_exclusions') AND type = 'UQ' AND name <> 'uq_apv_excl_emp_app_cat'; IF @xq IS NOT NULL EXEC('ALTER TABLE dbo.approval_approver_exclusions DROP CONSTRAINT [' + @xq + ']');",
    "DELETE FROM dbo.approval_approver_exclusions WHERE category IS NULL;",
    "IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UX_apv_excl_emp_app_cat' AND object_id = OBJECT_ID('dbo.approval_approver_exclusions')) CREATE UNIQUE NONCLUSTERED INDEX UX_apv_excl_emp_app_cat ON dbo.approval_approver_exclusions (employee_id, approver_id, category) WHERE category IS NOT NULL;",
    # --- Approval Application hot list paths ---
    # Every view lists ORDER BY created_at DESC, id DESC — ordered scan, no sort.
    "IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_apv_apps_created_id' AND object_id = OBJECT_ID('dbo.approval_applications')) CREATE NONCLUSTERED INDEX IX_apv_apps_created_id ON dbo.approval_applications (created_at DESC, id DESC);",
    # Employee view: own applications newest-first.
    "IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_apv_apps_creator_created' AND object_id = OBJECT_ID('dbo.approval_applications')) CREATE NONCLUSTERED INDEX IX_apv_apps_creator_created ON dbo.approval_applications (created_by, created_at DESC);",
    # Branch admin view: branch scope newest-first.
    "IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_apv_apps_branch_created' AND object_id = OBJECT_ID('dbo.approval_applications')) CREATE NONCLUSTERED INDEX IX_apv_apps_branch_created ON dbo.approval_applications (branch, created_at DESC);",
    # Type tabs / pending queues filter on (request_type, status).
    "IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_apv_apps_type_status' AND object_id = OBJECT_ID('dbo.approval_applications')) CREATE NONCLUSTERED INDEX IX_apv_apps_type_status ON dbo.approval_applications (request_type, status);",
    # Attachment metadata fetch per application (selectinload IN (...) scan).
    "IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_apv_attach_app_meta' AND object_id = OBJECT_ID('dbo.approval_attachments')) CREATE NONCLUSTERED INDEX IX_apv_attach_app_meta ON dbo.approval_attachments (application_id) INCLUDE (original_name, content_type, size_bytes, uploaded_by, created_at);",
    # --- L1..L5 hierarchy: stage approver lookups ---
    # list_applications scopes L2/L3 viewers by the branches they approve for.
    "IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_apv_stage_user_stage' AND object_id = OBJECT_ID('dbo.approval_stage_approvers')) CREATE NONCLUSTERED INDEX IX_apv_stage_user_stage ON dbo.approval_stage_approvers (user_id, stage) INCLUDE (branch);",
    # _available_approvers resolves (branch, stage) on every routing decision.
    "IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_apv_stage_branch_stage' AND object_id = OBJECT_ID('dbo.approval_stage_approvers')) CREATE NONCLUSTERED INDEX IX_apv_stage_branch_stage ON dbo.approval_stage_approvers (branch, stage) INCLUDE (user_id, user_name);",
    # --- Approval Application action paths: pending queues / reroute scans
    #     (status, branch), the list visibility OR-arms (acted-at columns,
    #     HO chosen approvers) and the per-request level lookups ---
    "IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_apv_apps_status_branch' AND object_id = OBJECT_ID('dbo.approval_applications')) CREATE NONCLUSTERED INDEX IX_apv_apps_status_branch ON dbo.approval_applications (status, branch) INCLUDE (category, created_by, created_at);",
    "IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_apv_apps_l4_approver' AND object_id = OBJECT_ID('dbo.approval_applications')) CREATE NONCLUSTERED INDEX IX_apv_apps_l4_approver ON dbo.approval_applications (l4_approver_id) WHERE l4_approver_id IS NOT NULL;",
    "IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_apv_apps_l5_approver' AND object_id = OBJECT_ID('dbo.approval_applications')) CREATE NONCLUSTERED INDEX IX_apv_apps_l5_approver ON dbo.approval_applications (l5_approver_id) WHERE l5_approver_id IS NOT NULL;",
    "IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_apv_apps_l2_action_by' AND object_id = OBJECT_ID('dbo.approval_applications')) CREATE NONCLUSTERED INDEX IX_apv_apps_l2_action_by ON dbo.approval_applications (l2_action_by) WHERE l2_action_by IS NOT NULL;",
    "IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_apv_apps_l3_action_by' AND object_id = OBJECT_ID('dbo.approval_applications')) CREATE NONCLUSTERED INDEX IX_apv_apps_l3_action_by ON dbo.approval_applications (l3_action_by) WHERE l3_action_by IS NOT NULL;",
    "IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_apv_apps_l4_action_by' AND object_id = OBJECT_ID('dbo.approval_applications')) CREATE NONCLUSTERED INDEX IX_apv_apps_l4_action_by ON dbo.approval_applications (l4_action_by) WHERE l4_action_by IS NOT NULL;",
    # resolve_level / _level_user_ids run on EVERY approval request
    "IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_apv_rights_level' AND object_id = OBJECT_ID('dbo.approval_rights')) CREATE NONCLUSTERED INDEX IX_apv_rights_level ON dbo.approval_rights (level) INCLUDE (user_id);",
    # IX_uba_branch — _is_ho_user / _ho_member_ids check HO membership through
    # user_branch_access on nearly every approval request; branch had no index.
    "IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_uba_branch' AND object_id = OBJECT_ID('dbo.user_branch_access')) CREATE NONCLUSTERED INDEX IX_uba_branch ON dbo.user_branch_access (branch) INCLUDE (user_id, branch_name);",
    # Chosen-approver columns used in list_applications' visibility OR —
    # mirrors the existing filtered l4/l5 approver indexes.
    "IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_apv_apps_l2_approver' AND object_id = OBJECT_ID('dbo.approval_applications')) CREATE NONCLUSTERED INDEX IX_apv_apps_l2_approver ON dbo.approval_applications (l2_approver_id) WHERE l2_approver_id IS NOT NULL;",
    "IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_apv_apps_l3_approver' AND object_id = OBJECT_ID('dbo.approval_applications')) CREATE NONCLUSTERED INDEX IX_apv_apps_l3_approver ON dbo.approval_applications (l3_approver_id) WHERE l3_approver_id IS NOT NULL;",
    # viewer-side exclusion lookups (list visibility + can_act flags)
    "IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_apv_excl_approver_cat' AND object_id = OBJECT_ID('dbo.approval_approver_exclusions')) CREATE NONCLUSTERED INDEX IX_apv_excl_approver_cat ON dbo.approval_approver_exclusions (approver_id) INCLUDE (employee_id, category);",
    # --- Note For Approval: the To / CC lists GROW ---
    # Every approver may add recipients when the result mail goes out, and those
    # addresses are appended to the record so the Email Recipients box can show
    # the complete list. NVARCHAR(500) ran out; widen to MAX. Idempotent:
    # max_length = -1 already means MAX.
    "IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.approval_applications') AND name = 'cc_emails' AND max_length <> -1) ALTER TABLE dbo.approval_applications ALTER COLUMN cc_emails NVARCHAR(MAX) NULL;",
    "IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.approval_applications') AND name = 'to_emails' AND max_length <> -1) ALTER TABLE dbo.approval_applications ALTER COLUMN to_emails NVARCHAR(MAX) NULL;",
    # _is_ho_user / _ho_member_ids check branch access on EVERY request
    "IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_uba_branch_user' AND object_id = OBJECT_ID('dbo.user_branch_access')) CREATE NONCLUSTERED INDEX IX_uba_branch_user ON dbo.user_branch_access (branch) INCLUDE (user_id);",
    # --- Note For Approval: remaining hot filters (2026-08-14) ---
    # Status dropdown + newest-first ordering in one seek: the status-filtered
    # lists (pending queues, the Reports status filter) previously seeked on
    # IX_apv_apps_status_branch and then SORTED every match.
    # These three carry KEY columns only, no INCLUDE: the list query selects the
    # whole entity, so a wide covering index could never avoid the key lookups —
    # it would only cost write throughput. The keys alone are what matter, they
    # turn "seek then sort" into "seek, already ordered".
    "IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_apv_apps_status_created' AND object_id = OBJECT_ID('dbo.approval_applications')) CREATE NONCLUSTERED INDEX IX_apv_apps_status_created ON dbo.approval_applications (status, created_at DESC, id DESC);",
    # Type tab + newest-first: IX_apv_apps_type_status covers the filter but not
    # the order, so a type-filtered list still sorted afterwards.
    "IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_apv_apps_type_created' AND object_id = OBJECT_ID('dbo.approval_applications')) CREATE NONCLUSTERED INDEX IX_apv_apps_type_created ON dbo.approval_applications (request_type, created_at DESC, id DESC);",
    # Employee view's visibility arm is created_by + the draft-privacy test on
    # status; the existing creator index carries created_at but not status.
    "IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_apv_apps_creator_status' AND object_id = OBJECT_ID('dbo.approval_applications')) CREATE NONCLUSTERED INDEX IX_apv_apps_creator_status ON dbo.approval_applications (created_by, status, created_at DESC);",
    # The visibility OR also matches on l5_action_by (approved-by-me records);
    # l2/l3/l4 already had their filtered indexes, l5 did not.
    "IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_apv_apps_l5_action_by' AND object_id = OBJECT_ID('dbo.approval_applications')) CREATE NONCLUSTERED INDEX IX_apv_apps_l5_action_by ON dbo.approval_applications (l5_action_by) WHERE l5_action_by IS NOT NULL;",
    # reroute_pending scans the three pending statuses ordered by (status, id)
    # after every Authority Matrix / block / delete change.
    "IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_apv_apps_status_id' AND object_id = OBJECT_ID('dbo.approval_applications')) CREATE NONCLUSTERED INDEX IX_apv_apps_status_id ON dbo.approval_applications (status, id);",
    # list_applications reads the whole HOD-category map per request; this makes
    # it an index-only scan instead of touching the base table.
    "IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_apv_hod_user_cat' AND object_id = OBJECT_ID('dbo.approval_hod_categories')) CREATE NONCLUSTERED INDEX IX_apv_hod_user_cat ON dbo.approval_hod_categories (user_id) INCLUDE (branch, category);",
    # Batched usable-user + name lookup (list_applications' can_act / pending
    # approver names): seek by user_id, name and the two flags come along.
    "IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_users_usable_name' AND object_id = OBJECT_ID('dbo.users')) CREATE NONCLUSTERED INDEX IX_users_usable_name ON dbo.users (user_id) INCLUDE (name, is_blocked, is_deleted, branch);",
    # ONE rights fetch now covers L4 + L5 (was two): seek the level list, the
    # user_id rides along in the leaf.
    "IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_apv_rights_user_level' AND object_id = OBJECT_ID('dbo.approval_rights')) CREATE NONCLUSTERED INDEX IX_apv_rights_user_level ON dbo.approval_rights (user_id) INCLUDE (level, max_discount_percent, max_credit_days, max_expense_amount);",
    # --- Part Detail Info (Master Report) initial-load paths ---
    # newest-first top-N activity log
    "IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_mnt_activity_created_id' AND object_id = OBJECT_ID('dbo.maintenance_activity')) CREATE NONCLUSTERED INDEX IX_mnt_activity_created_id ON dbo.maintenance_activity (created_at DESC, id DESC) INCLUDE (app_code, employee, engine_model, segment);",
    # slim coverage query: DISTINCT (app_code_id, service_hours)
    "IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_mnt_parts_app_hours' AND object_id = OBJECT_ID('dbo.maintenance_parts')) CREATE NONCLUSTERED INDEX IX_mnt_parts_app_hours ON dbo.maintenance_parts (app_code_id, service_hours);",
    # asset_commissioning / app_mapping GROUP BY application_code — scan the
    # narrow index instead of the whole asset_detailed table
    "IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_asset_detailed_appcode' AND object_id = OBJECT_ID('dbo.asset_detailed')) CREATE NONCLUSTERED INDEX IX_asset_detailed_appcode ON dbo.asset_detailed (application_code) INCLUDE (commissioning_date, engine_model, segment, kva_rating, emission_norm);",
    # --- MOM Tracking initial load: newest-first meeting list + the
    #     selectinload child fetches (rows by position, attendees by id) ---
    "IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_mom_meetings_date_id' AND object_id = OBJECT_ID('dbo.mom_meetings')) CREATE NONCLUSTERED INDEX IX_mom_meetings_date_id ON dbo.mom_meetings (date DESC, id DESC);",
    "IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_mom_rows_meeting_pos' AND object_id = OBJECT_ID('dbo.mom_rows')) CREATE NONCLUSTERED INDEX IX_mom_rows_meeting_pos ON dbo.mom_rows (meeting_id, position);",
    "IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_mom_attendees_meeting_id' AND object_id = OBJECT_ID('dbo.mom_attendees')) CREATE NONCLUSTERED INDEX IX_mom_attendees_meeting_id ON dbo.mom_attendees (meeting_id, id);",
    # IX_pms_records_type_cancel_srnum — Employee Productivity report: the
    # DISTINCT labour SR-number scan (record_type + is_cancelled filter)
    # becomes an index-only seek instead of scanning the wide records table.
    "IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_pms_records_type_cancel_srnum' AND object_id = OBJECT_ID('dbo.pms_sales_records')) CREATE NONCLUSTERED INDEX IX_pms_records_type_cancel_srnum ON dbo.pms_sales_records (record_type, is_cancelled, sr_number);",
    # --- EFSR Report: the upsert key became the COMBINATION Service Request No.
    #     + Service Engineer UID (2026-08-13). The first table build enforced
    #     uniqueness on service_request_no ALONE, which now rejects the second
    #     engineer of the same SR — drop it and enforce the pair instead.
    #     Order matters: the old unique index must go before the new one is
    #     created, and both guards make this a no-op on later startups.
    "IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UQ_efsr_report_service_request_no' AND object_id = OBJECT_ID('dbo.efsr_report')) DROP INDEX UQ_efsr_report_service_request_no ON dbo.efsr_report;",
    # --- EFSR Report: the key became Appointment Number + Service Engineer UID
    #     + Task Assigned Date (2026-08-20). The (SR, UID) pair above still
    #     collapsed 7.2-7.6% of every real export, because the file's grain is
    #     one row per TASK ASSIGNMENT: the same engineer is assigned the same
    #     appointment twice (Cancelled, then Completed) and an appointment is
    #     re-assigned between engineers. Verified on the two real files: the
    #     triple below is 100% unique in both, 0 rows lost. See the EFSRReport
    #     docstring for the full measurement.
    #     Order matters, and it is the OPPOSITE of the swap above: the new index
    #     is created FIRST and the old pair index dropped only once it exists.
    #     Each statement runs in its own transaction, so dropping first would
    #     leave the table with no unique index at all if the create then failed.
    #     The drop is therefore guarded on the new index being present.
    #     appointment_number is added and backfilled by ensure_schema(), which
    #     main.py runs BEFORE this — so the column is populated by now.
    "IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UQ_efsr_report_appt_uid_assigned' AND object_id = OBJECT_ID('dbo.efsr_report')) CREATE UNIQUE NONCLUSTERED INDEX UQ_efsr_report_appt_uid_assigned ON dbo.efsr_report (appointment_number, service_engineer_uid, task_assigned_date);",
    "IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UQ_efsr_report_sr_uid' AND object_id = OBJECT_ID('dbo.efsr_report')) AND EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UQ_efsr_report_appt_uid_assigned' AND object_id = OBJECT_ID('dbo.efsr_report')) DROP INDEX UQ_efsr_report_sr_uid ON dbo.efsr_report;",
    # Loading existing rows during an import seeks on the appointment number.
    "IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_efsr_appointment' AND object_id = OBJECT_ID('dbo.efsr_report')) CREATE NONCLUSTERED INDEX IX_efsr_appointment ON dbo.efsr_report (appointment_number) INCLUDE (service_engineer_uid, task_assigned_date);",
    # --- AMC Agreement Expiry Planner: the upsert key is Instance Id +
    #     Agreement Number. create_all builds this with the table, so on a fresh
    #     database the guard makes it a no-op; it is here for a database whose
    #     table was created before the index was declared.
    #     Neither half is unique alone: a genset renews (19.8% of the real
    #     export shares an instance id) and one agreement covers a fleet (1.4%
    #     shares an agreement number). See the AMCExpiryPlanner docstring.
    "IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UQ_amc_expiry_planner_instance_agreement' AND object_id = OBJECT_ID('dbo.amc_expiry_planner')) CREATE UNIQUE NONCLUSTERED INDEX UQ_amc_expiry_planner_instance_agreement ON dbo.amc_expiry_planner (instance_id, agreement_number);",
    # The two report tables gained an instance_id relation; the Customer
    # page and the per-customer data hub both seek on it.
    "IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_cdi_detail_report_instance' AND object_id = OBJECT_ID('dbo.cdi_detail_report')) CREATE NONCLUSTERED INDEX IX_cdi_detail_report_instance ON dbo.cdi_detail_report (instance_id);",
    "IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_efsr_report_instance' AND object_id = OBJECT_ID('dbo.efsr_report')) CREATE NONCLUSTERED INDEX IX_efsr_report_instance ON dbo.efsr_report (instance_id);",
    # The Customer page lists this table soonest-expiry-first.
    "IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_amc_expiry_planner_end_date' AND object_id = OBJECT_ID('dbo.amc_expiry_planner')) CREATE NONCLUSTERED INDEX IX_amc_expiry_planner_end_date ON dbo.amc_expiry_planner (agreement_end_date) INCLUDE (instance_id, branch_id, account_name);",
    # --- LMS Data from Insia: the upsert key is LEAD NUMBER alone. create_all builds the
    #     unique index with the table, so on any database that gets the table
    #     from this release the guard makes it a no-op; it is here for one whose
    #     table was created before the index was declared.
    "IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UQ_lms_insia_lead_number' AND object_id = OBJECT_ID('dbo.lms_insia')) CREATE UNIQUE NONCLUSTERED INDEX UQ_lms_insia_lead_number ON dbo.lms_insia (lead_number);",
    # This file has no genset column: instance_id is resolved from LEAD SR
    # NUMBER at import time, and both the Customer page and the per-instance
    # data hub then seek on it.
    "IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_lms_insia_instance' AND object_id = OBJECT_ID('dbo.lms_insia')) CREATE NONCLUSTERED INDEX IX_lms_insia_instance ON dbo.lms_insia (instance_id);",
    # The import resolves every SR the file mentions back to an instance: the
    # lookup seeks (sr number -> instance id) on each SR table.
    "IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_lms_insia_lead_sr' AND object_id = OBJECT_ID('dbo.lms_insia')) CREATE NONCLUSTERED INDEX IX_lms_insia_lead_sr ON dbo.lms_insia (lead_sr_number) INCLUDE (instance_id);",
    # --- All Invoice Detailed Report: the upsert key is INVOICE NUMBER alone
    #     and it really is unique (30,242 rows -> 30,242 numbers in the real
    #     export). create_all builds this with the table, so on any database
    #     that gets the table from this release the guard makes it a no-op.
    "IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UQ_all_invoice_report_invoice_number' AND object_id = OBJECT_ID('dbo.all_invoice_report')) CREATE UNIQUE NONCLUSTERED INDEX UQ_all_invoice_report_invoice_number ON dbo.all_invoice_report (invoice_number);",
    # The Customer page and the per-instance data hub seek on the genset key
    # (only the file's Service lines carry one).
    "IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_all_invoice_report_instance' AND object_id = OBJECT_ID('dbo.all_invoice_report')) CREATE NONCLUSTERED INDEX IX_all_invoice_report_instance ON dbo.all_invoice_report (instance_id);",
    # The Open Quotation Tracker is ONE grouped scan of this table per
    # read: a period on invoice_date, narrowed to the uncancelled Service
    # lines, grouped by branch and invoice type, summing invoice_amount. The
    # covering index turns that into an index seek instead of a table scan.
    "IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_all_invoice_report_period' AND object_id = OBJECT_ID('dbo.all_invoice_report')) CREATE NONCLUSTERED INDEX IX_all_invoice_report_period ON dbo.all_invoice_report (invoice_date) INCLUDE (invoice_segment, invoice_status, invoice_type, branch_id, branch_name, invoice_amount);",
    # The quote half of the same report groups the pulse quotations by
    # creation_date -> service dealer. Pulse became one row per QUOTATION
    # (it was one per genset), so this table is now several times larger and
    # the period scan needs the index.
    "IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_pulse_quotations_period' AND object_id = OBJECT_ID('dbo.pulse_quotations')) CREATE NONCLUSTERED INDEX IX_pulse_quotations_period ON dbo.pulse_quotations (creation_date) INCLUDE (service_dealer, labor_amount, parts_amount);",
    # The pulse upsert loads a file's existing rows by instance_id and then
    # re-keys them on (instance_id, quote_id).
    "IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_pulse_quotations_instance_quote' AND object_id = OBJECT_ID('dbo.pulse_quotations')) CREATE NONCLUSTERED INDEX IX_pulse_quotations_instance_quote ON dbo.pulse_quotations (instance_id, quote_id);",
]


def ensure_performance_indexes(engine):
    """Create any missing performance indexes. Safe to call on every startup."""
    created = 0
    failed = 0
    for stmt in INDEX_STATEMENTS:
        try:
            with engine.begin() as conn:
                conn.execute(text(stmt))
            created += 1
        except Exception as e:
            failed += 1
            print(f"[perf-indexes] skipped one index: {e}")
    print(f"[perf-indexes] ensured {created} indexes ({failed} skipped)")


# ---------------------------------------------------------------------------
# Schema top-ups: columns the ORM models expect but create_all can't add to an
# EXISTING table. Each entry adds the column when missing and, once (only on the
# add), backfills it from the row's dynamic extra_data JSON — so values already
# imported into extra_data (before the column existed) show up without a
# re-upload. Idempotent: after the column exists, the whole entry is skipped.
# ---------------------------------------------------------------------------
COLUMN_STATEMENTS = [
    # AMC & Bandhan Projection (Annual Reports): the counted figures the report
    # now KEEPS, so a closed year stops decaying once it has been seen, and the
    # best-month high-water mark it raises as branches beat it.
    {
        "name": "pms_amc_targets.prior_by",
        "exists": "SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.pms_amc_targets') AND name = 'prior_by'",
        "add": "ALTER TABLE dbo.pms_amc_targets ADD prior_by VARCHAR(50) NULL",
    },
    {
        "name": "pms_amc_targets.prior_at",
        "exists": "SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.pms_amc_targets') AND name = 'prior_at'",
        "add": "ALTER TABLE dbo.pms_amc_targets ADD prior_at DATETIMEOFFSET NULL",
    },
    {
        "name": "pms_amc_targets.prior_counted_nos",
        "exists": "SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.pms_amc_targets') AND name = 'prior_counted_nos'",
        "add": "ALTER TABLE dbo.pms_amc_targets ADD prior_counted_nos INT NULL",
    },
    {
        "name": "pms_amc_targets.best_nos",
        "exists": "SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.pms_amc_targets') AND name = 'best_nos'",
        "add": "ALTER TABLE dbo.pms_amc_targets ADD best_nos INT NULL",
    },
    {
        "name": "pms_amc_targets.best_month",
        "exists": "SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.pms_amc_targets') AND name = 'best_month'",
        "add": "ALTER TABLE dbo.pms_amc_targets ADD best_month VARCHAR(7) NULL",
    },
    {
        # Note For Approval — extra TO recipients the creator attaches in the
        # submit box (the creator's own address is always a recipient anyway).
        "name": "approval_applications.to_emails",
        "exists": "SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.approval_applications') AND name = 'to_emails'",
        "add": "ALTER TABLE dbo.approval_applications ADD to_emails NVARCHAR(500) NULL",
    },
    # Expense settlement block — who paid and how, who is reimbursed and how
    {
        "name": "approval_applications.paid_by_name",
        "exists": "SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.approval_applications') AND name = 'paid_by_name'",
        "add": "ALTER TABLE dbo.approval_applications ADD paid_by_name NVARCHAR(150) NULL",
    },
    {
        "name": "approval_applications.paid_by_mode",
        "exists": "SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.approval_applications') AND name = 'paid_by_mode'",
        "add": "ALTER TABLE dbo.approval_applications ADD paid_by_mode NVARCHAR(30) NULL",
    },
    {
        "name": "approval_applications.reimburse_to",
        "exists": "SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.approval_applications') AND name = 'reimburse_to'",
        "add": "ALTER TABLE dbo.approval_applications ADD reimburse_to NVARCHAR(150) NULL",
    },
    {
        "name": "approval_applications.reimburse_mode",
        "exists": "SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.approval_applications') AND name = 'reimburse_mode'",
        "add": "ALTER TABLE dbo.approval_applications ADD reimburse_mode NVARCHAR(30) NULL",
    },
    {
        "name": "approval_applications.reimburse_bank_details",
        "exists": "SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.approval_applications') AND name = 'reimburse_bank_details'",
        "add": "ALTER TABLE dbo.approval_applications ADD reimburse_bank_details NVARCHAR(MAX) NULL",
    },
    {
        # PMS upload batches — count of rows updated in place (same CLAIM
        # INVOICE NO re-uploaded later with changed values).
        "name": "pms_upload_batches.updated_rows",
        "exists": "SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.pms_upload_batches') AND name = 'updated_rows'",
        "add": "ALTER TABLE dbo.pms_upload_batches ADD updated_rows INT NOT NULL CONSTRAINT DF_pms_batches_updated_rows DEFAULT 0",
    },
    {
        # PMS sales rows — cancelled-invoice flag: the row stays stored but is
        # excluded from every generated report (set per invoice from the
        # Uploaded File Preview).
        "name": "pms_sales_records.is_cancelled",
        "exists": "SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.pms_sales_records') AND name = 'is_cancelled'",
        "add": "ALTER TABLE dbo.pms_sales_records ADD is_cancelled BIT NOT NULL CONSTRAINT DF_pms_records_is_cancelled DEFAULT 0",
    },
    {
        "name": "pms_sales_records.cancelled_by",
        "exists": "SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.pms_sales_records') AND name = 'cancelled_by'",
        "add": "ALTER TABLE dbo.pms_sales_records ADD cancelled_by NVARCHAR(50) NULL",
    },
    {
        "name": "pms_sales_records.cancelled_at",
        "exists": "SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.pms_sales_records') AND name = 'cancelled_at'",
        "add": "ALTER TABLE dbo.pms_sales_records ADD cancelled_at DATETIME NULL",
    },
    {
        # PMS sales rows — every standard file column becomes a REAL column
        # (no extra_data JSON). Each add backfills once from the legacy
        # extra_data JSON so rows imported earlier keep their values.
        "name": "pms_sales_records.instance_id",
        "exists": "SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.pms_sales_records') AND name = 'instance_id'",
        "add": "ALTER TABLE dbo.pms_sales_records ADD instance_id NVARCHAR(100) NULL",
        "backfill": "UPDATE dbo.pms_sales_records SET instance_id = LEFT(JSON_VALUE(extra_data, '$.\"INSTANCE ID\"'), 100) WHERE extra_data IS NOT NULL AND ISJSON(extra_data) = 1",
    },
    {
        "name": "pms_sales_records.application_code",
        "exists": "SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.pms_sales_records') AND name = 'application_code'",
        "add": "ALTER TABLE dbo.pms_sales_records ADD application_code NVARCHAR(100) NULL",
        "backfill": "UPDATE dbo.pms_sales_records SET application_code = LEFT(JSON_VALUE(extra_data, '$.\"APPLICATION CODE\"'), 100) WHERE extra_data IS NOT NULL AND ISJSON(extra_data) = 1",
    },
    {
        "name": "pms_sales_records.engine_serial_no",
        "exists": "SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.pms_sales_records') AND name = 'engine_serial_no'",
        "add": "ALTER TABLE dbo.pms_sales_records ADD engine_serial_no NVARCHAR(100) NULL",
        "backfill": "UPDATE dbo.pms_sales_records SET engine_serial_no = LEFT(JSON_VALUE(extra_data, '$.\"ENGINE SERIAL NO\"'), 100) WHERE extra_data IS NOT NULL AND ISJSON(extra_data) = 1",
    },
    {
        # part file: 'CLAIM INVOICE SR SUB TYPE' / labour file: 'SR SUBTYPE'
        "name": "pms_sales_records.sr_sub_type",
        "exists": "SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.pms_sales_records') AND name = 'sr_sub_type'",
        "add": "ALTER TABLE dbo.pms_sales_records ADD sr_sub_type NVARCHAR(120) NULL",
        "backfill": "UPDATE dbo.pms_sales_records SET sr_sub_type = LEFT(COALESCE(JSON_VALUE(extra_data, '$.\"CLAIM INVOICE SR SUB TYPE\"'), JSON_VALUE(extra_data, '$.\"SR SUBTYPE\"')), 120) WHERE extra_data IS NOT NULL AND ISJSON(extra_data) = 1",
    },
    {
        "name": "pms_sales_records.category",
        "exists": "SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.pms_sales_records') AND name = 'category'",
        "add": "ALTER TABLE dbo.pms_sales_records ADD category NVARCHAR(100) NULL",
        "backfill": "UPDATE dbo.pms_sales_records SET category = LEFT(JSON_VALUE(extra_data, '$.\"CATEGORY\"'), 100) WHERE extra_data IS NOT NULL AND ISJSON(extra_data) = 1",
    },
    {
        "name": "pms_sales_records.part_category",
        "exists": "SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.pms_sales_records') AND name = 'part_category'",
        "add": "ALTER TABLE dbo.pms_sales_records ADD part_category NVARCHAR(100) NULL",
        "backfill": "UPDATE dbo.pms_sales_records SET part_category = LEFT(JSON_VALUE(extra_data, '$.\"PART CATEGORY\"'), 100) WHERE extra_data IS NOT NULL AND ISJSON(extra_data) = 1",
    },
    {
        "name": "pms_sales_records.part_number",
        "exists": "SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.pms_sales_records') AND name = 'part_number'",
        "add": "ALTER TABLE dbo.pms_sales_records ADD part_number NVARCHAR(120) NULL",
        "backfill": "UPDATE dbo.pms_sales_records SET part_number = LEFT(JSON_VALUE(extra_data, '$.\"PART NUMBER\"'), 120) WHERE extra_data IS NOT NULL AND ISJSON(extra_data) = 1",
    },
    {
        # the standard file itself carries the 'DESCTRIPTION' typo — try both
        "name": "pms_sales_records.part_description",
        "exists": "SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.pms_sales_records') AND name = 'part_description'",
        "add": "ALTER TABLE dbo.pms_sales_records ADD part_description NVARCHAR(255) NULL",
        "backfill": "UPDATE dbo.pms_sales_records SET part_description = LEFT(COALESCE(JSON_VALUE(extra_data, '$.\"PART DESCTRIPTION\"'), JSON_VALUE(extra_data, '$.\"PART DESCRIPTION\"')), 255) WHERE extra_data IS NOT NULL AND ISJSON(extra_data) = 1",
    },
    {
        "name": "pms_sales_records.quantity",
        "exists": "SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.pms_sales_records') AND name = 'quantity'",
        "add": "ALTER TABLE dbo.pms_sales_records ADD quantity FLOAT NULL",
        "backfill": "UPDATE dbo.pms_sales_records SET quantity = TRY_CONVERT(FLOAT, JSON_VALUE(extra_data, '$.\"QUANTITY\"')) WHERE extra_data IS NOT NULL AND ISJSON(extra_data) = 1",
    },
    {
        "name": "pms_sales_records.series",
        "exists": "SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.pms_sales_records') AND name = 'series'",
        "add": "ALTER TABLE dbo.pms_sales_records ADD series NVARCHAR(100) NULL",
        "backfill": "UPDATE dbo.pms_sales_records SET series = LEFT(JSON_VALUE(extra_data, '$.\"SERIES\"'), 100) WHERE extra_data IS NOT NULL AND ISJSON(extra_data) = 1",
    },
    {
        "name": "pms_sales_records.sr_number",
        "exists": "SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.pms_sales_records') AND name = 'sr_number'",
        "add": "ALTER TABLE dbo.pms_sales_records ADD sr_number NVARCHAR(100) NULL",
        "backfill": "UPDATE dbo.pms_sales_records SET sr_number = LEFT(JSON_VALUE(extra_data, '$.\"SR NUMBER\"'), 100) WHERE extra_data IS NOT NULL AND ISJSON(extra_data) = 1",
    },
    {
        # Region-wise working days (MH / KA differ) — legacy working_days
        # stays as the fallback for months saved before the split.
        "name": "pms_month_settings.working_days_mh",
        "exists": "SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.pms_month_settings') AND name = 'working_days_mh'",
        "add": "ALTER TABLE dbo.pms_month_settings ADD working_days_mh INT NULL",
    },
    {
        "name": "pms_month_settings.working_days_ka",
        "exists": "SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.pms_month_settings') AND name = 'working_days_ka'",
        "add": "ALTER TABLE dbo.pms_month_settings ADD working_days_ka INT NULL",
    },
    {
        # CDI 'ACTIVITY END DATE' — the date the Employee Productivity report's
        # CDI (Promotor / Detractor / %) columns are counted on. Backfilled from
        # extra_data at startup for rows imported before the column existed.
        "name": "cdi_detail_report.activity_end_date",
        "exists": "SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.cdi_detail_report') AND name = 'activity_end_date'",
        "add": "ALTER TABLE dbo.cdi_detail_report ADD activity_end_date DATETIME NULL",
    },
    {
        # CDI 'BRANCH NAME' - the branch the feedback belongs to. This file is
        # the one PMS import with no BRANCH ID, so the Customer Delight Index
        # report's branch rows are resolved from this name. Rows imported before
        # the column existed carry it in their extra_data JSON: the one-time
        # backfill below lifts it out, so the report is complete without a
        # re-upload.
        "name": "cdi_detail_report.branch_name",
        "exists": "SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.cdi_detail_report') AND name = 'branch_name'",
        "add": "ALTER TABLE dbo.cdi_detail_report ADD branch_name NVARCHAR(150) NULL",
        "backfill": "UPDATE dbo.cdi_detail_report SET branch_name = LEFT(JSON_VALUE(extra_data, '$.\"BRANCH NAME\"'), 150) WHERE extra_data IS NOT NULL AND ISJSON(extra_data) = 1",
    },
    {
        # CDI 'X ACCOUNT NAME' - the account the feedback is about; the file's customer name.
        "name": "cdi_detail_report.x_account_name",
        "exists": "SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.cdi_detail_report') AND name = 'x_account_name'",
        "add": "ALTER TABLE dbo.cdi_detail_report ADD x_account_name NVARCHAR(500) NULL",
        "backfill": "UPDATE dbo.cdi_detail_report SET x_account_name = LEFT(JSON_VALUE(extra_data, '$.\"X ACCOUNT NAME\"'), 500) WHERE extra_data IS NOT NULL AND ISJSON(extra_data) = 1",
    },
    {
        # CDI 'FEEDBACK TKN CUST NAME' - who answered the survey (reference only).
        "name": "cdi_detail_report.feedback_customer_name",
        "exists": "SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.cdi_detail_report') AND name = 'feedback_customer_name'",
        "add": "ALTER TABLE dbo.cdi_detail_report ADD feedback_customer_name NVARCHAR(500) NULL",
        "backfill": "UPDATE dbo.cdi_detail_report SET feedback_customer_name = LEFT(JSON_VALUE(extra_data, '$.\"FEEDBACK TKN CUST NAME\"'), 500) WHERE extra_data IS NOT NULL AND ISJSON(extra_data) = 1",
    },
    {
        # CDI 'FEEDBACK TKN CUST NUM' - the survey respondent's number (reference only).
        "name": "cdi_detail_report.feedback_customer_number",
        "exists": "SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.cdi_detail_report') AND name = 'feedback_customer_number'",
        "add": "ALTER TABLE dbo.cdi_detail_report ADD feedback_customer_number VARCHAR(50) NULL",
        "backfill": "UPDATE dbo.cdi_detail_report SET feedback_customer_number = LEFT(JSON_VALUE(extra_data, '$.\"FEEDBACK TKN CUST NUM\"'), 50) WHERE extra_data IS NOT NULL AND ISJSON(extra_data) = 1",
    },
    {
        # EFSR 'Account' - the account the task belongs to; feeds the customer master.
        "name": "efsr_report.account",
        "exists": "SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.efsr_report') AND name = 'account'",
        "add": "ALTER TABLE dbo.efsr_report ADD account NVARCHAR(500) NULL",
        "backfill": "UPDATE dbo.efsr_report SET account = LEFT(JSON_VALUE(extra_data, '$.\"Account\"'), 500) WHERE extra_data IS NOT NULL AND ISJSON(extra_data) = 1",
    },
    {
        # EFSR 'Installation Site Address' - where the genset sits; feeds the customer master.
        "name": "efsr_report.installation_site_address",
        "exists": "SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.efsr_report') AND name = 'installation_site_address'",
        "add": "ALTER TABLE dbo.efsr_report ADD installation_site_address NVARCHAR(MAX) NULL",
        "backfill": "UPDATE dbo.efsr_report SET installation_site_address = JSON_VALUE(extra_data, '$.\"Installation Site Address\"') WHERE extra_data IS NOT NULL AND ISJSON(extra_data) = 1",
    },
    {
        # EFSR 'Customer Name' - the on-site contact for this visit (reference only).
        "name": "efsr_report.customer_name",
        "exists": "SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.efsr_report') AND name = 'customer_name'",
        "add": "ALTER TABLE dbo.efsr_report ADD customer_name NVARCHAR(500) NULL",
        "backfill": "UPDATE dbo.efsr_report SET customer_name = LEFT(JSON_VALUE(extra_data, '$.\"Customer Name\"'), 500) WHERE extra_data IS NOT NULL AND ISJSON(extra_data) = 1",
    },
    {
        # EFSR 'Customer contact number' - the on-site contact's number (reference only).
        "name": "efsr_report.customer_contact_number",
        "exists": "SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.efsr_report') AND name = 'customer_contact_number'",
        "add": "ALTER TABLE dbo.efsr_report ADD customer_contact_number VARCHAR(50) NULL",
        "backfill": "UPDATE dbo.efsr_report SET customer_contact_number = LEFT(JSON_VALUE(extra_data, '$.\"Customer contact number\"'), 50) WHERE extra_data IS NOT NULL AND ISJSON(extra_data) = 1",
    },
    {
        # CDI 'ASSET NUMBER' is the genset key - the SAME value the Asset
        # files store as instance_id - so it is the relation from a CDI row to
        # the customers table. It was always in the file but fell through to
        # extra_data as a dynamic column; the backfill lifts every existing
        # row's value out so the link is complete without a re-upload.
        "name": "cdi_detail_report.instance_id",
        "exists": "SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.cdi_detail_report') AND name = 'instance_id'",
        "add": "ALTER TABLE dbo.cdi_detail_report ADD instance_id VARCHAR(100) NULL",
        "backfill": "UPDATE dbo.cdi_detail_report SET instance_id = LEFT(JSON_VALUE(extra_data, '$.\"ASSET NUMBER\"'), 100) WHERE extra_data IS NOT NULL AND ISJSON(extra_data) = 1",
    },
    {
        # EFSR 'Instance ID' - the relation from an eFSR task row to the
        # customers table. Present on 100% of the rows of every real export,
        # but it used to land in extra_data as a dynamic column.
        "name": "efsr_report.instance_id",
        "exists": "SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.efsr_report') AND name = 'instance_id'",
        "add": "ALTER TABLE dbo.efsr_report ADD instance_id VARCHAR(100) NULL",
        "backfill": "UPDATE dbo.efsr_report SET instance_id = LEFT(JSON_VALUE(extra_data, '$.\"Instance ID\"'), 100) WHERE extra_data IS NOT NULL AND ISJSON(extra_data) = 1",
    },
    {
        # EFSR 'Task Assigned Date & Time' — the date an SR was ALLOCATED to the
        # engineer, which the Employee Productivity report's Allocate SR column
        # counts on. The file has always carried it as a dynamic column; rows
        # imported before this get backfilled from extra_data at startup (the
        # value is 'M/D/YYYY, h:mm AM' text, so it is parsed in Python, not SQL).
        "name": "efsr_report.task_assigned_date",
        "exists": "SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.efsr_report') AND name = 'task_assigned_date'",
        "add": "ALTER TABLE dbo.efsr_report ADD task_assigned_date DATETIME NULL",
    },
    {
        # EFSR 'Task End Date' — when the engineer finished the job, which the
        # SR Allocation report counts its Closed SR on. Same story as the
        # assigned date: the file has always carried it as a dynamic column, so
        # rows imported before this get backfilled from extra_data at startup.
        "name": "efsr_report.task_end_date",
        "exists": "SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.efsr_report') AND name = 'task_end_date'",
        "add": "ALTER TABLE dbo.efsr_report ADD task_end_date DATETIME NULL",
    },
    {
        # EFSR 'Appointment Number' — the eFSR task/visit id and the first
        # column of the record key from 2026-08-20. Plain text ('<SR No.>_<n>'),
        # so unlike the two dates above it needs no Python parsing and the
        # backfill out of extra_data runs right here in SQL.
        #
        # The backfill CANNOT collide with the new unique index: existing rows
        # are one per (SR, UID) and an appointment number embeds its SR, so two
        # rows sharing an appointment would have to share (SR, UID) — which the
        # old index already forbade. Rows whose extra_data has no Appointment
        # Number keep NULL; a re-upload of the file fills them in.
        "name": "efsr_report.appointment_number",
        "exists": "SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.efsr_report') AND name = 'appointment_number'",
        "add": "ALTER TABLE dbo.efsr_report ADD appointment_number NVARCHAR(200) NULL",
        "backfill": "UPDATE dbo.efsr_report SET appointment_number = LEFT(JSON_VALUE(extra_data, '$.\"Appointment Number\"'), 200) WHERE extra_data IS NOT NULL AND ISJSON(extra_data) = 1",
    },
    {
        # SE UID Master — which file each engineer came from, cached on the row
        # so the Profile list never has to scan MaxTTR / LMS to render.
        "name": "pms_se_uid_master.src_maxttr",
        "exists": "SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.pms_se_uid_master') AND name = 'src_maxttr'",
        "add": "ALTER TABLE dbo.pms_se_uid_master ADD src_maxttr BIT NOT NULL CONSTRAINT DF_pms_se_uid_src_maxttr DEFAULT 0",
    },
    {
        "name": "pms_se_uid_master.src_lms",
        "exists": "SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.pms_se_uid_master') AND name = 'src_lms'",
        "add": "ALTER TABLE dbo.pms_se_uid_master ADD src_lms BIT NOT NULL CONSTRAINT DF_pms_se_uid_src_lms DEFAULT 0",
    },
    {
        # EFSR Report is the third source: it carries SERVICE ENGINEER NAME and
        # UID together, so the sync learns UIDs from it as well as names.
        "name": "pms_se_uid_master.src_efsr",
        "exists": "SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.pms_se_uid_master') AND name = 'src_efsr'",
        "add": "ALTER TABLE dbo.pms_se_uid_master ADD src_efsr BIT NOT NULL CONSTRAINT DF_pms_se_uid_src_efsr DEFAULT 0",
    },
    {
        # SE UID Master — the engineer's branch, filled by hand on the Profile
        # page. The PMS reports read a branch off the uploaded files first; this
        # is the LAST-RESORT answer for an engineer no file places (an EFSR row
        # can carry another dealer's SD BRANCH CODE, which is no KALA branch).
        # Without it those SRs can only sit under 'Unmapped Branch'.
        "name": "pms_se_uid_master.branch_id",
        "exists": "SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.pms_se_uid_master') AND name = 'branch_id'",
        "add": "ALTER TABLE dbo.pms_se_uid_master ADD branch_id NVARCHAR(100) NULL",
    },
    {
        # LMS 'Labour Invoice Amount' — the file has always carried it, but it
        # was unmapped and landed in extra_data. It feeds the Employee
        # Productivity report's Labour Conv. Amount column; the backfill picks
        # up the value for every lead imported before the column existed.
        "name": "lms_data.labour_invoice_amount",
        "exists": "SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.lms_data') AND name = 'labour_invoice_amount'",
        "add": "ALTER TABLE dbo.lms_data ADD labour_invoice_amount FLOAT NULL",
        "backfill": "UPDATE dbo.lms_data SET labour_invoice_amount = TRY_CONVERT(FLOAT, JSON_VALUE(extra_data, '$.\"Labour Invoice Amount\"')) WHERE extra_data IS NOT NULL AND ISJSON(extra_data) = 1",
    },
    {
        # Kit-level Service Hours — the master file now carries a second
        # "Service Hours" column after the kit's Action; the part's own
        # service_hours keeps driving service mapping / coverage.
        "name": "maintenance_parts.alt_service_hours",
        "exists": "SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.maintenance_parts') AND name = 'alt_service_hours'",
        "add": "ALTER TABLE dbo.maintenance_parts ADD alt_service_hours NVARCHAR(20) NULL",
    },
    {
        # Marks a kit part line the user copied/typed into the kit as a LOOSE
        # addition — the kit's built-in members stay 0/NULL. The edit form lists
        # only these lines under a kit.
        "name": "maintenance_kit_parts.is_loose",
        "exists": "SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.maintenance_kit_parts') AND name = 'is_loose'",
        "add": "ALTER TABLE dbo.maintenance_kit_parts ADD is_loose BIT NULL",
    },
    {
        # Date of the last import in which this SR was present in the file.
        "name": "open_sr_load_reports.last_seen_date",
        "exists": "SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.open_sr_load_reports') AND name = 'last_seen_date'",
        "add": "ALTER TABLE dbo.open_sr_load_reports ADD last_seen_date DATETIME NULL",
    },
    {
        # Approval Application page visibility flag (granted from Profile).
        "name": "users.can_access_approval",
        "exists": "SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.users') AND name = 'can_access_approval'",
        "add": "ALTER TABLE dbo.users ADD can_access_approval BIT NOT NULL CONSTRAINT DF_users_can_access_approval DEFAULT 0",
    },
    {
        # PMS module visibility (all PMS pages), granted from Profile.
        "name": "users.can_access_pms",
        "exists": "SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.users') AND name = 'can_access_pms'",
        "add": "ALTER TABLE dbo.users ADD can_access_pms BIT NOT NULL CONSTRAINT DF_users_can_access_pms DEFAULT 0",
    },
    {
        # AOP & Master rights inside PMS: 'none' | 'view' | 'edit'
        "name": "users.aop_access",
        "exists": "SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.users') AND name = 'aop_access'",
        "add": "ALTER TABLE dbo.users ADD aop_access NVARCHAR(10) NOT NULL CONSTRAINT DF_users_aop_access DEFAULT 'none'",
    },
    {
        # WHICH PMS report pages a user gets: JSON list of page keys.
        # NULL = every page. AOP & Master is not in here (see users.aop_tabs).
        "name": "users.pms_pages",
        "exists": "SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.users') AND name = 'pms_pages'",
        "add": "ALTER TABLE dbo.users ADD pms_pages NVARCHAR(1000) NULL",
    },
    {
        # WHICH sheets of the Annual Reports page a user gets: JSON list of
        # report keys. NULL = every sheet.
        "name": "users.annual_tabs",
        "exists": "SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.users') AND name = 'annual_tabs'",
        "add": "ALTER TABLE dbo.users ADD annual_tabs NVARCHAR(1000) NULL",
    },
    {
        # WHICH AOP & Master tabs a user gets, and at which level:
        # JSON {tab_key: 'view'|'edit'}. NULL = every tab at users.aop_access.
        "name": "users.aop_tabs",
        "exists": "SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.users') AND name = 'aop_tabs'",
        "add": "ALTER TABLE dbo.users ADD aop_tabs NVARCHAR(1000) NULL",
    },
    {
        # Open Quotation Tracker page visibility, granted from Profile.
        "name": "users.can_access_quotation_tracker",
        "exists": "SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.users') AND name = 'can_access_quotation_tracker'",
        "add": "ALTER TABLE dbo.users ADD can_access_quotation_tracker BIT NOT NULL CONSTRAINT DF_users_can_access_quotation_tracker DEFAULT 0",
    },
    {
        # Employee email — approval notification emails go here
        "name": "users.email",
        "exists": "SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.users') AND name = 'email'",
        "add": "ALTER TABLE dbo.users ADD email NVARCHAR(255) NULL",
    },
    {
        # Soft delete flag (Profile -> Delete Employee keeps the row for history)
        "name": "users.is_deleted",
        "exists": "SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.users') AND name = 'is_deleted'",
        "add": "ALTER TABLE dbo.users ADD is_deleted BIT NOT NULL CONSTRAINT DF_users_is_deleted DEFAULT 0",
    },
    {
        "name": "approval_rights.max_discount_percent",
        "exists": "SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.approval_rights') AND name = 'max_discount_percent'",
        "add": "ALTER TABLE dbo.approval_rights ADD max_discount_percent FLOAT NULL",
    },
    {
        "name": "approval_rights.max_credit_days",
        "exists": "SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.approval_rights') AND name = 'max_credit_days'",
        "add": "ALTER TABLE dbo.approval_rights ADD max_credit_days INT NULL",
    },
    {
        "name": "approval_rights.max_expense_amount",
        "exists": "SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.approval_rights') AND name = 'max_expense_amount'",
        "add": "ALTER TABLE dbo.approval_rights ADD max_expense_amount FLOAT NULL",
    },
    {
        "name": "approval_applications.quotation_no",
        "exists": "SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.approval_applications') AND name = 'quotation_no'",
        "add": "ALTER TABLE dbo.approval_applications ADD quotation_no NVARCHAR(100) NULL",
    },
    {
        "name": "approval_applications.discount_percent",
        "exists": "SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.approval_applications') AND name = 'discount_percent'",
        "add": "ALTER TABLE dbo.approval_applications ADD discount_percent FLOAT NULL",
    },
    {
        "name": "approval_applications.credit_days",
        "exists": "SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.approval_applications') AND name = 'credit_days'",
        "add": "ALTER TABLE dbo.approval_applications ADD credit_days INT NULL",
    },
    {
        # Expense applications carry no customer, so the column must allow NULL.
        # 'exists' is satisfied only when the column is ALREADY nullable; until
        # then the 'add' runs the ALTER COLUMN to relax it.
        "name": "approval_applications.customer_name (nullable)",
        "exists": "SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.approval_applications') AND name = 'customer_name' AND is_nullable = 1",
        "add": "ALTER TABLE dbo.approval_applications ALTER COLUMN customer_name NVARCHAR(255) NULL",
    },
    # ------------------------------------------------------------------
    # L1..L5 Approval Hierarchy migration (order matters — renames first,
    # then new columns, then value migrations, then the stage-approver seed).
    # Each entry is idempotent: once the new shape exists it is skipped.
    # ------------------------------------------------------------------
    {
        "name": "approval_applications.branch_action_by -> l2_action_by",
        "exists": "SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.approval_applications') AND name = 'l2_action_by'",
        "add": "EXEC sp_rename 'dbo.approval_applications.branch_action_by', 'l2_action_by', 'COLUMN'",
    },
    {
        "name": "approval_applications.branch_action_by_name -> l2_action_by_name",
        "exists": "SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.approval_applications') AND name = 'l2_action_by_name'",
        "add": "EXEC sp_rename 'dbo.approval_applications.branch_action_by_name', 'l2_action_by_name', 'COLUMN'",
    },
    {
        "name": "approval_applications.branch_action_at -> l2_action_at",
        "exists": "SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.approval_applications') AND name = 'l2_action_at'",
        "add": "EXEC sp_rename 'dbo.approval_applications.branch_action_at', 'l2_action_at', 'COLUMN'",
    },
    {
        "name": "approval_applications.branch_action_remark -> l2_action_remark",
        "exists": "SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.approval_applications') AND name = 'l2_action_remark'",
        "add": "EXEC sp_rename 'dbo.approval_applications.branch_action_remark', 'l2_action_remark', 'COLUMN'",
    },
    {
        "name": "approval_applications.hod_action_by -> l4_action_by",
        "exists": "SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.approval_applications') AND name = 'l4_action_by'",
        "add": "EXEC sp_rename 'dbo.approval_applications.hod_action_by', 'l4_action_by', 'COLUMN'",
    },
    {
        "name": "approval_applications.hod_action_by_name -> l4_action_by_name",
        "exists": "SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.approval_applications') AND name = 'l4_action_by_name'",
        "add": "EXEC sp_rename 'dbo.approval_applications.hod_action_by_name', 'l4_action_by_name', 'COLUMN'",
    },
    {
        "name": "approval_applications.hod_action_at -> l4_action_at",
        "exists": "SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.approval_applications') AND name = 'l4_action_at'",
        "add": "EXEC sp_rename 'dbo.approval_applications.hod_action_at', 'l4_action_at', 'COLUMN'",
    },
    {
        "name": "approval_applications.hod_action_remark -> l4_action_remark",
        "exists": "SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.approval_applications') AND name = 'l4_action_remark'",
        "add": "EXEC sp_rename 'dbo.approval_applications.hod_action_remark', 'l4_action_remark', 'COLUMN'",
    },
    {
        "name": "approval_applications.coo_action_by -> l5_action_by",
        "exists": "SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.approval_applications') AND name = 'l5_action_by'",
        "add": "EXEC sp_rename 'dbo.approval_applications.coo_action_by', 'l5_action_by', 'COLUMN'",
    },
    {
        "name": "approval_applications.coo_action_by_name -> l5_action_by_name",
        "exists": "SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.approval_applications') AND name = 'l5_action_by_name'",
        "add": "EXEC sp_rename 'dbo.approval_applications.coo_action_by_name', 'l5_action_by_name', 'COLUMN'",
    },
    {
        "name": "approval_applications.coo_action_at -> l5_action_at",
        "exists": "SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.approval_applications') AND name = 'l5_action_at'",
        "add": "EXEC sp_rename 'dbo.approval_applications.coo_action_at', 'l5_action_at', 'COLUMN'",
    },
    {
        "name": "approval_applications.coo_action_remark -> l5_action_remark",
        "exists": "SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.approval_applications') AND name = 'l5_action_remark'",
        "add": "EXEC sp_rename 'dbo.approval_applications.coo_action_remark', 'l5_action_remark', 'COLUMN'",
    },
    {
        "name": "approval_applications.l3_action_by",
        "exists": "SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.approval_applications') AND name = 'l3_action_by'",
        "add": "ALTER TABLE dbo.approval_applications ADD l3_action_by NVARCHAR(50) NULL",
    },
    {
        "name": "approval_applications.l3_action_by_name",
        "exists": "SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.approval_applications') AND name = 'l3_action_by_name'",
        "add": "ALTER TABLE dbo.approval_applications ADD l3_action_by_name NVARCHAR(100) NULL",
    },
    {
        "name": "approval_applications.l3_action_at",
        "exists": "SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.approval_applications') AND name = 'l3_action_at'",
        "add": "ALTER TABLE dbo.approval_applications ADD l3_action_at DATETIME NULL",
    },
    {
        "name": "approval_applications.l3_action_remark",
        "exists": "SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.approval_applications') AND name = 'l3_action_remark'",
        "add": "ALTER TABLE dbo.approval_applications ADD l3_action_remark NVARCHAR(MAX) NULL",
    },
    {
        "name": "approval_applications.auto_approved",
        "exists": "SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.approval_applications') AND name = 'auto_approved'",
        "add": "ALTER TABLE dbo.approval_applications ADD auto_approved BIT NOT NULL CONSTRAINT DF_apv_apps_auto_approved DEFAULT 0",
    },
    {
        "name": "approval_applications.l2_approver_id",
        "exists": "SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.approval_applications') AND name = 'l2_approver_id'",
        "add": "ALTER TABLE dbo.approval_applications ADD l2_approver_id NVARCHAR(50) NULL",
    },
    {
        "name": "approval_applications.l2_approver_name",
        "exists": "SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.approval_applications') AND name = 'l2_approver_name'",
        "add": "ALTER TABLE dbo.approval_applications ADD l2_approver_name NVARCHAR(100) NULL",
    },
    {
        "name": "approval_applications.l3_approver_id",
        "exists": "SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.approval_applications') AND name = 'l3_approver_id'",
        "add": "ALTER TABLE dbo.approval_applications ADD l3_approver_id NVARCHAR(50) NULL",
    },
    {
        "name": "approval_applications.l3_approver_name",
        "exists": "SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.approval_applications') AND name = 'l3_approver_name'",
        "add": "ALTER TABLE dbo.approval_applications ADD l3_approver_name NVARCHAR(100) NULL",
    },
    {
        "name": "approval_applications.l4_approver_id",
        "exists": "SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.approval_applications') AND name = 'l4_approver_id'",
        "add": "ALTER TABLE dbo.approval_applications ADD l4_approver_id NVARCHAR(50) NULL",
    },
    {
        "name": "approval_applications.l4_approver_name",
        "exists": "SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.approval_applications') AND name = 'l4_approver_name'",
        "add": "ALTER TABLE dbo.approval_applications ADD l4_approver_name NVARCHAR(100) NULL",
    },
    {
        "name": "approval_applications.l5_approver_id",
        "exists": "SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.approval_applications') AND name = 'l5_approver_id'",
        "add": "ALTER TABLE dbo.approval_applications ADD l5_approver_id NVARCHAR(50) NULL",
    },
    {
        "name": "approval_applications.l5_approver_name",
        "exists": "SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.approval_applications') AND name = 'l5_approver_name'",
        "add": "ALTER TABLE dbo.approval_applications ADD l5_approver_name NVARCHAR(100) NULL",
    },
    # Multi-select chosen approvers (2026-08-11): the l*_approver_id/name
    # columns now hold CSV lists — widen them. 'exists' passes only once the
    # column is already wide (max_length is BYTES: NVARCHAR(500) = 1000).
    #
    # The four *_approver_id columns each carry a FILTERED index
    # (IX_apv_apps_l*_approver ... WHERE col IS NOT NULL). A filtered index
    # whose predicate references the column BLOCKS ALTER COLUMN outright
    # (errors 5074 + 4922) — unlike an ordinary index, which does allow a
    # var-length widen. So for those columns the index is dropped, the column
    # widened, and the index recreated in one batch. The *_approver_name
    # columns have no index and widen directly.
    *[
        {
            "name": f"approval_applications.{col} widen to NVARCHAR({size})",
            "exists": f"SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.approval_applications') AND name = '{col}' AND max_length >= {size * 2}",
            "add": (
                (
                    f"IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = '{idx}' "
                    f"AND object_id = OBJECT_ID('dbo.approval_applications')) "
                    f"DROP INDEX {idx} ON dbo.approval_applications; "
                    f"ALTER TABLE dbo.approval_applications ALTER COLUMN {col} NVARCHAR({size}) NULL; "
                    f"CREATE NONCLUSTERED INDEX {idx} ON dbo.approval_applications ({col}) "
                    f"WHERE {col} IS NOT NULL;"
                ) if idx else
                f"ALTER TABLE dbo.approval_applications ALTER COLUMN {col} NVARCHAR({size}) NULL"
            ),
        }
        for col, size, idx in [
            ("l2_approver_id", 500, "IX_apv_apps_l2_approver"),
            ("l2_approver_name", 1000, None),
            ("l3_approver_id", 500, "IX_apv_apps_l3_approver"),
            ("l3_approver_name", 1000, None),
            ("l4_approver_id", 500, "IX_apv_apps_l4_approver"),
            ("l4_approver_name", 1000, None),
            ("l5_approver_id", 500, "IX_apv_apps_l5_approver"),
            ("l5_approver_name", 1000, None),
        ]
    ],
    {
        "name": "approval_employee_rules.require_branch -> require_l2",
        "exists": "SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.approval_employee_rules') AND name = 'require_l2'",
        "add": "EXEC sp_rename 'dbo.approval_employee_rules.require_branch', 'require_l2', 'COLUMN'",
    },
    {
        "name": "approval_employee_rules.require_hod -> require_l4",
        "exists": "SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.approval_employee_rules') AND name = 'require_l4'",
        "add": "EXEC sp_rename 'dbo.approval_employee_rules.require_hod', 'require_l4', 'COLUMN'",
    },
    {
        "name": "approval_employee_rules.require_l3",
        "exists": "SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.approval_employee_rules') AND name = 'require_l3'",
        "add": "ALTER TABLE dbo.approval_employee_rules ADD require_l3 BIT NOT NULL CONSTRAINT DF_apv_rules_require_l3 DEFAULT 1",
    },
    {
        # legacy level names (user/branch/hod/coo) -> l1..l5
        "name": "approval_rights.level values -> l1..l5",
        "exists": "SELECT 1 WHERE NOT EXISTS (SELECT 1 FROM dbo.approval_rights WHERE level IN ('user','branch','hod','coo'))",
        "add": "UPDATE dbo.approval_rights SET level = CASE level WHEN 'user' THEN 'l1' WHEN 'branch' THEN 'l2' WHEN 'hod' THEN 'l4' WHEN 'coo' THEN 'l5' ELSE level END WHERE level IN ('user','branch','hod','coo')",
    },
    {
        "name": "approval_applications.status values -> pending_l2/l4/l5",
        "exists": "SELECT 1 WHERE NOT EXISTS (SELECT 1 FROM dbo.approval_applications WHERE status IN ('pending_branch','pending_hod','pending_coo'))",
        "add": "UPDATE dbo.approval_applications SET status = CASE status WHEN 'pending_branch' THEN 'pending_l2' WHEN 'pending_hod' THEN 'pending_l4' WHEN 'pending_coo' THEN 'pending_l5' ELSE status END WHERE status IN ('pending_branch','pending_hod','pending_coo')",
    },
    {
        "name": "approval_applications.created_by_level values -> l1..l5",
        "exists": "SELECT 1 WHERE NOT EXISTS (SELECT 1 FROM dbo.approval_applications WHERE created_by_level IN ('user','branch','hod','coo'))",
        "add": "UPDATE dbo.approval_applications SET created_by_level = CASE created_by_level WHEN 'user' THEN 'l1' WHEN 'branch' THEN 'l2' WHEN 'hod' THEN 'l4' WHEN 'coo' THEN 'l5' ELSE created_by_level END WHERE created_by_level IN ('user','branch','hod','coo')",
    },
    {
        "name": "approval_applications.rejected_at_level values -> l2/l4/l5",
        "exists": "SELECT 1 WHERE NOT EXISTS (SELECT 1 FROM dbo.approval_applications WHERE rejected_at_level IN ('branch','hod','coo'))",
        "add": "UPDATE dbo.approval_applications SET rejected_at_level = CASE rejected_at_level WHEN 'branch' THEN 'l2' WHEN 'hod' THEN 'l4' WHEN 'coo' THEN 'l5' ELSE rejected_at_level END WHERE rejected_at_level IN ('branch','hod','coo')",
    },
    {
        # Stage approvers are chosen MANUALLY in the Employee Hierarchy tab —
        # nothing is auto-assigned. Remove any rows an earlier auto-seed
        # created (only seeded rows carry updated_by NULL; UI-made rows always
        # store the admin who set them).
        "name": "approval_stage_approvers remove auto-seeded rows",
        "exists": "SELECT 1 WHERE NOT EXISTS (SELECT 1 FROM dbo.approval_stage_approvers WHERE updated_by IS NULL)",
        "add": "DELETE FROM dbo.approval_stage_approvers WHERE updated_by IS NULL",
    },
    {
        # One-time seed: the five level rows (names + level-wise limits) of the
        # Authority Limit tab. Limits start empty (= 0); the COO fills them in.
        "name": "approval_level_configs default rows",
        "exists": "SELECT 1 WHERE EXISTS (SELECT 1 FROM dbo.approval_level_configs)",
        "add": (
            "INSERT INTO dbo.approval_level_configs (level, display_name, created_at) VALUES "
            "('l1', 'Employee', GETDATE()), "
            "('l2', 'Approver', GETDATE()), "
            "('l3', 'Approver', GETDATE()), "
            "('l4', 'HOD', GETDATE()), "
            "('l5', 'COO', GETDATE())"
        ),
    },
    {
        # CC addresses the creator attaches at submit — auto-added to the
        # result email's CC on approval / rejection
        "name": "approval_applications.cc_emails",
        "exists": "SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.approval_applications') AND name = 'cc_emails'",
        "add": "ALTER TABLE dbo.approval_applications ADD cc_emails NVARCHAR(500) NULL",
    },
    {
        # Level limits became PER BRANCH: branch NULL = global name row,
        # branch set = that branch row's L1..L4 limits (fresh rows start 0).
        "name": "approval_level_configs.branch",
        "exists": "SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.approval_level_configs') AND name = 'branch'",
        "add": "ALTER TABLE dbo.approval_level_configs ADD branch NVARCHAR(20) NULL",
    },
    {
        # uniqueness moved from (level) to (branch, level)
        "name": "approval_level_configs unique (branch, level)",
        "exists": "SELECT 1 FROM sys.indexes WHERE name = 'UX_apv_lvl_cfg_br' AND object_id = OBJECT_ID('dbo.approval_level_configs')",
        "add": ("DECLARE @lq NVARCHAR(256); SELECT TOP 1 @lq = name FROM sys.key_constraints "
                "WHERE parent_object_id = OBJECT_ID('dbo.approval_level_configs') AND type = 'UQ'; "
                "IF @lq IS NOT NULL EXEC('ALTER TABLE dbo.approval_level_configs DROP CONSTRAINT [' + @lq + ']'); "
                "CREATE UNIQUE NONCLUSTERED INDEX UX_apv_lvl_cfg_br ON dbo.approval_level_configs (branch, level)"),
    },
    {
        # Expense NFAs select MULTIPLE types — the column stores the combined
        # breakdown text ("Food: 500; Travel: 1000"), so widen it.
        "name": "approval_applications.expense_type widen to 400",
        "exists": "SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.approval_applications') AND name = 'expense_type' AND max_length >= 800",
        "add": "ALTER TABLE dbo.approval_applications ALTER COLUMN expense_type NVARCHAR(400) NULL",
    },
    {
        "name": "asset_detailed.emission_norm",
        "exists": "SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.asset_detailed') AND name = 'emission_norm'",
        "add": "ALTER TABLE dbo.asset_detailed ADD emission_norm NVARCHAR(100) NULL",
        # Pull 'EMISSION NORM' out of the extra_data JSON for rows imported before
        # the column existed. ISJSON guards non-JSON text; LEFT caps to the width.
        "backfill": (
            "UPDATE dbo.asset_detailed "
            "SET emission_norm = LEFT(JSON_VALUE(extra_data, '$.\"EMISSION NORM\"'), 100) "
            "WHERE extra_data IS NOT NULL AND ISJSON(extra_data) = 1 "
            "AND JSON_VALUE(extra_data, '$.\"EMISSION NORM\"') IS NOT NULL"
        ),
    },
    # ---- Welcome Letter: attachments live IN the database, not on disk ----
    {
        "name": "welcome_letter_attachments.file_data",
        "exists": "SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.welcome_letter_attachments') AND name = 'file_data'",
        "add": "ALTER TABLE dbo.welcome_letter_attachments ADD file_data VARBINARY(MAX) NULL",
    },
    {
        "name": "welcome_letter_attachments.content_type",
        "exists": "SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.welcome_letter_attachments') AND name = 'content_type'",
        "add": "ALTER TABLE dbo.welcome_letter_attachments ADD content_type NVARCHAR(150) NULL",
    },
    {
        "name": "welcome_letter_attachments.file_size",
        "exists": "SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.welcome_letter_attachments') AND name = 'file_size'",
        "add": "ALTER TABLE dbo.welcome_letter_attachments ADD file_size INT NULL",
    },
    {
        # stored_path was NOT NULL when files lived on disk — files now go to
        # file_data, so the legacy column must accept NULL.
        "name": "welcome_letter_attachments.stored_path nullable",
        "exists": "SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.welcome_letter_attachments') AND name = 'stored_path' AND is_nullable = 1",
        "add": "ALTER TABLE dbo.welcome_letter_attachments ALTER COLUMN stored_path NVARCHAR(500) NULL",
    },
    {
        # The sender now ticks which master attachments go out, so the report
        # cannot recompute the count — it is stamped on the entry at send time.
        "name": "welcome_letter_entries.attachments_sent",
        "exists": "SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.welcome_letter_entries') AND name = 'attachments_sent'",
        "add": "ALTER TABLE dbo.welcome_letter_entries ADD attachments_sent INT NULL",
    },
    {
        # MOM rows — when the point's definition was last rewritten by a Master
        # Admin editing a past meeting. NULL on every existing row (never
        # edited), so the carry-forward keeps reading them as of their meeting.
        "name": "mom_rows.edited_at",
        "exists": "SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.mom_rows') AND name = 'edited_at'",
        "add": "ALTER TABLE dbo.mom_rows ADD edited_at DATETIME NULL",
    },
    # ---- Response Time & MaxTTR: the two SR TASK dates ----
    # SR TASK END DATE is what Employee Productivity now counts "Days present on
    # Task end" on, so the column has to exist before the report runs. Both are
    # canonical file columns (never stored in extra_data), so there is nothing to
    # backfill — a DB created before they were added just gets them empty until
    # the file is re-uploaded.
    {
        "name": "response_time_maxttr.sr_task_start_date",
        "exists": "SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.response_time_maxttr') AND name = 'sr_task_start_date'",
        "add": "ALTER TABLE dbo.response_time_maxttr ADD sr_task_start_date DATETIME NULL",
    },
    {
        "name": "response_time_maxttr.sr_task_end_date",
        "exists": "SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.response_time_maxttr') AND name = 'sr_task_end_date'",
        "add": "ALTER TABLE dbo.response_time_maxttr ADD sr_task_end_date DATETIME NULL",
    },
    # ---- Training Report: CURRENT STATUS (Active / Inactive) ----
    # The ninth fixed column. A file uploaded BEFORE the column existed kept it
    # in extra_data, so the one-time backfill lifts it out and normalises the
    # spelling the same way the importer does — the report shows who has left
    # without waiting for a re-upload.
    {
        "name": "pms_training_records.current_status",
        "exists": "SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.pms_training_records') AND name = 'current_status'",
        "add": "ALTER TABLE dbo.pms_training_records ADD current_status NVARCHAR(30) NULL",
        "backfill": (
            "UPDATE dbo.pms_training_records SET current_status = CASE "
            "WHEN UPPER(REPLACE(REPLACE(LTRIM(RTRIM(JSON_VALUE(extra_data, '$.\"CURRENT STATUS\"'))), ' ', ''), '-', '')) "
            "     IN ('ACTIVE','WORKING','SERVING','A','YES','Y','1') THEN 'Active' "
            "WHEN UPPER(REPLACE(REPLACE(LTRIM(RTRIM(JSON_VALUE(extra_data, '$.\"CURRENT STATUS\"'))), ' ', ''), '-', '')) "
            "     IN ('INACTIVE','LEFT','RESIGNED','EXIT','EXITED','SEPARATED','TERMINATED','I','NO','N','0') THEN 'Inactive' "
            "ELSE NULL END "
            "WHERE extra_data IS NOT NULL AND ISJSON(extra_data) = 1"
        ),
    },
]


def ensure_schema(engine):
    """Add any missing ORM columns to existing tables. Safe on every startup."""
    for st in COLUMN_STATEMENTS:
        try:
            with engine.begin() as conn:
                if conn.execute(text(st["exists"])).first():
                    continue  # already present — nothing to do
                conn.execute(text(st["add"]))
                if st.get("backfill"):
                    try:
                        conn.execute(text(st["backfill"]))
                    except Exception as e:
                        print(f"[schema] backfill skipped for {st['name']}: {e}")
            print(f"[schema] added column {st['name']}")
        except Exception as e:
            print(f"[schema] skipped {st['name']}: {e}")


# ---------------------------------------------------------------------------
# Table renames: a table whose __tablename__ changed must be RENAMED (data and
# all) before create_all runs — otherwise create_all quietly creates a second,
# empty table under the new name and every existing row is orphaned. So
# ensure_table_renames() is called from main.py BEFORE Base.metadata.create_all.
#
# Idempotent: the rename fires only while the OLD table still exists and the NEW
# one does not, so restarts after the first run are no-ops.
# ---------------------------------------------------------------------------
TABLE_RENAMES = [
    {
        # 2026-08-13: the import file is called "MaxTTR - Oil Change SR Zero
        # Labour Flag" everywhere in the UI — the table now matches the file
        # instead of the old internal name "Open SR Data".
        "name": "open_sr_data -> maxttr_oil_change_sr_zero_labour_flag",
        "old": "open_sr_data",
        "new": "maxttr_oil_change_sr_zero_labour_flag",
        # index renames applied AFTER the table rename (old index name -> new)
        "indexes": [
            ("UQ_open_sr_data_instance_sr", "UQ_maxttr_oil_change_sr_instance_sr"),
            ("ix_open_sr_data_updated_at", "ix_maxttr_oil_change_sr_updated_at"),
        ],
    },
]


def ensure_table_renames(engine):
    """Rename tables whose __tablename__ changed. MUST run before create_all."""
    for tr in TABLE_RENAMES:
        old, new = tr["old"], tr["new"]
        try:
            with engine.begin() as conn:
                exists = conn.execute(text(
                    "SELECT CASE WHEN OBJECT_ID('dbo.' + :old, 'U') IS NOT NULL THEN 1 ELSE 0 END, "
                    "       CASE WHEN OBJECT_ID('dbo.' + :new, 'U') IS NOT NULL THEN 1 ELSE 0 END"
                ), {"old": old, "new": new}).first()
                old_exists, new_exists = bool(exists[0]), bool(exists[1])

                if not old_exists:
                    continue  # already renamed (or nothing to rename yet)

                if new_exists:
                    # Both tables exist: an earlier startup ran create_all before
                    # (or instead of) the rename and made an EMPTY new table while
                    # the real rows stayed behind. Drop that empty shell and rename
                    # properly. A NON-empty new table is left alone — that would be
                    # real data and needs a human.
                    rows = conn.execute(text(f"SELECT COUNT(*) FROM dbo.{new}")).scalar()
                    if rows:
                        print(f"[table-rename] {tr['name']}: BOTH tables exist and "
                              f"dbo.{new} holds {rows} rows — merge them manually.")
                        continue
                    conn.execute(text(f"DROP TABLE dbo.{new}"))
                    print(f"[table-rename] dropped empty dbo.{new} shell before renaming")

                conn.execute(text(f"EXEC sp_rename 'dbo.{old}', '{new}'"))

                # Indexes keep their old names after a table rename — rename the
                # ones the model now declares so the names stay meaningful.
                for old_ix, new_ix in tr.get("indexes", []):
                    try:
                        conn.execute(text(
                            f"IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = '{old_ix}' "
                            f"AND object_id = OBJECT_ID('dbo.{new}')) "
                            f"EXEC sp_rename 'dbo.{new}.{old_ix}', '{new_ix}', 'INDEX'"
                        ))
                    except Exception as e:
                        print(f"[table-rename] index {old_ix} skipped: {e}")

            print(f"[table-rename] {tr['name']}")
        except Exception as e:
            print(f"[table-rename] skipped {tr['name']}: {e}")
