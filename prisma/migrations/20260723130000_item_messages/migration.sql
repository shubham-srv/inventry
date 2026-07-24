BEGIN TRY

BEGIN TRAN;

-- CreateTable
CREATE TABLE [dbo].[ItemMessage] (
    [id] INT NOT NULL IDENTITY(1,1),
    [itemId] NVARCHAR(1000) NOT NULL,
    [type] NVARCHAR(1000) NOT NULL,
    [body] NVARCHAR(1000),
    [severity] NVARCHAR(1000) NOT NULL CONSTRAINT [ItemMessage_severity_df] DEFAULT 'info',
    [audience] NVARCHAR(1000) NOT NULL CONSTRAINT [ItemMessage_audience_df] DEFAULT 'All',
    [isActive] BIT NOT NULL CONSTRAINT [ItemMessage_isActive_df] DEFAULT 1,
    [startsAt] DATETIME2,
    [endsAt] DATETIME2,
    [createdBy] INT,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [ItemMessage_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedBy] INT,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [ItemMessage_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[ItemMessageGrower] (
    [id] INT NOT NULL IDENTITY(1,1),
    [itemMessageId] INT NOT NULL,
    [growerId] INT NOT NULL,
    CONSTRAINT [ItemMessageGrower_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [ItemMessageGrower_itemMessageId_growerId_key] UNIQUE NONCLUSTERED ([itemMessageId],[growerId])
);

-- CreateIndex
CREATE NONCLUSTERED INDEX [ItemMessage_itemId_idx] ON [dbo].[ItemMessage]([itemId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [ItemMessageGrower_growerId_idx] ON [dbo].[ItemMessageGrower]([growerId]);

-- AddForeignKey
ALTER TABLE [dbo].[ItemMessage] ADD CONSTRAINT [ItemMessage_itemId_fkey] FOREIGN KEY ([itemId]) REFERENCES [dbo].[Item]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[ItemMessageGrower] ADD CONSTRAINT [ItemMessageGrower_itemMessageId_fkey] FOREIGN KEY ([itemMessageId]) REFERENCES [dbo].[ItemMessage]([id]) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[ItemMessageGrower] ADD CONSTRAINT [ItemMessageGrower_growerId_fkey] FOREIGN KEY ([growerId]) REFERENCES [dbo].[Grower]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
