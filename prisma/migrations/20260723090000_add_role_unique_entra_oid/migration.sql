BEGIN TRY

BEGIN TRAN;

-- AlterTable: add Entra object id (oid) to User for internal SSO identity matching
ALTER TABLE [dbo].[User] ADD [entraObjectId] NVARCHAR(1000);

-- CreateIndex: enforce unique role names (used as the idempotent upsert key in bootstrap)
ALTER TABLE [dbo].[Role] ADD CONSTRAINT [Role_roleName_key] UNIQUE NONCLUSTERED ([roleName]);

-- CreateIndex: unique Entra oid, FILTERED so many external/demo users can keep NULL.
-- (A plain SQL Server UNIQUE constraint treats NULLs as equal and allows only one.)
-- Wrapped in EXEC so the column added earlier in this batch resolves at execution
-- time, not at compile time (otherwise: "Invalid column name 'entraObjectId'").
EXEC(N'CREATE UNIQUE INDEX [User_entraObjectId_key] ON [dbo].[User]([entraObjectId]) WHERE [entraObjectId] IS NOT NULL');

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
