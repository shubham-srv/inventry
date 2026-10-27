/*
  Vendor submission reminders. New scopes: VendorGlobal (all vendors) and
  Vendor (one vendor, via vendorId). Seeds the all-vendors default switched
  OFF, so no vendor is emailed until an admin enables it.

  REVERSING: delete VendorGlobal/Vendor rows, drop the FK, index and column.
*/
BEGIN TRY

BEGIN TRAN;

ALTER TABLE [dbo].[SchedulerSetting] ADD [vendorId] INT;

CREATE NONCLUSTERED INDEX [SchedulerSetting_vendorId_idx] ON [dbo].[SchedulerSetting]([vendorId]);

ALTER TABLE [dbo].[SchedulerSetting] ADD CONSTRAINT [SchedulerSetting_vendorId_fkey] FOREIGN KEY ([vendorId]) REFERENCES [dbo].[Vendor]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

INSERT INTO [dbo].[SchedulerSetting] ([scope], [cadenceType], [thresholdDays], [isEnabled], [updatedAt])
SELECT 'VendorGlobal', 'AfterNDays', 3, 0, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM [dbo].[SchedulerSetting] WHERE [scope] = 'VendorGlobal');

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
