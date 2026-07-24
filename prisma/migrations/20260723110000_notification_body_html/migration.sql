BEGIN TRY

BEGIN TRAN;

-- AlterTable: store the rendered React Email HTML alongside the plaintext body,
-- so the in-app Outbox can preview the real (bilingual) email and ACS can send
-- an html part. NVARCHAR(max) because rendered email HTML far exceeds 1000 chars.
ALTER TABLE [dbo].[NotificationLog] ADD [bodyHtml] NVARCHAR(max);

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
