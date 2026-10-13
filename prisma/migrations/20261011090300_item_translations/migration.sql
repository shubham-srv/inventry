/*
  Translations of an item's admin-typed text.

  One row per (item, field, locale). `notes` is the only field today; adding
  item names later is a new `field` value, not a new table. Rows cascade with
  their item — they mean nothing without it.

  REVERSING: drop the table.
*/
BEGIN TRY

BEGIN TRAN;

CREATE TABLE [dbo].[ItemTranslation] (
    [id] INT NOT NULL IDENTITY(1,1),
    [itemId] NVARCHAR(1000) NOT NULL,
    [field] NVARCHAR(1000) NOT NULL,
    [locale] NVARCHAR(1000) NOT NULL,
    [text] NVARCHAR(max) NOT NULL,
    [isMachine] BIT NOT NULL CONSTRAINT [ItemTranslation_isMachine_df] DEFAULT 1,
    [createdBy] INT,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [ItemTranslation_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedBy] INT,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [ItemTranslation_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [ItemTranslation_itemId_field_locale_key] UNIQUE NONCLUSTERED ([itemId],[field],[locale])
);

ALTER TABLE [dbo].[ItemTranslation] ADD CONSTRAINT [ItemTranslation_itemId_fkey] FOREIGN KEY ([itemId]) REFERENCES [dbo].[Item]([id]) ON DELETE CASCADE ON UPDATE NO ACTION;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
