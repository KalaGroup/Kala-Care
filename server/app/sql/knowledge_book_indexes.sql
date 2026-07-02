/* =============================================================================
   Knowledge Bank (Knowledge Book) — recommended indexes
   -----------------------------------------------------------------------------
   Run these ONCE in SQL Server Management Studio against the KalaCare database.
   They are safe to re-run (each is guarded by IF NOT EXISTS).

   Why these help:
   - The listing queries filter by folder_id / parent_id / category_id and often
     by is_hidden, then sort by name. These COVERING indexes let SQL Server
     answer the whole list from the index WITHOUT touching the base table (so it
     never reads the large file-bytes `data` column at all).
   - If your schema is not "dbo", replace dbo. with your schema name.
   ============================================================================= */

/* ---- kb_files: folder listing (list_contents, visibility checks) ---------- */
IF NOT EXISTS (SELECT 1 FROM sys.indexes
               WHERE name = 'IX_kb_files_folder'
                 AND object_id = OBJECT_ID('dbo.kb_files'))
    CREATE NONCLUSTERED INDEX IX_kb_files_folder
        ON dbo.kb_files (folder_id, original_name)
        INCLUDE (is_hidden, kind, description, category_id, size_bytes, created_at);
GO

/* ---- kb_files: "All Files" tab (list_all_files, filter by category) ------- */
IF NOT EXISTS (SELECT 1 FROM sys.indexes
               WHERE name = 'IX_kb_files_category'
                 AND object_id = OBJECT_ID('dbo.kb_files'))
    CREATE NONCLUSTERED INDEX IX_kb_files_category
        ON dbo.kb_files (category_id, original_name)
        INCLUDE (is_hidden, kind, description, size_bytes, folder_id, created_at);
GO

/* ---- kb_folders: subfolder listing + visibility (list_contents) ----------- */
IF NOT EXISTS (SELECT 1 FROM sys.indexes
               WHERE name = 'IX_kb_folders_parent'
                 AND object_id = OBJECT_ID('dbo.kb_folders'))
    CREATE NONCLUSTERED INDEX IX_kb_folders_parent
        ON dbo.kb_folders (parent_id)
        INCLUDE (name, is_system, is_hidden, description, created_at, updated_at);
GO

/* Optional: once the covering indexes above exist, the single-column indexes
   SQLAlchemy auto-created on kb_files(folder_id), kb_files(category_id) and
   kb_folders(parent_id) become redundant, but they are harmless to keep. */
