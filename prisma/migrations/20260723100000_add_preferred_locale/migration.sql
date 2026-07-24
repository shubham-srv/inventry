BEGIN TRY

BEGIN TRAN;

-- AlterTable: per-user UI + email language preference (self-served via the language switcher)
ALTER TABLE [dbo].[User] ADD [preferredLocale] NVARCHAR(1000) NOT NULL CONSTRAINT [User_preferredLocale_df] DEFAULT 'en';

-- AlterTable: grower org email language — used by BOTH triggered and scheduled emails,
-- so it must live in the DB (scheduled reminders run headless with no request cookie).
ALTER TABLE [dbo].[Grower] ADD [preferredLocale] NVARCHAR(1000) NOT NULL CONSTRAINT [Grower_preferredLocale_df] DEFAULT 'en';

-- AlterTable: vendor org email language
ALTER TABLE [dbo].[Vendor] ADD [preferredLocale] NVARCHAR(1000) NOT NULL CONSTRAINT [Vendor_preferredLocale_df] DEFAULT 'en';

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
