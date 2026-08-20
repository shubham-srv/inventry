/*
  Vendors get several sites, like growers.

  `Vendor.locationId` (added in 20260814090100 as a plain FK, on the grounds
  that nothing read it behaviourally) becomes the `VendorLocation` join table.
  Nothing about the reporting model changes: a VendorSubmission is still one per
  vendor per day, NOT per site. These rows are master data — the admin list, the
  region filter and the export read them, and a vendor's region is still read
  through them rather than stored.

  The existing single location is carried over as the vendor's first row, so no
  vendor loses the site (or the region) it already showed. Vendors with no
  location simply get no rows, exactly as they had no location before.

  ORDER MATTERS: the backfill has to run while `Vendor.locationId` still exists,
  and SQL Server refuses to drop a column with an FK or index bound to it, so
  the constraint and index go first.
*/

BEGIN TRY

BEGIN TRAN;

-- CreateTable
CREATE TABLE [dbo].[VendorLocation] (
    [id] INT NOT NULL IDENTITY(1,1),
    [vendorId] INT NOT NULL,
    [locationId] INT NOT NULL,
    [isActive] BIT NOT NULL CONSTRAINT [VendorLocation_isActive_df] DEFAULT 1,
    [createdBy] INT,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [VendorLocation_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedBy] INT,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [VendorLocation_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [VendorLocation_vendorId_locationId_key] UNIQUE NONCLUSTERED ([vendorId],[locationId])
);

-- CreateIndex
CREATE NONCLUSTERED INDEX [VendorLocation_locationId_idx] ON [dbo].[VendorLocation]([locationId]);

-- AddForeignKey
ALTER TABLE [dbo].[VendorLocation] ADD CONSTRAINT [VendorLocation_vendorId_fkey] FOREIGN KEY ([vendorId]) REFERENCES [dbo].[Vendor]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[VendorLocation] ADD CONSTRAINT [VendorLocation_locationId_fkey] FOREIGN KEY ([locationId]) REFERENCES [dbo].[Location]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

/*
  Carry the current single location over. Wrapped in EXEC so the batch parses
  against the pre-migration shape of Vendor — `locationId` is dropped below, and
  without this the whole script fails to compile on a database where it is gone.
*/
EXEC('
INSERT INTO [dbo].[VendorLocation] ([vendorId], [locationId], [isActive], [createdBy], [updatedBy], [updatedAt])
SELECT v.[id], v.[locationId], 1, v.[createdBy], v.[updatedBy], CURRENT_TIMESTAMP
FROM [dbo].[Vendor] v
WHERE v.[locationId] IS NOT NULL;
');

-- DropForeignKey (must go before the column it is bound to)
ALTER TABLE [dbo].[Vendor] DROP CONSTRAINT [Vendor_locationId_fkey];

-- DropIndex
DROP INDEX [Vendor_locationId_idx] ON [dbo].[Vendor];

-- DropColumn
ALTER TABLE [dbo].[Vendor] DROP COLUMN [locationId];

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
