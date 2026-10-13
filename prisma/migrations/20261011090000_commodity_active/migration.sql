/*
  Commodities can be disabled.

  Item.status is deliberately NOT touched: an item counts as active only while
  both it and its commodity are (lib/items/active.ts). Turning a commodity back
  on therefore restores every item exactly as it was, including the ones that
  were individually inactive before.

  REVERSING: drop the column (and its default constraint).
*/
BEGIN TRY

BEGIN TRAN;

ALTER TABLE [dbo].[Commodity] ADD [isActive] BIT NOT NULL CONSTRAINT [Commodity_isActive_df] DEFAULT 1;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
