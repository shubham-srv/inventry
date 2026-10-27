/*
  Item-level minimum lead time, per vendor (on the vendor<->item mapping).
  NULL = fall back to Vendor.leadTimeDays, so existing orders read as before.

  REVERSING: drop the column.
*/
BEGIN TRY

BEGIN TRAN;

ALTER TABLE [dbo].[ItemVendor] ADD [leadTimeDays] INT;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
