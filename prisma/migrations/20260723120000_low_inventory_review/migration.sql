BEGIN TRY

BEGIN TRAN;

-- AlterTable: add admin review workflow to low-inventory flags. Mirrors the
-- MissingItemRequest review columns. isActive stays the live/queue flag; these
-- record WHO reviewed and any notes when an admin clears the flag.
ALTER TABLE [dbo].[LowInventoryFlag] ADD [reviewedBy] INT,
[reviewedAt] DATETIME2,
[reviewNotes] NVARCHAR(1000);

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
