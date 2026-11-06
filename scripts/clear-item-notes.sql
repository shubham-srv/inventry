-- One-off: remove every item's notes, and their Spanish translations.
-- The translations must go too: the app shows a stored translation even when
-- the English note is empty. Run against the target DB (Azure Data Studio/sqlcmd).
SET XACT_ABORT ON;
BEGIN TRANSACTION;

DELETE FROM [dbo].[ItemTranslation] WHERE [field] = N'notes';
UPDATE [dbo].[Item] SET [notes] = NULL WHERE [notes] IS NOT NULL;

COMMIT TRANSACTION;
