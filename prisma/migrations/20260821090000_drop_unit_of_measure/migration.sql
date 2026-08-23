/*
  The unit of measure goes away. A quantity is counted in the item's MATERIAL
  CATEGORY — an item in "Boxes" is counted in boxes — so every count, order and
  threshold is expressed in the same terms by construction, and a separately
  chosen unit could only ever disagree with it.

  Six columns go:
    Item.unitOfMeasure                    the only one anybody ever authored
    GrowerSubmissionDetail.unitOfMeasure  } denormalised copies of the item's
    VendorSubmissionDetail.unitOfMeasure  } unit, written from it every time and
    Order.unitOfMeasure                   } never independently set
    ItemThreshold.unitOfMeasure           }
    PackagingChain.baseUnit               a chain already belongs to a material
                                          category; this was a second, hand-typed
                                          label for the same thing, and the only
                                          reason a chain named "Cases → Pallets"
                                          could sit inside a category named "Boxes"

  ⚠️ DATA LOSS IS INTENTIONAL AND NOT RECOVERABLE — and it RELABELS HISTORY.
  Quantities are untouched, but what they are labelled with changes wherever a
  category's name differs from the unit its items were counted in. On the demo
  seed that is three of five categories:

      BX  named "Boxes"     items were counted in Cases  -> now reads "Boxes"
      LB  named "Labels"    items were counted in Rolls   -> now reads "Labels"
      ST  named "Stickers"  items were counted in Rolls   -> now reads "Stickers"
      BG  named "Bags"      counted in Bags               -> unchanged
      PL  named "Pallets"   counted in Pallets            -> unchanged

  A stored 300 that meant 300 rolls of stickers will render "300 Stickers". The
  NUMBER is right and always was; only the word beside it changes. If the
  categories in your database are named after the units their items are counted
  in, nothing changes at all. TAKE A BACKUP FIRST if the old values matter — this
  script does not preserve them anywhere.

  No EXEC() wrapping is needed here: there are no backfills, so no statement
  references a column that a later statement drops. None of these six columns has
  a default constraint, index or FK bound to it, so each drops directly.
*/

BEGIN TRY

BEGIN TRAN;

-- DropColumn
ALTER TABLE [dbo].[Item] DROP COLUMN [unitOfMeasure];

-- DropColumn
ALTER TABLE [dbo].[GrowerSubmissionDetail] DROP COLUMN [unitOfMeasure];

-- DropColumn
ALTER TABLE [dbo].[VendorSubmissionDetail] DROP COLUMN [unitOfMeasure];

-- DropColumn
ALTER TABLE [dbo].[Order] DROP COLUMN [unitOfMeasure];

-- DropColumn
ALTER TABLE [dbo].[ItemThreshold] DROP COLUMN [unitOfMeasure];

-- DropColumn
ALTER TABLE [dbo].[PackagingChain] DROP COLUMN [baseUnit];

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
