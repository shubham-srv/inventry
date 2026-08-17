/*
  Three removals.

  1. `Item.regionId` — items keep country of origin as their only geography.
  2. `Vendor.regionId` — a vendor's region is now read through its location.
     `Vendor.countryId` deliberately STAYS: that is where the vendor is
     headquartered, which can differ from the country of the facility they ship
     from, so it is not something the location can supply.
  3. `SchedulerSetting.reminderFrequency` — dead since it was added. Nothing ever
     read it; runReminderCheck's "at most one reminder per grower per day" comes
     from a NotificationLog check, so the column's Daily/Weekly setting had no
     effect whatsoever.

  `Region` itself is kept — Location still points at it.

  DATA LOSS IS INTENTIONAL AND NOT RECOVERABLE. The Item and Vendor region
  values were backfilled from free text in 20260731090000; dropping the columns
  discards them. Vendor region remains derivable via Location, but only for
  vendors that have a location — take a backup first if the old vendor values
  matter to anyone.

  NOTE ON DEFAULT CONSTRAINTS: SQL Server refuses to drop a column while a
  default constraint is bound to it, so `SchedulerSetting_reminderFrequency_df`
  is dropped first. The region columns are nullable with no default, so they
  only need their index and FK removed.
*/

BEGIN TRY

BEGIN TRAN;

-- DropForeignKey
ALTER TABLE [dbo].[Item] DROP CONSTRAINT [Item_regionId_fkey];

-- DropIndex
DROP INDEX [Item_regionId_idx] ON [dbo].[Item];

-- DropColumn
ALTER TABLE [dbo].[Item] DROP COLUMN [regionId];

-- DropForeignKey
ALTER TABLE [dbo].[Vendor] DROP CONSTRAINT [Vendor_regionId_fkey];

-- DropIndex
DROP INDEX [Vendor_regionId_idx] ON [dbo].[Vendor];

-- DropColumn
ALTER TABLE [dbo].[Vendor] DROP COLUMN [regionId];

-- DropDefaultConstraint (must go before the column it is bound to)
ALTER TABLE [dbo].[SchedulerSetting] DROP CONSTRAINT [SchedulerSetting_reminderFrequency_df];

-- DropColumn
ALTER TABLE [dbo].[SchedulerSetting] DROP COLUMN [reminderFrequency];

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
