/*
  Map growers and vendors to locations.

  - `GrowerLocation` is a join table: per-location inventory only means anything
    when a grower has several sites, and the submit page's location picker reads
    straight off this list.
  - `Vendor.locationId` is a plain FK. Nothing reads a vendor's location
    behaviourally — it is a display attribute, so a join table would be a table,
    a join and an admin screen for nothing.

  Every grower is given a default location here. The next migration makes
  `locationId` NOT NULL on the submission tables, and that backfill has nowhere
  to point without one. Growers that really do run several sites get them added
  in the admin UI afterwards and start counting per-site from that day; history
  is not retro-split, because the location a past count belonged to was never
  recorded and cannot be recovered.
*/

BEGIN TRY

BEGIN TRAN;

-- CreateTable
CREATE TABLE [dbo].[GrowerLocation] (
    [id] INT NOT NULL IDENTITY(1,1),
    [growerId] INT NOT NULL,
    [locationId] INT NOT NULL,
    [isActive] BIT NOT NULL CONSTRAINT [GrowerLocation_isActive_df] DEFAULT 1,
    [createdBy] INT,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [GrowerLocation_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedBy] INT,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [GrowerLocation_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [GrowerLocation_growerId_locationId_key] UNIQUE NONCLUSTERED ([growerId],[locationId])
);

-- CreateIndex
CREATE NONCLUSTERED INDEX [GrowerLocation_locationId_idx] ON [dbo].[GrowerLocation]([locationId]);

-- AlterTable
ALTER TABLE [dbo].[Vendor] ADD [locationId] INT;

-- CreateIndex
CREATE NONCLUSTERED INDEX [Vendor_locationId_idx] ON [dbo].[Vendor]([locationId]);

-- AddForeignKey
ALTER TABLE [dbo].[GrowerLocation] ADD CONSTRAINT [GrowerLocation_growerId_fkey] FOREIGN KEY ([growerId]) REFERENCES [dbo].[Grower]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[GrowerLocation] ADD CONSTRAINT [GrowerLocation_locationId_fkey] FOREIGN KEY ([locationId]) REFERENCES [dbo].[Location]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[Vendor] ADD CONSTRAINT [Vendor_locationId_fkey] FOREIGN KEY ([locationId]) REFERENCES [dbo].[Location]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

/*
  Give every grower a location.

  Preference order, so this reuses real data where it exists rather than
  manufacturing rows:
    1. A location the grower's own history already points at — if their
       submissions or ledger rows carry a locationId, that is their site.
    2. Otherwise a new "<Grower Name> — Main" location.
*/

-- 1. Adopt locations the grower's existing rows already reference.
EXEC('
INSERT INTO [dbo].[GrowerLocation] ([growerId], [locationId], [isActive], [updatedAt])
SELECT DISTINCT src.[growerId], src.[locationId], 1, CURRENT_TIMESTAMP
FROM (
    SELECT l.[growerId], l.[locationId]
    FROM [dbo].[InventoryLedger] l
    WHERE l.[locationId] IS NOT NULL
    UNION
    SELECT s.[growerId], d.[locationId]
    FROM [dbo].[GrowerSubmissionDetail] d
    INNER JOIN [dbo].[GrowerSubmission] s ON s.[id] = d.[submissionId]
    WHERE d.[locationId] IS NOT NULL
) AS src
WHERE NOT EXISTS (
    SELECT 1 FROM [dbo].[GrowerLocation] gl
    WHERE gl.[growerId] = src.[growerId] AND gl.[locationId] = src.[locationId]
);
');

-- 2. Any grower still without one gets a location of their own.
EXEC('
INSERT INTO [dbo].[Location] ([locationName], [locationType], [updatedAt])
SELECT g.[growerName] + '' — Main'', ''Grower'', CURRENT_TIMESTAMP
FROM [dbo].[Grower] g
WHERE NOT EXISTS (SELECT 1 FROM [dbo].[GrowerLocation] gl WHERE gl.[growerId] = g.[id]);
');

EXEC('
INSERT INTO [dbo].[GrowerLocation] ([growerId], [locationId], [isActive], [updatedAt])
SELECT g.[id], l.[id], 1, CURRENT_TIMESTAMP
FROM [dbo].[Grower] g
INNER JOIN [dbo].[Location] l ON l.[locationName] = g.[growerName] + '' — Main''
WHERE NOT EXISTS (SELECT 1 FROM [dbo].[GrowerLocation] gl WHERE gl.[growerId] = g.[id]);
');

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
