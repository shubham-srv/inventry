BEGIN TRY

BEGIN TRAN;

-- CreateTable: single-use, short-lived sign-in links for external users.
-- Only the SHA-256 of the token's nonce is stored, so a leak of this table
-- yields nothing that can be redeemed.
CREATE TABLE [dbo].[MagicToken] (
    [id] INT NOT NULL IDENTITY(1,1),
    [userId] INT NOT NULL,
    [tokenHash] NVARCHAR(1000) NOT NULL,
    [expiresAt] DATETIME2 NOT NULL,
    [consumedAt] DATETIME2,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [MagicToken_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [MagicToken_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [MagicToken_tokenHash_key] UNIQUE NONCLUSTERED ([tokenHash])
);

-- CreateIndex
CREATE NONCLUSTERED INDEX [MagicToken_userId_idx] ON [dbo].[MagicToken]([userId]);

-- AddForeignKey
ALTER TABLE [dbo].[MagicToken] ADD CONSTRAINT [MagicToken_userId_fkey] FOREIGN KEY ([userId]) REFERENCES [dbo].[User]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AlterTable: turn NotificationLog from an audit trail into a real outbox.
-- Existing rows keep their meaning: they are historical "Mocked"/"Sent" records
-- with no attempts and no scheduled retry, which is exactly what the defaults say.
ALTER TABLE [dbo].[NotificationLog] ADD
    [priority] INT NOT NULL CONSTRAINT [NotificationLog_priority_df] DEFAULT 5,
    [attempts] INT NOT NULL CONSTRAINT [NotificationLog_attempts_df] DEFAULT 0,
    [lastAttemptAt] DATETIME2,
    [nextAttemptAt] DATETIME2,
    [lastError] NVARCHAR(1000);

-- CreateIndex: the dispatcher's claim query orders by priority then age within
-- a single status. Wrapped in EXEC so the columns added above resolve at
-- execution time rather than at compile time of this batch.
EXEC(N'CREATE NONCLUSTERED INDEX [NotificationLog_status_priority_createdAt_idx] ON [dbo].[NotificationLog]([status], [priority], [createdAt])');

-- CreateIndex: the rolling rate-limit window counts attempts in the last
-- minute/hour, which is a range scan over this column on every dispatch pass.
EXEC(N'CREATE NONCLUSTERED INDEX [NotificationLog_lastAttemptAt_idx] ON [dbo].[NotificationLog]([lastAttemptAt])');

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
