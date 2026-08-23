/*
  Packaging becomes purely informational.

  The ratios describe outer boxes, cases and pallets — shipping material that is
  discarded on receipt. It is not inventory and never was, so it must not decide
  an inventory number. Until now it did: ordering 343 bags from a vendor who
  "ships in whole boxes" stored expectedQuantity 350 and prefilled the receipt
  dialog with 350. What a grower orders is now what a grower receives.

  Two columns go, both of which existed only to serve that rounding:

    ItemVendor.shipsInLevel    named the level that had to be a whole container,
                               which is the only thing that ever triggered a
                               round-up
    Order.expectedQuantity     the rounded-up figure. With no rounding it would
                               always equal Order.quantity, so it is dead weight

  WHAT SURVIVES, deliberately:
    - OrderPackLine            still snapshotted per order, now purely a
                               description of what the ordered quantity occupies
                               ("343 Bags · 35 Boxes · 7 Cases"). Level 0 now
                               equals Order.quantity rather than exceeding it.
    - PackagingChain / VendorPackRatio  unchanged; the cascade maths still runs,
                               it just no longer feeds back into the quantity.
    - Order.receivedQuantity / receiptNote  the discrepancy signal is kept and is
                               now more useful: it compares against what was
                               ORDERED, so a mismatch means a real short/over
                               delivery rather than a packaging artefact.

  DATA LOSS: existing expectedQuantity values are discarded. Where a historical
  order was rounded up, its receivedQuantity keeps the figure that was actually
  confirmed at the time — that number is not touched. Its pack lines keep the
  level-0 figure recorded then, so old orders continue to read as they did.

  ORDER MATTERS: SQL Server refuses to drop a column while a default constraint
  is bound to it, so ItemVendor_shipsInLevel_df goes first. Order.expectedQuantity
  is nullable with no default and drops directly.
*/

BEGIN TRY

BEGIN TRAN;

-- DropColumn
ALTER TABLE [dbo].[Order] DROP COLUMN [expectedQuantity];

-- DropDefaultConstraint (must go before the column it is bound to)
ALTER TABLE [dbo].[ItemVendor] DROP CONSTRAINT [ItemVendor_shipsInLevel_df];

-- DropColumn
ALTER TABLE [dbo].[ItemVendor] DROP COLUMN [shipsInLevel];

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
