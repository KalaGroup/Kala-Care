/* =============================================================================
   Profile → CDB Update (customer_edit_history) — recommended indexes
   -----------------------------------------------------------------------------
   Run ONCE in SQL Server Management Studio against the KalaCare database.
   Safe to re-run (guarded by IF NOT EXISTS). Replace dbo. if your schema differs.

   The CDB Update table loads via GET /v1/edit-customer/edited-customers, which:
     1) SELECTs DISTINCT customer_id WHERE is_deleted = 0
     2) fetches each customer's full edit history ORDER BY last_edited_at DESC
   The scheduled 10-day report also filters by created_at.
   customer_id and instance_id are already indexed by the app; the composites
   below cover the is_deleted filter, the per-customer ordered fetch, and the
   date-range report.
   ============================================================================= */

/* Distinct edited customers: WHERE is_deleted = 0  (covers customer_id too) */
IF NOT EXISTS (SELECT 1 FROM sys.indexes
               WHERE name = 'IX_cust_edit_hist_deleted_customer'
                 AND object_id = OBJECT_ID('dbo.customer_edit_history'))
    CREATE NONCLUSTERED INDEX IX_cust_edit_hist_deleted_customer
        ON dbo.customer_edit_history (is_deleted, customer_id);
GO

/* Per-customer history, newest first: WHERE customer_id IN (...) ORDER BY last_edited_at DESC */
IF NOT EXISTS (SELECT 1 FROM sys.indexes
               WHERE name = 'IX_cust_edit_hist_customer_edited'
                 AND object_id = OBJECT_ID('dbo.customer_edit_history'))
    CREATE NONCLUSTERED INDEX IX_cust_edit_hist_customer_edited
        ON dbo.customer_edit_history (customer_id, last_edited_at DESC);
GO

/* 10-day edit-history email report: WHERE created_at BETWEEN ... */
IF NOT EXISTS (SELECT 1 FROM sys.indexes
               WHERE name = 'IX_cust_edit_hist_created'
                 AND object_id = OBJECT_ID('dbo.customer_edit_history'))
    CREATE NONCLUSTERED INDEX IX_cust_edit_hist_created
        ON dbo.customer_edit_history (created_at);
GO
