/*
  Packaging chains, per-vendor pack ratios, order receipt validation, and
  numeric vendor terms.

  1. Vendor.leadTime / .paymentTerms were free text ("5 days", "Net 30"). They
     become INT day counts. The old values are parsed for their first run of
     digits; anything unparseable lands as NULL rather than blocking the
     migration.
  2. PackagingChain / PackagingChainLevel describe HOW a SKU is packed
     ("Bags -> Boxes -> Cases") with no numbers, scoped to a material category.
     VendorPackRatio holds the numbers per vendor, hanging off ItemVendor —
     which also gains the chain choice and the level the vendor ships in.
  3. Order gains expected/received quantities for receipt validation, plus
     OrderPackLine: an immutable per-level snapshot of what the order resolved
     to, so later ratio edits never rewrite history.
  4. UnitConversion is dropped. It was reference data only — nothing read it.

  NOTE ON `EXEC(...)`: SQL Server compiles a batch up front, so a statement
  referencing a column added earlier in the SAME batch fails with "Invalid
  column name". The Vendor backfills therefore run through EXEC so they compile
  only after the ALTER TABLE has run. Same pattern as migration 20260731090000.
*/

BEGIN TRY

BEGIN TRAN;

-- ------------------------------------------------------------------
-- 1. Vendor: free-text terms -> integer day counts
-- ------------------------------------------------------------------

-- AlterTable
ALTER TABLE [dbo].[Vendor] ADD [leadTimeDays] INT, [paymentTermsDays] INT;

-- Backfill: take the first contiguous run of digits ("5 days" -> 5,
-- "Net 30" -> 30). The trailing 'X' guarantees PATINDEX finds a non-digit
-- terminator even when the string ends in a digit.
EXEC('
UPDATE [dbo].[Vendor]
SET [leadTimeDays] = TRY_CAST(
        SUBSTRING(
            [leadTime],
            PATINDEX(''%[0-9]%'', [leadTime]),
            PATINDEX(''%[^0-9]%'', SUBSTRING([leadTime], PATINDEX(''%[0-9]%'', [leadTime]), 100) + ''X'') - 1
        ) AS INT)
WHERE [leadTime] IS NOT NULL AND PATINDEX(''%[0-9]%'', [leadTime]) > 0;
');

EXEC('
UPDATE [dbo].[Vendor]
SET [paymentTermsDays] = TRY_CAST(
        SUBSTRING(
            [paymentTerms],
            PATINDEX(''%[0-9]%'', [paymentTerms]),
            PATINDEX(''%[^0-9]%'', SUBSTRING([paymentTerms], PATINDEX(''%[0-9]%'', [paymentTerms]), 100) + ''X'') - 1
        ) AS INT)
WHERE [paymentTerms] IS NOT NULL AND PATINDEX(''%[0-9]%'', [paymentTerms]) > 0;
');

-- AlterTable
ALTER TABLE [dbo].[Vendor] DROP COLUMN [leadTime], COLUMN [paymentTerms];

-- ------------------------------------------------------------------
-- 2. Packaging chains + per-vendor ratios
-- ------------------------------------------------------------------

-- CreateTable
CREATE TABLE [dbo].[PackagingChain] (
    [id] INT NOT NULL IDENTITY(1,1),
    [materialCategoryCode] NVARCHAR(1000) NOT NULL,
    [name] NVARCHAR(1000) NOT NULL,
    [baseUnit] NVARCHAR(1000) NOT NULL,
    [isActive] BIT NOT NULL CONSTRAINT [PackagingChain_isActive_df] DEFAULT 1,
    [createdBy] INT,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [PackagingChain_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedBy] INT,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [PackagingChain_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[PackagingChainLevel] (
    [id] INT NOT NULL IDENTITY(1,1),
    [chainId] INT NOT NULL,
    [level] INT NOT NULL,
    [unitName] NVARCHAR(1000) NOT NULL,
    CONSTRAINT [PackagingChainLevel_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [PackagingChainLevel_chainId_level_key] UNIQUE NONCLUSTERED ([chainId],[level])
);

-- CreateTable
CREATE TABLE [dbo].[VendorPackRatio] (
    [id] INT NOT NULL IDENTITY(1,1),
    [itemVendorId] INT NOT NULL,
    [level] INT NOT NULL,
    [perParent] INT NOT NULL,
    [createdBy] INT,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [VendorPackRatio_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedBy] INT,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [VendorPackRatio_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [VendorPackRatio_itemVendorId_level_key] UNIQUE NONCLUSTERED ([itemVendorId],[level])
);

-- AlterTable: ItemVendor carries the chain choice + shipping level.
-- shipsInLevel 0 = the item's own unit, i.e. partial containers are allowed and
-- the delivered quantity equals the ordered quantity.
ALTER TABLE [dbo].[ItemVendor] ADD [packagingChainId] INT,
    [shipsInLevel] INT NOT NULL CONSTRAINT [ItemVendor_shipsInLevel_df] DEFAULT 0;

-- ------------------------------------------------------------------
-- 3. Order receipt validation + pack snapshot
-- ------------------------------------------------------------------

-- AlterTable
ALTER TABLE [dbo].[Order] ADD [expectedQuantity] DECIMAL(32,16),
    [receivedQuantity] DECIMAL(32,16),
    [receiptNote] NVARCHAR(1000);

-- CreateTable
CREATE TABLE [dbo].[OrderPackLine] (
    [id] INT NOT NULL IDENTITY(1,1),
    [orderId] INT NOT NULL,
    [level] INT NOT NULL,
    [unitName] NVARCHAR(1000) NOT NULL,
    [quantity] DECIMAL(32,16) NOT NULL,
    CONSTRAINT [OrderPackLine_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [OrderPackLine_orderId_level_key] UNIQUE NONCLUSTERED ([orderId],[level])
);

-- ------------------------------------------------------------------
-- 4. Retire UnitConversion (reference data only — nothing read it)
-- ------------------------------------------------------------------

-- DropTable
DROP TABLE [dbo].[UnitConversion];

-- ------------------------------------------------------------------
-- Indexes + foreign keys
-- ------------------------------------------------------------------

-- CreateIndex
CREATE NONCLUSTERED INDEX [PackagingChain_materialCategoryCode_idx] ON [dbo].[PackagingChain]([materialCategoryCode]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [ItemVendor_packagingChainId_idx] ON [dbo].[ItemVendor]([packagingChainId]);

-- AddForeignKey
ALTER TABLE [dbo].[PackagingChain] ADD CONSTRAINT [PackagingChain_materialCategoryCode_fkey] FOREIGN KEY ([materialCategoryCode]) REFERENCES [dbo].[MaterialCategory]([code]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[PackagingChainLevel] ADD CONSTRAINT [PackagingChainLevel_chainId_fkey] FOREIGN KEY ([chainId]) REFERENCES [dbo].[PackagingChain]([id]) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[ItemVendor] ADD CONSTRAINT [ItemVendor_packagingChainId_fkey] FOREIGN KEY ([packagingChainId]) REFERENCES [dbo].[PackagingChain]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[VendorPackRatio] ADD CONSTRAINT [VendorPackRatio_itemVendorId_fkey] FOREIGN KEY ([itemVendorId]) REFERENCES [dbo].[ItemVendor]([id]) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[OrderPackLine] ADD CONSTRAINT [OrderPackLine_orderId_fkey] FOREIGN KEY ([orderId]) REFERENCES [dbo].[Order]([id]) ON DELETE CASCADE ON UPDATE NO ACTION;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
