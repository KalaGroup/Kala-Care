/* =============================================================================
   Part Detail Info (Maintenance) — recommended indexes
   -----------------------------------------------------------------------------
   Run these ONCE in SQL Server Management Studio against the KalaCare database.
   Safe to re-run (each is guarded by IF NOT EXISTS).
   If your schema is not "dbo", replace dbo. with your schema name.

   Context:
   - GET /maintenance/app-codes loads every application code + its parts. The
     backend now eager-loads parts in ONE query:
       SELECT ... FROM maintenance_parts WHERE app_code_id IN (...) ORDER BY sort_order
     The covering index below lets SQL Server answer that entirely from the index
     (no lookups into the base table).
   - GET /maintenance/activity returns the newest look-ups:
       ... ORDER BY created_at DESC, id DESC  (TOP N)
     The second index serves that sort + TOP directly.
   ============================================================================= */

/* ---- maintenance_parts: covering index for the parts eager-load ----------- */
IF NOT EXISTS (SELECT 1 FROM sys.indexes
               WHERE name = 'IX_maintenance_parts_app_cover'
                 AND object_id = OBJECT_ID('dbo.maintenance_parts'))
    CREATE NONCLUSTERED INDEX IX_maintenance_parts_app_cover
        ON dbo.maintenance_parts (app_code_id, sort_order)
        INCLUDE (part_number, part_desc, qty, action,
                 alt_part_no, alt_desc, alt_qty, alt_action,
                 service_hours, consumable, schedule);
GO

/* ---- maintenance_activity: newest-first look-up report -------------------- */
IF NOT EXISTS (SELECT 1 FROM sys.indexes
               WHERE name = 'IX_maintenance_activity_created'
                 AND object_id = OBJECT_ID('dbo.maintenance_activity'))
    CREATE NONCLUSTERED INDEX IX_maintenance_activity_created
        ON dbo.maintenance_activity (created_at DESC, id DESC)
        INCLUDE (app_code, employee, engine_model, segment);
GO

/* Notes:
   - maintenance_app_codes.app_code is already UNIQUE + indexed (serves the
     ORDER BY app_code list and all code lookups) — no extra index needed there.
   - maintenance_parts already had a plain index on app_code_id; the covering
     index above supersedes it for reads. The old one is harmless to keep. */
