/*
  Localized item-message notes.

  ItemMessage.type is already a translatable key resolved from the dictionaries,
  but `body` is free text and was shown to every grower exactly as authored — so
  a Spanish-preference grower saw a localized label followed by an English note.

  Translations are stored per locale and written when the message is SAVED, not
  when it is read: these notes are authored rarely and displayed constantly, so
  translating per page view would re-translate identical text thousands of times
  and put an external API call in the grower's critical path.
*/

BEGIN TRY

BEGIN TRAN;

-- CreateTable
CREATE TABLE [dbo].[ItemMessageTranslation] (
    [id] INT NOT NULL IDENTITY(1,1),
    [itemMessageId] INT NOT NULL,
    [locale] NVARCHAR(1000) NOT NULL,
    [body] NVARCHAR(1000) NOT NULL,
    [isMachine] BIT NOT NULL CONSTRAINT [ItemMessageTranslation_isMachine_df] DEFAULT 1,
    [createdBy] INT,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [ItemMessageTranslation_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedBy] INT,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [ItemMessageTranslation_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [ItemMessageTranslation_itemMessageId_locale_key] UNIQUE NONCLUSTERED ([itemMessageId],[locale])
);

-- AddForeignKey
ALTER TABLE [dbo].[ItemMessageTranslation] ADD CONSTRAINT [ItemMessageTranslation_itemMessageId_fkey] FOREIGN KEY ([itemMessageId]) REFERENCES [dbo].[ItemMessage]([id]) ON DELETE CASCADE ON UPDATE NO ACTION;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
