/*
  Consolidate country data onto one shared lookup table.

  1. `CountryOfOrigin` becomes `Country`. It was already nothing more than a
     unique name, and it now backs four things instead of one: an item's origin,
     a location's country, a vendor's home country, and the countries a vendor
     can supply to.
  2. `Location` gains `countryId`.
  3. `Vendor.country` (free text) becomes `Vendor.countryId`, backfilled by name.
  4. New `VendorCountry` join table for the supply-to list.

  NOTE ON THE RENAME: this is `sp_rename`, not drop-and-recreate. Prisma's
  differ emits the latter for a model rename, which would take
  `Item_countryOfOriginId_fkey` and every row with it. `sp_rename` on a table
  leaves the data, the PK and the inbound FK intact; only the auto-named
  constraints need renaming afterwards so a future `prisma migrate diff` does
  not see them as drift. `Item.countryOfOriginId` deliberately keeps its name —
  "country of origin" is still the right label for that particular column.

  NOTE ON `isSelectable`: the seeded "N/A" row is a sensible answer for an
  item's origin but not for "where can this vendor ship to". Rather than delete
  it and lose the item values pointing at it, it is flagged unselectable and the
  new pickers filter it out.

  NOTE ON `EXEC(...)`: SQL Server compiles a batch up front, so a statement
  referencing a column added earlier in the SAME batch fails with "Invalid
  column name". Backfills that touch new columns are wrapped for that reason.
*/

BEGIN TRY

BEGIN TRAN;

-- RenameTable: CountryOfOrigin -> Country (data, PK and inbound FKs preserved)
EXEC sp_rename '[dbo].[CountryOfOrigin]', 'Country';

-- Rename the constraints that carried the old table name, so the schema
-- matches what Prisma would generate for a table called `Country`.
--
-- All three are 'OBJECT', including the unique one: 0_init declares it as
-- `CONSTRAINT [CountryOfOrigin_name_key] UNIQUE NONCLUSTERED`, so it lives in
-- sys.objects. Passing 'INDEX' here fails with error 15248 ("the claimed
-- @objtype (INDEX) is wrong") — that form is for standalone CREATE INDEX
-- objects and wants a 'table.index' qualified name.
EXEC sp_rename '[dbo].[CountryOfOrigin_pkey]', 'Country_pkey', 'OBJECT';
EXEC sp_rename '[dbo].[CountryOfOrigin_name_key]', 'Country_name_key', 'OBJECT';
EXEC sp_rename '[dbo].[CountryOfOrigin_createdAt_df]', 'Country_createdAt_df', 'OBJECT';

-- AlterTable: the N/A escape hatch for pickers that need a real country.
ALTER TABLE [dbo].[Country] ADD [isSelectable] BIT NOT NULL CONSTRAINT [Country_isSelectable_df] DEFAULT 1;

EXEC('
UPDATE [dbo].[Country]
SET [isSelectable] = 0
WHERE [name] IN (''N/A'', ''NA'', ''n/a'');
');

-- AlterTable
ALTER TABLE [dbo].[Location] ADD [countryId] INT;

-- AlterTable
ALTER TABLE [dbo].[Vendor] ADD [countryId] INT;

-- Any vendor country string that is not already in the lookup becomes a row
-- there. Inserting rather than discarding: an unmatched value is real data the
-- admin entered, and dropping it silently would be worse than a lookup list
-- that needs a tidy-up pass.
EXEC('
INSERT INTO [dbo].[Country] ([name], [isSelectable], [updatedAt])
SELECT DISTINCT LTRIM(RTRIM(v.[country])), 1, CURRENT_TIMESTAMP
FROM [dbo].[Vendor] v
WHERE v.[country] IS NOT NULL
  AND LTRIM(RTRIM(v.[country])) <> ''''
  AND NOT EXISTS (
      SELECT 1 FROM [dbo].[Country] c WHERE c.[name] = LTRIM(RTRIM(v.[country]))
  );
');

-- Backfill the FK by matching the old free-text value.
EXEC('
UPDATE v SET v.[countryId] = c.[id]
FROM [dbo].[Vendor] v
INNER JOIN [dbo].[Country] c ON c.[name] = LTRIM(RTRIM(v.[country]));
');

-- DropColumn (the value is now carried by the FK above)
ALTER TABLE [dbo].[Vendor] DROP COLUMN [country];

-- CreateTable
CREATE TABLE [dbo].[VendorCountry] (
    [id] INT NOT NULL IDENTITY(1,1),
    [vendorId] INT NOT NULL,
    [countryId] INT NOT NULL,
    [isActive] BIT NOT NULL CONSTRAINT [VendorCountry_isActive_df] DEFAULT 1,
    [createdBy] INT,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [VendorCountry_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedBy] INT,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [VendorCountry_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [VendorCountry_vendorId_countryId_key] UNIQUE NONCLUSTERED ([vendorId],[countryId])
);

-- CreateIndex
CREATE NONCLUSTERED INDEX [VendorCountry_countryId_idx] ON [dbo].[VendorCountry]([countryId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Location_countryId_idx] ON [dbo].[Location]([countryId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Vendor_countryId_idx] ON [dbo].[Vendor]([countryId]);

-- AddForeignKey
ALTER TABLE [dbo].[Location] ADD CONSTRAINT [Location_countryId_fkey] FOREIGN KEY ([countryId]) REFERENCES [dbo].[Country]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[Vendor] ADD CONSTRAINT [Vendor_countryId_fkey] FOREIGN KEY ([countryId]) REFERENCES [dbo].[Country]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[VendorCountry] ADD CONSTRAINT [VendorCountry_vendorId_fkey] FOREIGN KEY ([vendorId]) REFERENCES [dbo].[Vendor]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[VendorCountry] ADD CONSTRAINT [VendorCountry_countryId_fkey] FOREIGN KEY ([countryId]) REFERENCES [dbo].[Country]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
