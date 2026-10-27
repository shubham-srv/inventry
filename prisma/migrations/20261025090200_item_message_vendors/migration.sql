/*
  Item messages can go to vendors too. `recipients` = Growers | Vendors | Both
  (existing rows stay Growers); ItemMessageVendor holds Selected vendors.

  REVERSING: drop ItemMessageVendor, then the column and its default.
*/
BEGIN TRY

BEGIN TRAN;

ALTER TABLE [dbo].[ItemMessage] ADD [recipients] NVARCHAR(1000) NOT NULL CONSTRAINT [ItemMessage_recipients_df] DEFAULT 'Growers';

CREATE TABLE [dbo].[ItemMessageVendor] (
    [id] INT NOT NULL IDENTITY(1,1),
    [itemMessageId] INT NOT NULL,
    [vendorId] INT NOT NULL,
    CONSTRAINT [ItemMessageVendor_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [ItemMessageVendor_itemMessageId_vendorId_key] UNIQUE NONCLUSTERED ([itemMessageId],[vendorId])
);

CREATE NONCLUSTERED INDEX [ItemMessageVendor_vendorId_idx] ON [dbo].[ItemMessageVendor]([vendorId]);

ALTER TABLE [dbo].[ItemMessageVendor] ADD CONSTRAINT [ItemMessageVendor_itemMessageId_fkey] FOREIGN KEY ([itemMessageId]) REFERENCES [dbo].[ItemMessage]([id]) ON DELETE CASCADE ON UPDATE NO ACTION;

ALTER TABLE [dbo].[ItemMessageVendor] ADD CONSTRAINT [ItemMessageVendor_vendorId_fkey] FOREIGN KEY ([vendorId]) REFERENCES [dbo].[Vendor]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
