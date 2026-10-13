/*
  The vendor's side of an order.

  expectedDeliveryDate stays the grower's REQUESTED date. The vendor answers with
  confirmedDeliveryDate (stamped with when and by whom); once set, delivery is
  measured against it instead of the request. Existing orders have no answer,
  which is exactly how they read today.

  REVERSING: drop the three columns.
*/
BEGIN TRY

BEGIN TRAN;

ALTER TABLE [dbo].[Order] ADD [confirmedDeliveryDate] DATETIME2,
[confirmedAt] DATETIME2,
[confirmedBy] INT;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
