/*
  Spanish (etc.) names for commodities and material categories, shown to
  growers and vendors. One row per (code, locale); rows cascade with their
  parent. Item names need no table: they are ItemTranslation rows with
  field = 'itemName'.

  REVERSING: drop both tables.
*/
BEGIN TRY

BEGIN TRAN;

CREATE TABLE [dbo].[CommodityTranslation] (
    [id] INT NOT NULL IDENTITY(1,1),
    [commodityCode] NVARCHAR(1000) NOT NULL,
    [locale] NVARCHAR(1000) NOT NULL,
    [name] NVARCHAR(1000) NOT NULL,
    [isMachine] BIT NOT NULL CONSTRAINT [CommodityTranslation_isMachine_df] DEFAULT 1,
    [createdBy] INT,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [CommodityTranslation_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedBy] INT,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [CommodityTranslation_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [CommodityTranslation_commodityCode_locale_key] UNIQUE NONCLUSTERED ([commodityCode],[locale])
);

CREATE TABLE [dbo].[MaterialCategoryTranslation] (
    [id] INT NOT NULL IDENTITY(1,1),
    [materialCategoryCode] NVARCHAR(1000) NOT NULL,
    [locale] NVARCHAR(1000) NOT NULL,
    [name] NVARCHAR(1000) NOT NULL,
    [isMachine] BIT NOT NULL CONSTRAINT [MaterialCategoryTranslation_isMachine_df] DEFAULT 1,
    [createdBy] INT,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [MaterialCategoryTranslation_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedBy] INT,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [MaterialCategoryTranslation_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [MaterialCategoryTranslation_materialCategoryCode_locale_key] UNIQUE NONCLUSTERED ([materialCategoryCode],[locale])
);

ALTER TABLE [dbo].[CommodityTranslation] ADD CONSTRAINT [CommodityTranslation_commodityCode_fkey] FOREIGN KEY ([commodityCode]) REFERENCES [dbo].[Commodity]([code]) ON DELETE CASCADE ON UPDATE NO ACTION;

ALTER TABLE [dbo].[MaterialCategoryTranslation] ADD CONSTRAINT [MaterialCategoryTranslation_materialCategoryCode_fkey] FOREIGN KEY ([materialCategoryCode]) REFERENCES [dbo].[MaterialCategory]([code]) ON DELETE CASCADE ON UPDATE NO ACTION;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
