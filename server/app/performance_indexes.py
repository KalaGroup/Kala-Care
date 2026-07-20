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
    # IX_asset_detailed_application_code — Part Detail Info app-mapping + coverage
    # commissioning tabs: the GROUP BY over asset application codes (with MAX over
    # engine/segment/kva/commissioning) scans this covering index instead of the
    # wide asset_detailed base table.
    "IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_asset_detailed_application_code' AND object_id = OBJECT_ID('dbo.asset_detailed')) CREATE NONCLUSTERED INDEX IX_asset_detailed_application_code ON dbo.asset_detailed (application_code) INCLUDE (engine_model, segment, kva_rating, commissioning_date, emission_norm);",
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
