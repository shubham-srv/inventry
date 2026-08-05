/*
  Item unit of measure + Region lookup table.

  1. Item gets its own `unitOfMeasure`, backfilled from the item's existing
     threshold unit (global threshold wins over a grower-specific one) so
     historical items keep the unit they were effectively already using.
  2. The free-text `region` columns on Item / Vendor / Location are replaced by
     `regionId` FKs into a new `Region` lookup, seeded from the distinct values
     those columns already hold (plus the standard West/Central/East).

  NOTE ON `EXEC(...)`: SQL Server compiles a batch up front, so a statement that
  references a column added earlier in the SAME batch fails with "Invalid column
  name". The backfills are therefore run through EXEC so they compile only after
  the ALTER TABLE has run. Same reason the Region seed inserts are wrapped.
*/

BEGIN TRY

BEGIN TRAN;

-- CreateTable
CREATE TABLE [dbo].[Region] (
    [id] INT NOT NULL IDENTITY(1,1),
    [name] NVARCHAR(1000) NOT NULL,
    [createdBy] INT,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [Region_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedBy] INT,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [Region_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [Region_name_key] UNIQUE NONCLUSTERED ([name])
);

-- Seed Region from the values already present in the free-text columns.
EXEC('
INSERT INTO [dbo].[Region] ([name], [updatedAt])
SELECT DISTINCT LTRIM(RTRIM(existing.[region])), CURRENT_TIMESTAMP
FROM (
    SELECT [region] FROM [dbo].[Item]     WHERE [region] IS NOT NULL AND LTRIM(RTRIM([region])) <> ''''
    UNION
    SELECT [region] FROM [dbo].[Vendor]   WHERE [region] IS NOT NULL AND LTRIM(RTRIM([region])) <> ''''
    UNION
    SELECT [region] FROM [dbo].[Location] WHERE [region] IS NOT NULL AND LTRIM(RTRIM([region])) <> ''''
) AS existing;
');

-- Make sure the standard regions exist even on an empty database.
EXEC('
INSERT INTO [dbo].[Region] ([name], [updatedAt])
SELECT v.[name], CURRENT_TIMESTAMP
FROM (VALUES (''West''), (''Central''), (''East'')) AS v([name])
WHERE NOT EXISTS (SELECT 1 FROM [dbo].[Region] r WHERE r.[name] = v.[name]);
');

-- AlterTable
ALTER TABLE [dbo].[Item] ADD [unitOfMeasure] NVARCHAR(1000), [regionId] INT;

-- AlterTable
ALTER TABLE [dbo].[Vendor] ADD [regionId] INT;

-- AlterTable
ALTER TABLE [dbo].[Location] ADD [regionId] INT;

-- Backfill Item.unitOfMeasure from the item's threshold unit (global first).
EXEC('
UPDATE i
SET i.[unitOfMeasure] = t.[unitOfMeasure]
FROM [dbo].[Item] i
CROSS APPLY (
    SELECT TOP 1 th.[unitOfMeasure]
    FROM [dbo].[ItemThreshold] th
    WHERE th.[itemId] = i.[id] AND th.[unitOfMeasure] IS NOT NULL
    ORDER BY CASE WHEN th.[growerId] IS NULL THEN 0 ELSE 1 END, th.[id]
) t;
');

-- Backfill the new FKs by matching the old free-text values.
EXEC('
UPDATE i SET i.[regionId] = r.[id]
FROM [dbo].[Item] i INNER JOIN [dbo].[Region] r ON r.[name] = LTRIM(RTRIM(i.[region]));

UPDATE v SET v.[regionId] = r.[id]
FROM [dbo].[Vendor] v INNER JOIN [dbo].[Region] r ON r.[name] = LTRIM(RTRIM(v.[region]));

UPDATE l SET l.[regionId] = r.[id]
FROM [dbo].[Location] l INNER JOIN [dbo].[Region] r ON r.[name] = LTRIM(RTRIM(l.[region]));
');

-- DropColumn (values are now carried by the FKs above)
ALTER TABLE [dbo].[Item] DROP COLUMN [region];
ALTER TABLE [dbo].[Vendor] DROP COLUMN [region];
ALTER TABLE [dbo].[Location] DROP COLUMN [region];

-- CreateIndex
CREATE NONCLUSTERED INDEX [Item_regionId_idx] ON [dbo].[Item]([regionId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Vendor_regionId_idx] ON [dbo].[Vendor]([regionId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Location_regionId_idx] ON [dbo].[Location]([regionId]);

-- AddForeignKey
ALTER TABLE [dbo].[Item] ADD CONSTRAINT [Item_regionId_fkey] FOREIGN KEY ([regionId]) REFERENCES [dbo].[Region]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[Vendor] ADD CONSTRAINT [Vendor_regionId_fkey] FOREIGN KEY ([regionId]) REFERENCES [dbo].[Region]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[Location] ADD CONSTRAINT [Location_regionId_fkey] FOREIGN KEY ([regionId]) REFERENCES [dbo].[Region]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
