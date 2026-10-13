/*
  History for low-inventory flags (the grower's "Low" toggle).

  clearedAt / clearedBy record when, and by whom, a flag stopped being active —
  by the grower unflagging it or by an admin review. onHandAtFlag is the
  grower's on-hand total when it was raised, so a past flag reads in context.

  BACKFILL. Cleared rows take the review stamp when there is one, otherwise the
  last update (a grower self-unflag only ever touched updatedAt/updatedBy).
  onHandAtFlag is best effort: the latest count per location on or before the
  flag was raised, summed — the same maths as every other on-hand figure.

  The backfill runs through sp_executesql because SQL Server compiles a batch
  before running it, and an UPDATE naming a column this same batch adds to an
  existing table fails that compile.

  REVERSING: drop the three columns.
*/
BEGIN TRY

BEGIN TRAN;

ALTER TABLE [dbo].[LowInventoryFlag] ADD [clearedAt] DATETIME2,
[clearedBy] INT,
[onHandAtFlag] DECIMAL(32,16);

EXEC sp_executesql N'
UPDATE [dbo].[LowInventoryFlag]
SET [clearedAt] = COALESCE([reviewedAt], [updatedAt]),
    [clearedBy] = COALESCE([reviewedBy], [updatedBy])
WHERE [isActive] = 0;';

EXEC sp_executesql N'
UPDATE f
SET [onHandAtFlag] = oh.[qty]
FROM [dbo].[LowInventoryFlag] f
CROSS APPLY (
    SELECT SUM(x.[finalQuantity]) AS [qty]
    FROM (
        SELECT l.[finalQuantity],
               ROW_NUMBER() OVER (PARTITION BY l.[locationId] ORDER BY l.[date] DESC, l.[id] DESC) AS rn
        FROM [dbo].[InventoryLedger] l
        WHERE l.[growerId] = f.[growerId]
          AND l.[itemId] = f.[itemId]
          AND l.[date] <= f.[createdAt]
    ) x
    WHERE x.rn = 1
) oh
WHERE oh.[qty] IS NOT NULL;';

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
