/*
  Location types become editable data instead of a hard-coded list.

  WHY. Admins need to add and rename site types without a deployment. The list
  previously lived in lib/constants.ts, so every change was a code change.

  WHY A FOREIGN KEY rather than leaving the name on Location. The whole point is
  that these are now editable, and editing means renaming. With the name copied
  onto every Location row, a rename is a second update that can half-fail and
  leave two spellings of the same type in circulation — the same trap the
  material-category rename already has. With a foreign key the name exists once.

  ONE RENAME SHIPS WITH THIS: "Grower Field" becomes "Grower Site". The backfill
  below maps the old name across, so a database that has it loses nothing.

  ORDER MATTERS. The lookup rows must exist before the backfill can match names,
  and the old column can only go once every row has an id. The foreign key is
  added last so the backfill cannot fail against a half-built constraint.

  REVERSING: add the string column back, repopulate from the join, drop the
  column and the table.
*/

-- 1. The lookup table.
CREATE TABLE [dbo].[LocationType] (
    [id]        INT            NOT NULL IDENTITY(1,1),
    [name]      NVARCHAR(100)  NOT NULL,
    [appliesTo] NVARCHAR(20)   NOT NULL CONSTRAINT [LocationType_appliesTo_df] DEFAULT 'Both',
    [isActive]  BIT            NOT NULL CONSTRAINT [LocationType_isActive_df]  DEFAULT 1,
    [sortOrder] INT            NOT NULL CONSTRAINT [LocationType_sortOrder_df] DEFAULT 0,
    [createdBy] INT,
    [createdAt] DATETIME2      NOT NULL CONSTRAINT [LocationType_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedBy] INT,
    [updatedAt] DATETIME2      NOT NULL,
    CONSTRAINT [LocationType_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [LocationType_name_key] UNIQUE NONCLUSTERED ([name])
);

-- 2. The list as it stood, with Grower Field renamed to Grower Site.
INSERT INTO [dbo].[LocationType] ([name], [appliesTo], [sortOrder], [updatedAt]) VALUES
    (N'Grower Site',          N'Grower', 1, CURRENT_TIMESTAMP),
    (N'Packing House',        N'Grower', 2, CURRENT_TIMESTAMP),
    (N'Cold Storage',         N'Grower', 3, CURRENT_TIMESTAMP),
    (N'Manufacturing Plant',  N'Vendor', 4, CURRENT_TIMESTAMP),
    (N'Distribution Center',  N'Vendor', 5, CURRENT_TIMESTAMP),
    (N'3PL Facility',         N'Vendor', 6, CURRENT_TIMESTAMP),
    (N'Warehouse',            N'Both',   7, CURRENT_TIMESTAMP),
    (N'Cross-dock',           N'Both',   8, CURRENT_TIMESTAMP);

-- 3. The new column.
ALTER TABLE [dbo].[Location] ADD [locationTypeId] INT NULL;

-- 4. Backfill by name. The CASE carries the one rename across; every other name
--    is unchanged, and a Location with no type (or an unrecognised one) keeps
--    NULL, which is what it already meant: pickable by neither side.
UPDATE L
SET [locationTypeId] = T.[id]
FROM [dbo].[Location] L
INNER JOIN [dbo].[LocationType] T
    ON T.[name] = CASE L.[locationType]
                      WHEN N'Grower Field' THEN N'Grower Site'
                      ELSE L.[locationType]
                  END;

-- 5. The old column has no readers left.
ALTER TABLE [dbo].[Location] DROP COLUMN [locationType];

-- 6. Constrain, now that every value is a real id.
CREATE NONCLUSTERED INDEX [Location_locationTypeId_idx] ON [dbo].[Location]([locationTypeId]);
ALTER TABLE [dbo].[Location]
    ADD CONSTRAINT [Location_locationTypeId_fkey]
    FOREIGN KEY ([locationTypeId]) REFERENCES [dbo].[LocationType]([id])
    ON DELETE NO ACTION ON UPDATE NO ACTION;
