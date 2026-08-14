/*
  Scope grower submissions to a location.

  `GrowerSubmission` gains a required `locationId`, making the grain one
  submission per grower, per location, per day. `status`, `submittedBy` and
  `comments` are per-location facts: with one row per grower-day there is no way
  to say "Yuma submitted, Salinas still a draft", and submitInventory's ledger
  rebuild — which deletes and recreates every row for the submission — would
  promote one location's draft numbers the moment another was submitted.

  `locationId` also becomes NOT NULL on GrowerSubmissionDetail and
  InventoryLedger. It has been nullable-but-populated by the seed since 0_init
  and was never written by the app, so live rows hold NULL. A nullable column
  cannot carry the grain: SQL Server allows only ONE NULL in a unique index, so
  "no location" would silently cap a grower at a single such row per item.

  EXISTING DATA. Details and ledger rows that carry a location keep it, and
  submissions holding more than one are SPLIT into one submission per location
  (details and ledger repointed to the new rows). Rows with no location at all
  are assigned the grower's default location from the previous migration. No
  attempt is made to guess which site an unlabelled historical count came
  from — that was never recorded and is not recoverable.
*/

BEGIN TRY

BEGIN TRAN;

-- AlterTable
ALTER TABLE [dbo].[GrowerSubmission] ADD [locationId] INT;

-- Each grower's default location: the lowest-id mapping created by the previous
-- migration. Used wherever a row has no location of its own.
CREATE TABLE #defaultLocation (
    growerId INT NOT NULL PRIMARY KEY,
    locationId INT NOT NULL
);

INSERT INTO #defaultLocation (growerId, locationId)
SELECT gl.[growerId], MIN(gl.[locationId])
FROM [dbo].[GrowerLocation] gl
GROUP BY gl.[growerId];

-- Backfill unlabelled detail rows.
UPDATE d
SET d.[locationId] = dl.[locationId]
FROM [dbo].[GrowerSubmissionDetail] d
INNER JOIN [dbo].[GrowerSubmission] s ON s.[id] = d.[submissionId]
INNER JOIN #defaultLocation dl ON dl.[growerId] = s.[growerId]
WHERE d.[locationId] IS NULL;

-- Backfill unlabelled ledger rows.
UPDATE l
SET l.[locationId] = dl.[locationId]
FROM [dbo].[InventoryLedger] l
INNER JOIN #defaultLocation dl ON dl.[growerId] = l.[growerId]
WHERE l.[locationId] IS NULL;

-- Give every submission a primary location: the lowest one its details use,
-- falling back to the grower's default when it has no details (an empty draft).
EXEC('
UPDATE s
SET s.[locationId] = COALESCE(
    (SELECT MIN(d.[locationId]) FROM [dbo].[GrowerSubmissionDetail] d WHERE d.[submissionId] = s.[id]),
    dl.[locationId]
)
FROM [dbo].[GrowerSubmission] s
INNER JOIN #defaultLocation dl ON dl.[growerId] = s.[growerId];
');

/*
  Split submissions that span locations.

  MERGE with `ON 1 = 0` is the standard way to get INSERT...OUTPUT to emit a
  column from the SOURCE alongside the new IDENTITY value. A plain
  INSERT ... OUTPUT can only return columns of the inserted row, which would
  leave no way to tie each new submission back to the one it came from.
*/
CREATE TABLE #split (
    oldSubmissionId INT NOT NULL,
    locationId INT NOT NULL,
    newSubmissionId INT NOT NULL
);

EXEC('
MERGE INTO [dbo].[GrowerSubmission] AS tgt
USING (
    SELECT DISTINCT
        s.[id] AS oldId, d.[locationId] AS splitLocationId, s.[growerId], s.[submittedBy],
        s.[submissionDate], s.[status], s.[reviewedBy], s.[reviewedAt], s.[comments],
        s.[createdBy], s.[createdAt], s.[updatedBy]
    FROM [dbo].[GrowerSubmission] s
    INNER JOIN [dbo].[GrowerSubmissionDetail] d ON d.[submissionId] = s.[id]
    WHERE d.[locationId] <> s.[locationId]
) AS src
ON 1 = 0
WHEN NOT MATCHED THEN
    INSERT ([growerId], [locationId], [submittedBy], [submissionDate], [status],
            [reviewedBy], [reviewedAt], [comments], [createdBy], [createdAt],
            [updatedBy], [updatedAt])
    VALUES (src.[growerId], src.[splitLocationId], src.[submittedBy], src.[submissionDate],
            src.[status], src.[reviewedBy], src.[reviewedAt], src.[comments],
            src.[createdBy], src.[createdAt], src.[updatedBy], CURRENT_TIMESTAMP)
    OUTPUT src.[oldId], src.[splitLocationId], inserted.[id]
    INTO #split (oldSubmissionId, locationId, newSubmissionId);
');

-- Repoint the ledger and the details. Each matches on the still-original
-- submissionId held by its own table, so the two updates are independent of
-- each other and the order between them does not matter.
UPDATE l
SET l.[submissionId] = sp.[newSubmissionId]
FROM [dbo].[InventoryLedger] l
INNER JOIN #split sp
    ON sp.[oldSubmissionId] = l.[submissionId]
   AND sp.[locationId] = l.[locationId];

UPDATE d
SET d.[submissionId] = sp.[newSubmissionId]
FROM [dbo].[GrowerSubmissionDetail] d
INNER JOIN #split sp
    ON sp.[oldSubmissionId] = d.[submissionId]
   AND sp.[locationId] = d.[locationId];

DROP TABLE #split;
DROP TABLE #defaultLocation;

-- AlterTable: the grain is now enforceable.
EXEC('ALTER TABLE [dbo].[GrowerSubmission] ALTER COLUMN [locationId] INT NOT NULL;');
ALTER TABLE [dbo].[GrowerSubmissionDetail] ALTER COLUMN [locationId] INT NOT NULL;
ALTER TABLE [dbo].[InventoryLedger] ALTER COLUMN [locationId] INT NOT NULL;

-- The submission is scoped to one location, so an item is unique within it.
-- Until now this was enforced only by a findFirst in submitInventory.
ALTER TABLE [dbo].[GrowerSubmissionDetail] ADD CONSTRAINT [GrowerSubmissionDetail_submissionId_itemId_key] UNIQUE NONCLUSTERED ([submissionId],[itemId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [GrowerSubmission_growerId_locationId_submissionDate_idx] ON [dbo].[GrowerSubmission]([growerId], [locationId], [submissionDate]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [GrowerSubmissionDetail_locationId_idx] ON [dbo].[GrowerSubmissionDetail]([locationId]);

-- The ledger's hot path is "this grower's latest value for this item at this
-- location", so locationId joins the covering index ahead of the date.
DROP INDEX [InventoryLedger_growerId_itemId_date_idx] ON [dbo].[InventoryLedger];
CREATE NONCLUSTERED INDEX [InventoryLedger_growerId_itemId_locationId_date_idx] ON [dbo].[InventoryLedger]([growerId], [itemId], [locationId], [date]);

-- AddForeignKey
ALTER TABLE [dbo].[GrowerSubmission] ADD CONSTRAINT [GrowerSubmission_locationId_fkey] FOREIGN KEY ([locationId]) REFERENCES [dbo].[Location]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
