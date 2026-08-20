/* ============================================================================
   MOVE FOLLOW-UP HISTORY:   POST WARRANTY  ->  ONE CSP DRIVE
   ----------------------------------------------------------------------------
   For each instance id you list below, every Post Warranty follow-up the
   customer has (non_followups rows with campaign_id IS NULL) is copied into
   followups against the CSP drive you name, and the original PW row is deleted.

   It also adds the instance to that drive's membership list, because a customer
   who is not in campaigns.asset_numbers does not appear under the drive at all
   and the moved history would stay invisible.

   SAFETY
     * This runs in ONE go -- there is no flag to flip. The preview result sets
       are still printed (they run before the change, so they show what is about
       to move), then the move happens inside a single transaction: all of it or
       none of it.
     * Every moved row is copied verbatim (as JSON) into followup_move_log
       before deletion, so the move can be undone -- see the UNDO block at the
       bottom of this file.
     * TAKE A DATABASE BACKUP BEFORE RUNNING THIS.

   Requires SQL Server 2017+ (STRING_AGG, used in Step 6d/6e).
   ========================================================================== */

SET NOCOUNT ON;
SET XACT_ABORT ON;

/* ##########################################################################
   ##########   NOTHING TO FILL IN -- THE DRIVE NAME IS ALREADY SET   ######
   ###   (the instance id list below is already filled and de-duplicated)  ###
   ########################################################################## */

-- The CSP drive these customers belong in. Must match campaigns.name exactly.
-- The script STOPS with an error if this name does not exist, so a typo cannot
-- do any damage. The helper query at the bottom of this file lists CSP drives.
DECLARE @TargetDriveName NVARCHAR(255) = N'CSP-E2FG-2026';

DECLARE @Ids TABLE (raw_id NVARCHAR(100));

-- 138 unique instance ids (duplicates already removed).
-- SQL Server allows max 1000 rows per INSERT ... VALUES, so the list is
-- split into batches. To change the list, edit these VALUES lines.

INSERT INTO @Ids (raw_id) VALUES   -- batch 1 of 1, 138 ids
    (N'100874103'),
    (N'100829469'),
    (N'100877800'),
    (N'100805332'),
    (N'100831465'),
    (N'100854935'),
    (N'100854958'),
    (N'100795397'),
    (N'100895027'),
    (N'100900241'),
    (N'100925198'),
    (N'100775487'),
    (N'100870096'),
    (N'100910707'),
    (N'100814684'),
    (N'100828026'),
    (N'100831110'),
    (N'100844454'),
    (N'100837968'),
    (N'100839279'),
    (N'100754860'),
    (N'100894144'),
    (N'100894147'),
    (N'100816737'),
    (N'100897083'),
    (N'100845218'),
    (N'100829278'),
    (N'100753508'),
    (N'100829905'),
    (N'100923198'),
    (N'100898329'),
    (N'100804398'),
    (N'100778644'),
    (N'100786421'),
    (N'100766136'),
    (N'100785403'),
    (N'100763257'),
    (N'100775481'),
    (N'100793297'),
    (N'100876717'),
    (N'100890302'),
    (N'100896100'),
    (N'100875387'),
    (N'100824943'),
    (N'100883721'),
    (N'100756387'),
    (N'100846217'),
    (N'100800856'),
    (N'100813121'),
    (N'100864657'),
    (N'100922708'),
    (N'100934699'),
    (N'100845086'),
    (N'100855731'),
    (N'100848880'),
    (N'100910637'),
    (N'100828873'),
    (N'100840679'),
    (N'100839898'),
    (N'100844731'),
    (N'100919508'),
    (N'100767195'),
    (N'100837132'),
    (N'100885645'),
    (N'100803766'),
    (N'100810226'),
    (N'100808274'),
    (N'100892800'),
    (N'100807683'),
    (N'100794908'),
    (N'100868512'),
    (N'100839578'),
    (N'100840918'),
    (N'100840076'),
    (N'100855463'),
    (N'100765597'),
    (N'100855425'),
    (N'100837005'),
    (N'100884461'),
    (N'100937164'),
    (N'100823714'),
    (N'100848866'),
    (N'100929144'),
    (N'100929620'),
    (N'100786743'),
    (N'100788797'),
    (N'100877806'),
    (N'100888940'),
    (N'100800124'),
    (N'100869885'),
    (N'100786485'),
    (N'100834460'),
    (N'100847365'),
    (N'100894052'),
    (N'100749532'),
    (N'100838018'),
    (N'100831164'),
    (N'100771265'),
    (N'100796234'),
    (N'100871287'),
    (N'100863850'),
    (N'100814799'),
    (N'100777649'),
    (N'100940812'),
    (N'100845967'),
    (N'100841033'),
    (N'100852858'),
    (N'100894358'),
    (N'100837403'),
    (N'100927434'),
    (N'100771239'),
    (N'100776648'),
    (N'100818004'),
    (N'100882432'),
    (N'100847484'),
    (N'100854643'),
    (N'100814115'),
    (N'100863631'),
    (N'100863785'),
    (N'100865785'),
    (N'100925777'),
    (N'100781873'),
    (N'100780556'),
    (N'100942792'),
    (N'100875132'),
    (N'100834935'),
    (N'100794797'),
    (N'100788798'),
    (N'100781305'),
    (N'100834937'),
    (N'100943953'),
    (N'100785217'),
    (N'100896369'),
    (N'100782082'),
    (N'100780939'),
    (N'100857912'),
    (N'100839301'),
    (N'100840062');

/* ##########################################################################
   ##################   NOTHING BELOW NEEDS EDITING   #####################
   ########################################################################## */


/* ---------------------------------------------------------------------------
   Step 0 : audit table (created once, shared with move_csp_to_pw.sql)
   ------------------------------------------------------------------------- */
IF OBJECT_ID('dbo.followup_move_log', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.followup_move_log (
        id                   INT IDENTITY(1,1) PRIMARY KEY,
        moved_at             DATETIME       NOT NULL CONSTRAINT DF_fml_moved_at DEFAULT (GETDATE()),
        moved_by             NVARCHAR(200)  NULL,
        direction            VARCHAR(20)    NOT NULL,
        source_table         VARCHAR(30)    NOT NULL,
        source_row_id        INT            NOT NULL,
        customer_id          INT            NULL,
        instance_id          NVARCHAR(100)  NULL,
        source_campaign_id   INT            NULL,
        source_campaign_name NVARCHAR(255)  NULL,
        target_campaign_id   INT            NULL,
        row_json             NVARCHAR(MAX)  NULL
    );
    PRINT 'Created dbo.followup_move_log';
END


/* ---------------------------------------------------------------------------
   Step 1 : resolve + validate the target drive
   ------------------------------------------------------------------------- */
DECLARE @TargetId      INT;
DECLARE @TargetService NVARCHAR(100);
DECLARE @TargetStatus  NVARCHAR(50);

SELECT @TargetId = cp.id, @TargetService = cp.service, @TargetStatus = cp.status
FROM campaigns cp
WHERE cp.name = @TargetDriveName;

IF @TargetId IS NULL
BEGIN
    RAISERROR('Target drive "%s" not found in campaigns.name. Run the helper query at the bottom of this file to see the exact names.', 16, 1, @TargetDriveName);
    RETURN;
END

SELECT 'TARGET DRIVE' AS report, @TargetId AS campaign_id, @TargetDriveName AS drive_name,
       @TargetService AS service, @TargetStatus AS status,
       CASE WHEN UPPER(CONCAT(ISNULL(@TargetService, N''), N' ', @TargetDriveName)) LIKE N'%CSP%'
            THEN 'yes' ELSE 'NO - this does not look like a CSP drive, check the name' END AS looks_like_csp;


/* ---------------------------------------------------------------------------
   Step 2 : normalise the pasted ids the same way the app does
            (_normalize_id: trim, then drop a trailing '.0')
   ------------------------------------------------------------------------- */
IF OBJECT_ID('tempdb..#ids')  IS NOT NULL DROP TABLE #ids;
IF OBJECT_ID('tempdb..#cust') IS NOT NULL DROP TABLE #cust;
IF OBJECT_ID('tempdb..#move') IS NOT NULL DROP TABLE #move;

CREATE TABLE #ids (raw_id NVARCHAR(100), norm_id NVARCHAR(100));

INSERT INTO #ids (raw_id, norm_id)
SELECT raw_id,
       CASE WHEN RIGHT(LTRIM(RTRIM(raw_id)), 2) = N'.0'
            THEN LEFT(LTRIM(RTRIM(raw_id)), LEN(LTRIM(RTRIM(raw_id))) - 2)
            ELSE LTRIM(RTRIM(raw_id))
       END
FROM @Ids
WHERE raw_id IS NOT NULL AND LTRIM(RTRIM(raw_id)) <> N'';


/* ---------------------------------------------------------------------------
   Step 3 : resolve instance id -> customer
   ------------------------------------------------------------------------- */
CREATE TABLE #cust (norm_id NVARCHAR(100), customer_id INT, instance_id NVARCHAR(100));

INSERT INTO #cust (norm_id, customer_id, instance_id)
SELECT i.norm_id, c.id, c.instance_id
FROM #ids i
JOIN customers c
  ON CASE WHEN RIGHT(LTRIM(RTRIM(c.instance_id)), 2) = N'.0'
          THEN LEFT(LTRIM(RTRIM(c.instance_id)), LEN(LTRIM(RTRIM(c.instance_id))) - 2)
          ELSE LTRIM(RTRIM(c.instance_id))
     END = i.norm_id;


/* ---------------------------------------------------------------------------
   Step 4 : the exact Post Warranty rows that will move
            (campaign_id IS NULL is what makes a non_followups row "PW")
   ------------------------------------------------------------------------- */
SELECT
    nf.id, nf.customer_id, nf.customer_instance_id,
    nf.user_id, nf.user_name, nf.followup_date, nf.followup_by,
    nf.followup_remark, nf.status, nf.remark_type, nf.service,
    nf.followup_flag, nf.next_followup_date,
    nf.quotation_sent, nf.quotation_no, nf.quotation_value,
    nf.activity_id, nf.rr_id, nf.created_at,
    cu.instance_id AS resolved_instance_id
INTO #move
FROM non_followups nf
JOIN #cust cu ON cu.customer_id = nf.customer_id
WHERE nf.campaign_id IS NULL;


/* ---------------------------------------------------------------------------
   Step 5 : PREVIEW
   ------------------------------------------------------------------------- */

-- 5a. every row that will move
SELECT  'WILL MOVE' AS report,
        m.resolved_instance_id AS instance_id,
        m.followup_date, m.status, m.followup_flag,
        m.next_followup_date, m.user_name, m.service AS pw_service,
        m.followup_remark,
        m.id AS non_followup_row_id
FROM #move m
ORDER BY m.resolved_instance_id, m.followup_date DESC;

-- 5b. ids you pasted that resolve to no customer at all (typo / wrong id)
SELECT 'INSTANCE ID NOT FOUND IN customers' AS report, i.raw_id, i.norm_id
FROM #ids i
WHERE NOT EXISTS (SELECT 1 FROM #cust c WHERE c.norm_id = i.norm_id);

-- 5c. ids that resolve fine but have no Post Warranty follow-up to move
SELECT 'NO PW FOLLOW-UP TO MOVE' AS report, c.instance_id, c.customer_id
FROM #cust c
WHERE NOT EXISTS (SELECT 1 FROM #move m WHERE m.customer_id = c.customer_id);

-- 5d. who is already a member of the target drive (membership add is a no-op for these)
SELECT 'ALREADY IN TARGET DRIVE' AS report, c.instance_id
FROM #cust c
WHERE EXISTS (
    SELECT 1
    FROM campaigns cp
    -- the ISJSON guard has to sit INSIDE the OPENJSON argument: OPENJSON is
    -- evaluated before a WHERE clause could filter a malformed value out
    CROSS APPLY OPENJSON(CASE WHEN ISJSON(cp.asset_numbers) = 1 THEN cp.asset_numbers ELSE N'[]' END) v
    WHERE cp.id = @TargetId
      AND CASE WHEN RIGHT(LTRIM(RTRIM(v.value)), 2) = N'.0'
               THEN LEFT(LTRIM(RTRIM(v.value)), LEN(LTRIM(RTRIM(v.value))) - 2)
               ELSE LTRIM(RTRIM(v.value)) END = c.norm_id
);

-- 5e. counts
SELECT
    (SELECT COUNT(*) FROM #ids)                     AS ids_pasted,
    (SELECT COUNT(DISTINCT customer_id) FROM #cust)  AS customers_resolved,
    (SELECT COUNT(*) FROM #move)                    AS pw_rows_to_move,
    (SELECT COUNT(DISTINCT customer_id) FROM #move)  AS customers_with_rows_to_move;


/* ---------------------------------------------------------------------------
   Step 6 : THE MOVE  (runs automatically -- no flag to set)
             The guard also fires when there is no follow-up to move but there
             ARE resolved customers, because those still need adding to the
             drive's membership list.
   ------------------------------------------------------------------------- */
IF EXISTS (SELECT 1 FROM #move) OR EXISTS (SELECT 1 FROM #cust)
BEGIN
    BEGIN TRANSACTION;

    -- 6a. audit every row before it is touched (makes this reversible)
    INSERT INTO dbo.followup_move_log
        (moved_by, direction, source_table, source_row_id, customer_id,
         instance_id, source_campaign_id, source_campaign_name, target_campaign_id, row_json)
    SELECT
        SUSER_SNAME(), 'PW->CSP', 'non_followups', m.id, m.customer_id,
        m.resolved_instance_id, NULL, N'Post Warranty', @TargetId,
        (SELECT m2.* FROM #move m2 WHERE m2.id = m.id FOR JSON PATH, WITHOUT_ARRAY_WRAPPER)
    FROM #move m;

    -- 6b. write them as drive follow-ups against the target CSP drive.
    --     followup_date and created_at are preserved: created_at is what the
    --     employee-performance reports bucket by, so restamping it would move
    --     the work to today. TODATETIMEOFFSET(..., 0) matches how the app
    --     writes this column -- IST wall clock tagged +00:00.
    INSERT INTO followups
        (customer_id, customer_instance_id, campaign_id, user_id, user_name,
         followup_date, followup_by, followup_flag, followup_remark, status,
         next_followup_date, quotation_sent, quotation_no, quotation_value,
         csp_subtype, activity_id, rr_id, created_at)
    SELECT
        m.customer_id,
        ISNULL(m.customer_instance_id, m.resolved_instance_id),
        @TargetId,                                                      -- <= the CSP drive
        m.user_id,
        ISNULL(NULLIF(LTRIM(RTRIM(m.user_name)), N''), m.user_id),       -- NOT NULL in followups
        m.followup_date,
        m.followup_by,
        m.followup_flag,
        m.followup_remark,
        ISNULL(NULLIF(LTRIM(RTRIM(m.status)), N''), N'pending'),
        m.next_followup_date,
        ISNULL(m.quotation_sent, 0),
        m.quotation_no,
        CAST(m.quotation_value AS FLOAT),                               -- Numeric(15,2) -> Float
        NULL,                                                            -- csp_subtype: PW rows have none
        m.activity_id,
        m.rr_id,
        TODATETIMEOFFSET(m.created_at, 0)
    FROM #move m;

    -- 6c. remove the originals
    DELETE nf
    FROM non_followups nf
    JOIN #move m ON m.id = nf.id;

    -- 6d. add the instances to the target drive's membership, otherwise the
    --     customer never shows under the drive. UNION makes this idempotent.
    DECLARE @cur NVARCHAR(MAX) = (SELECT asset_numbers FROM campaigns WHERE id = @TargetId);
    IF ISJSON(@cur) <> 1 SET @cur = N'[]';

    -- CAST to NVARCHAR(MAX) is required: STRING_AGG returns nvarchar(4000) when
    -- fed a non-MAX expression and then ERRORS at 8000 bytes, which a drive with
    -- a few hundred assets exceeds.
    DECLARE @newAssets NVARCHAR(MAX);
    ;WITH final AS (
        SELECT LTRIM(RTRIM(v.value)) AS a FROM OPENJSON(@cur) v WHERE LTRIM(RTRIM(v.value)) <> N''
        UNION
        SELECT c.norm_id FROM #cust c
    )
    SELECT @newAssets = N'[' + STRING_AGG(CAST(N'"' + a + N'"' AS NVARCHAR(MAX)), N',') + N']' FROM final;

    -- Never write a NULL/empty rebuild over a real list: this step only ever ADDS
    -- members, so a NULL here would mean something went wrong, not "empty list".
    IF @newAssets IS NOT NULL
        UPDATE campaigns
        SET asset_numbers = @newAssets,
            updated_at    = GETDATE()      -- also drops the Non-Drive page's cached index
        WHERE id = @TargetId;
    ELSE
        RAISERROR('Rebuilt asset list came back NULL -- aborting so the drive list is not wiped.', 16, 1);

    -- 6e. the same instances count as admin-added (an admin is doing this fix),
    --     which keeps the "admin added only" drive report honest
    DECLARE @curAdmin NVARCHAR(MAX) = (SELECT admin_asset_numbers FROM campaigns WHERE id = @TargetId);
    IF ISJSON(@curAdmin) <> 1 SET @curAdmin = N'[]';

    DECLARE @newAdmin NVARCHAR(MAX);
    ;WITH finalA AS (
        SELECT LTRIM(RTRIM(v.value)) AS a FROM OPENJSON(@curAdmin) v WHERE LTRIM(RTRIM(v.value)) <> N''
        UNION
        SELECT c.norm_id FROM #cust c
    )
    SELECT @newAdmin = N'[' + STRING_AGG(CAST(N'"' + a + N'"' AS NVARCHAR(MAX)), N',') + N']' FROM finalA;

    IF @newAdmin IS NOT NULL
        UPDATE campaigns
        SET admin_asset_numbers = @newAdmin
        WHERE id = @TargetId;

    COMMIT TRANSACTION;
    PRINT 'PW -> CSP move committed (follow-ups moved + added to drive membership).';
END
ELSE
    PRINT 'Nothing to move and nothing to add.';


/* ---------------------------------------------------------------------------
   Step 7 : VERIFY -- what each customer now looks like inside the CSP drive
   ------------------------------------------------------------------------- */
SELECT  c.instance_id,
        cp.name AS drive_name,
        f.followup_date, f.status, f.followup_flag,
        f.next_followup_date, f.user_name, f.followup_remark
FROM #cust c
JOIN followups f  ON f.customer_id = c.customer_id AND f.campaign_id = @TargetId
JOIN campaigns cp ON cp.id = f.campaign_id
ORDER BY c.instance_id, f.followup_date DESC;

-- and confirm no PW row is left behind for them
SELECT 'STILL HAS A PW ROW' AS report, c.instance_id, nf.followup_date, nf.status
FROM #cust c
JOIN non_followups nf ON nf.customer_id = c.customer_id AND nf.campaign_id IS NULL
ORDER BY c.instance_id;


/* ---------------------------------------------------------------------------
   HELPER : list the CSP drives so you can copy an exact name into
            @TargetDriveName above
   ------------------------------------------------------------------------- */
SELECT cp.id, cp.name, cp.service, cp.status, cp.start_date, cp.end_date, a.asset_count
FROM campaigns cp
OUTER APPLY (
    SELECT COUNT(*) AS asset_count
    FROM OPENJSON(CASE WHEN ISJSON(cp.asset_numbers) = 1 THEN cp.asset_numbers ELSE N'[]' END)
) a
WHERE UPPER(CONCAT(ISNULL(cp.service, N''), N' ', ISNULL(cp.name, N''))) LIKE N'%CSP%'
ORDER BY cp.status, cp.id DESC;


/* ---------------------------------------------------------------------------
   UNDO  (put back the PW rows one run deleted)
   ------------------------------------------------------------------------- */
/*
-- 1. see the runs
SELECT direction, moved_at, moved_by, COUNT(*) AS rows_moved
FROM dbo.followup_move_log
GROUP BY direction, moved_at, moved_by
ORDER BY moved_at DESC;

-- 2. restore the non_followups rows of one run (identity insert keeps the old ids)
DECLARE @run DATETIME = '2026-08-19 12:34:56.789';   -- exact moved_at from above

SET IDENTITY_INSERT non_followups ON;

INSERT INTO non_followups
    (id, customer_id, customer_instance_id, campaign_id, user_id, user_name,
     followup_date, followup_by, followup_remark, status, remark_type, service,
     followup_flag, next_followup_date, quotation_sent, quotation_no,
     quotation_value, activity_id, rr_id, created_at)
SELECT j.id, j.customer_id, j.customer_instance_id, NULL, j.user_id, j.user_name,
       j.followup_date, j.followup_by, j.followup_remark, j.status, j.remark_type, j.service,
       j.followup_flag, j.next_followup_date, j.quotation_sent, j.quotation_no,
       j.quotation_value, j.activity_id, j.rr_id, j.created_at
FROM dbo.followup_move_log l
CROSS APPLY OPENJSON(l.row_json) WITH (
    id                   INT,
    customer_id          INT,
    customer_instance_id NVARCHAR(255),
    user_id              NVARCHAR(100),
    user_name            NVARCHAR(255),
    followup_date        DATETIME,
    followup_by          NVARCHAR(50),
    followup_remark      NVARCHAR(MAX),
    status               NVARCHAR(50),
    remark_type          NVARCHAR(50),
    service              NVARCHAR(255),
    followup_flag        NVARCHAR(10),
    next_followup_date   DATETIME,
    quotation_sent       BIT,
    quotation_no         NVARCHAR(255),
    quotation_value      DECIMAL(15,2),
    activity_id          INT,
    rr_id                INT,
    created_at           DATETIME
) j
WHERE l.direction = 'PW->CSP' AND l.moved_at = @run
  AND NOT EXISTS (SELECT 1 FROM non_followups nf WHERE nf.id = j.id);

SET IDENTITY_INSERT non_followups OFF;

-- 3. then review and delete the followups rows that run created
SELECT f.*
FROM followups f
JOIN dbo.followup_move_log l ON l.direction = 'PW->CSP' AND l.moved_at = @run
                            AND l.customer_id  = f.customer_id
                            AND l.target_campaign_id = f.campaign_id
                            AND JSON_VALUE(l.row_json, '$.followup_date') = CONVERT(NVARCHAR(30), f.followup_date, 126);
*/
