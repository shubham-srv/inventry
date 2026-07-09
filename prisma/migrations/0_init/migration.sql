BEGIN TRY

BEGIN TRAN;

-- CreateSchema
IF NOT EXISTS (SELECT * FROM sys.schemas WHERE name = N'dbo') EXEC sp_executesql N'CREATE SCHEMA [dbo];';

-- CreateTable
CREATE TABLE [dbo].[Role] (
    [id] INT NOT NULL IDENTITY(1,1),
    [roleName] NVARCHAR(1000) NOT NULL,
    [description] NVARCHAR(1000),
    [createdBy] INT,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [Role_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedBy] INT,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [Role_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[User] (
    [id] INT NOT NULL IDENTITY(1,1),
    [firstName] NVARCHAR(1000) NOT NULL,
    [lastName] NVARCHAR(1000) NOT NULL,
    [email] NVARCHAR(1000) NOT NULL,
    [passwordHash] NVARCHAR(1000),
    [roleId] INT NOT NULL,
    [growerId] INT,
    [vendorId] INT,
    [isActive] BIT NOT NULL CONSTRAINT [User_isActive_df] DEFAULT 1,
    [createdBy] INT,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [User_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedBy] INT,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [User_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [User_email_key] UNIQUE NONCLUSTERED ([email])
);

-- CreateTable
CREATE TABLE [dbo].[Grower] (
    [id] INT NOT NULL IDENTITY(1,1),
    [growerName] NVARCHAR(1000) NOT NULL,
    [primaryEmail] NVARCHAR(1000),
    [status] NVARCHAR(1000) NOT NULL CONSTRAINT [Grower_status_df] DEFAULT 'Active',
    [createdBy] INT,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [Grower_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedBy] INT,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [Grower_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[Vendor] (
    [id] INT NOT NULL IDENTITY(1,1),
    [vendorName] NVARCHAR(1000) NOT NULL,
    [vendorType] NVARCHAR(1000),
    [region] NVARCHAR(1000),
    [country] NVARCHAR(1000),
    [primaryContact] NVARCHAR(1000),
    [contactEmail] NVARCHAR(1000),
    [contactPhone] NVARCHAR(1000),
    [leadTime] NVARCHAR(1000),
    [paymentTerms] NVARCHAR(1000),
    [ptAccountNumber] NVARCHAR(1000),
    [notes] NVARCHAR(1000),
    [status] NVARCHAR(1000) NOT NULL CONSTRAINT [Vendor_status_df] DEFAULT 'Active',
    [createdBy] INT,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [Vendor_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedBy] INT,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [Vendor_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[Location] (
    [id] INT NOT NULL IDENTITY(1,1),
    [locationName] NVARCHAR(1000) NOT NULL,
    [locationType] NVARCHAR(1000),
    [region] NVARCHAR(1000),
    [commodityFocus] NVARCHAR(1000),
    [keyPersonnel] NVARCHAR(1000),
    [notes] NVARCHAR(1000),
    [createdBy] INT,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [Location_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedBy] INT,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [Location_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[Commodity] (
    [code] NVARCHAR(1000) NOT NULL,
    [name] NVARCHAR(1000) NOT NULL,
    [createdBy] INT,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [Commodity_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedBy] INT,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [Commodity_pkey] PRIMARY KEY CLUSTERED ([code])
);

-- CreateTable
CREATE TABLE [dbo].[MaterialCategory] (
    [code] NVARCHAR(1000) NOT NULL,
    [name] NVARCHAR(1000) NOT NULL,
    [createdBy] INT,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [MaterialCategory_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedBy] INT,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [MaterialCategory_pkey] PRIMARY KEY CLUSTERED ([code])
);

-- CreateTable
CREATE TABLE [dbo].[SubCategory] (
    [id] INT NOT NULL IDENTITY(1,1),
    [materialCategoryCode] NVARCHAR(1000) NOT NULL,
    [name] NVARCHAR(1000) NOT NULL,
    [createdBy] INT,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [SubCategory_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedBy] INT,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [SubCategory_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[Item] (
    [id] NVARCHAR(1000) NOT NULL,
    [legacyFamousId] NVARCHAR(1000),
    [itemName] NVARCHAR(1000) NOT NULL,
    [commodityCode] NVARCHAR(1000),
    [materialCategoryCode] NVARCHAR(1000),
    [subCategoryId] INT,
    [productClass] NVARCHAR(1000),
    [countryOfOriginId] INT,
    [applicationMethod] NVARCHAR(1000),
    [status] NVARCHAR(1000) NOT NULL CONSTRAINT [Item_status_df] DEFAULT 'Active',
    [notes] NVARCHAR(1000),
    [region] NVARCHAR(1000),
    [createdBy] INT,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [Item_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedBy] INT,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [Item_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[CountryOfOrigin] (
    [id] INT NOT NULL IDENTITY(1,1),
    [name] NVARCHAR(1000) NOT NULL,
    [createdBy] INT,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [CountryOfOrigin_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedBy] INT,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [CountryOfOrigin_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [CountryOfOrigin_name_key] UNIQUE NONCLUSTERED ([name])
);

-- CreateTable
CREATE TABLE [dbo].[GrowerItemAuthorization] (
    [id] INT NOT NULL IDENTITY(1,1),
    [growerId] INT NOT NULL,
    [itemId] NVARCHAR(1000) NOT NULL,
    [isActive] BIT NOT NULL CONSTRAINT [GrowerItemAuthorization_isActive_df] DEFAULT 1,
    [createdBy] INT,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [GrowerItemAuthorization_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedBy] INT,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [GrowerItemAuthorization_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [GrowerItemAuthorization_growerId_itemId_key] UNIQUE NONCLUSTERED ([growerId],[itemId])
);

-- CreateTable
CREATE TABLE [dbo].[ItemVendor] (
    [id] INT NOT NULL IDENTITY(1,1),
    [vendorId] INT NOT NULL,
    [itemId] NVARCHAR(1000) NOT NULL,
    [isActive] BIT NOT NULL CONSTRAINT [ItemVendor_isActive_df] DEFAULT 1,
    [createdBy] INT,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [ItemVendor_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedBy] INT,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [ItemVendor_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [ItemVendor_vendorId_itemId_key] UNIQUE NONCLUSTERED ([vendorId],[itemId])
);

-- CreateTable
CREATE TABLE [dbo].[VendorMaterialCategory] (
    [id] INT NOT NULL IDENTITY(1,1),
    [vendorId] INT NOT NULL,
    [materialCategoryCode] NVARCHAR(1000) NOT NULL,
    [isActive] BIT NOT NULL CONSTRAINT [VendorMaterialCategory_isActive_df] DEFAULT 1,
    [createdBy] INT,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [VendorMaterialCategory_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedBy] INT,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [VendorMaterialCategory_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [VendorMaterialCategory_vendorId_materialCategoryCode_key] UNIQUE NONCLUSTERED ([vendorId],[materialCategoryCode])
);

-- CreateTable
CREATE TABLE [dbo].[GrowerSubmission] (
    [id] INT NOT NULL IDENTITY(1,1),
    [growerId] INT NOT NULL,
    [submittedBy] INT NOT NULL,
    [submissionDate] DATETIME2 NOT NULL CONSTRAINT [GrowerSubmission_submissionDate_df] DEFAULT CURRENT_TIMESTAMP,
    [status] NVARCHAR(1000) NOT NULL CONSTRAINT [GrowerSubmission_status_df] DEFAULT 'Approved',
    [reviewedBy] INT,
    [reviewedAt] DATETIME2,
    [comments] NVARCHAR(1000),
    [createdBy] INT,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [GrowerSubmission_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedBy] INT,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [GrowerSubmission_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[GrowerSubmissionDetail] (
    [id] INT NOT NULL IDENTITY(1,1),
    [submissionId] INT NOT NULL,
    [itemId] NVARCHAR(1000) NOT NULL,
    [locationId] INT,
    [quantityOnHand] DECIMAL(32,16) NOT NULL CONSTRAINT [GrowerSubmissionDetail_quantityOnHand_df] DEFAULT 0,
    [unitOfMeasure] NVARCHAR(1000),
    [isLowFlagged] BIT NOT NULL CONSTRAINT [GrowerSubmissionDetail_isLowFlagged_df] DEFAULT 0,
    [createdBy] INT,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [GrowerSubmissionDetail_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedBy] INT,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [GrowerSubmissionDetail_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[Order] (
    [id] INT NOT NULL IDENTITY(1,1),
    [growerId] INT NOT NULL,
    [itemId] NVARCHAR(1000) NOT NULL,
    [vendorId] INT NOT NULL,
    [quantity] DECIMAL(32,16) NOT NULL CONSTRAINT [Order_quantity_df] DEFAULT 0,
    [unitOfMeasure] NVARCHAR(1000),
    [status] NVARCHAR(1000) NOT NULL CONSTRAINT [Order_status_df] DEFAULT 'Open',
    [orderDate] DATETIME2 NOT NULL CONSTRAINT [Order_orderDate_df] DEFAULT CURRENT_TIMESTAMP,
    [expectedDeliveryDate] DATETIME2,
    [closedAt] DATETIME2,
    [notes] NVARCHAR(1000),
    [createdBy] INT,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [Order_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedBy] INT,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [Order_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[InventoryLedger] (
    [id] INT NOT NULL IDENTITY(1,1),
    [submissionId] INT,
    [date] DATETIME2 NOT NULL,
    [growerId] INT NOT NULL,
    [itemId] NVARCHAR(1000) NOT NULL,
    [locationId] INT,
    [transactionType] NVARCHAR(1000) NOT NULL CONSTRAINT [InventoryLedger_transactionType_df] DEFAULT 'Daily Count Update',
    [finalQuantity] DECIMAL(32,16) NOT NULL,
    [createdBy] INT,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [InventoryLedger_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedBy] INT,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [InventoryLedger_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[VendorSubmission] (
    [id] INT NOT NULL IDENTITY(1,1),
    [vendorId] INT NOT NULL,
    [submittedBy] INT NOT NULL,
    [submissionDate] DATETIME2 NOT NULL CONSTRAINT [VendorSubmission_submissionDate_df] DEFAULT CURRENT_TIMESTAMP,
    [status] NVARCHAR(1000) NOT NULL CONSTRAINT [VendorSubmission_status_df] DEFAULT 'Approved',
    [comments] NVARCHAR(1000),
    [createdBy] INT,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [VendorSubmission_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedBy] INT,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [VendorSubmission_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[VendorSubmissionDetail] (
    [id] INT NOT NULL IDENTITY(1,1),
    [submissionId] INT NOT NULL,
    [itemId] NVARCHAR(1000) NOT NULL,
    [quantity] DECIMAL(32,16) NOT NULL CONSTRAINT [VendorSubmissionDetail_quantity_df] DEFAULT 0,
    [unitOfMeasure] NVARCHAR(1000),
    [createdBy] INT,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [VendorSubmissionDetail_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedBy] INT,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [VendorSubmissionDetail_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[VendorAllocation] (
    [id] INT NOT NULL IDENTITY(1,1),
    [vendorSubmissionDetailId] INT NOT NULL,
    [growerId] INT NOT NULL,
    [quantity] DECIMAL(32,16) NOT NULL CONSTRAINT [VendorAllocation_quantity_df] DEFAULT 0,
    [createdBy] INT,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [VendorAllocation_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedBy] INT,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [VendorAllocation_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[MissingItemRequest] (
    [id] INT NOT NULL IDENTITY(1,1),
    [growerId] INT NOT NULL,
    [requestedBy] INT NOT NULL,
    [itemName] NVARCHAR(1000) NOT NULL,
    [commodityHint] NVARCHAR(1000),
    [categoryHint] NVARCHAR(1000),
    [notes] NVARCHAR(1000),
    [status] NVARCHAR(1000) NOT NULL CONSTRAINT [MissingItemRequest_status_df] DEFAULT 'Open',
    [reviewedBy] INT,
    [reviewedAt] DATETIME2,
    [reviewNotes] NVARCHAR(1000),
    [createdBy] INT,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [MissingItemRequest_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedBy] INT,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [MissingItemRequest_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[LowInventoryFlag] (
    [id] INT NOT NULL IDENTITY(1,1),
    [growerId] INT NOT NULL,
    [itemId] NVARCHAR(1000) NOT NULL,
    [flaggedBy] INT NOT NULL,
    [submissionId] INT,
    [reason] NVARCHAR(1000),
    [isActive] BIT NOT NULL CONSTRAINT [LowInventoryFlag_isActive_df] DEFAULT 1,
    [createdBy] INT,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [LowInventoryFlag_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedBy] INT,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [LowInventoryFlag_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[ItemThreshold] (
    [id] INT NOT NULL IDENTITY(1,1),
    [itemId] NVARCHAR(1000) NOT NULL,
    [growerId] INT,
    [thresholdQuantity] DECIMAL(32,16) NOT NULL,
    [unitOfMeasure] NVARCHAR(1000),
    [createdBy] INT,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [ItemThreshold_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedBy] INT,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [ItemThreshold_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [ItemThreshold_itemId_growerId_key] UNIQUE NONCLUSTERED ([itemId],[growerId])
);

-- CreateTable
CREATE TABLE [dbo].[SchedulerSetting] (
    [id] INT NOT NULL IDENTITY(1,1),
    [scope] NVARCHAR(1000) NOT NULL CONSTRAINT [SchedulerSetting_scope_df] DEFAULT 'Global',
    [growerId] INT,
    [cadenceType] NVARCHAR(1000) NOT NULL CONSTRAINT [SchedulerSetting_cadenceType_df] DEFAULT 'AfterNDays',
    [thresholdDays] INT NOT NULL CONSTRAINT [SchedulerSetting_thresholdDays_df] DEFAULT 3,
    [reminderFrequency] NVARCHAR(1000) NOT NULL CONSTRAINT [SchedulerSetting_reminderFrequency_df] DEFAULT 'Daily',
    [isEnabled] BIT NOT NULL CONSTRAINT [SchedulerSetting_isEnabled_df] DEFAULT 1,
    [createdBy] INT,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [SchedulerSetting_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedBy] INT,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [SchedulerSetting_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[UnitConversion] (
    [id] INT NOT NULL IDENTITY(1,1),
    [fromUnit] NVARCHAR(1000) NOT NULL,
    [toUnit] NVARCHAR(1000) NOT NULL,
    [factor] DECIMAL(32,16) NOT NULL,
    [itemId] NVARCHAR(1000),
    [commodityCode] NVARCHAR(1000),
    [notes] NVARCHAR(1000),
    [createdBy] INT,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [UnitConversion_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedBy] INT,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [UnitConversion_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[AuditLog] (
    [id] INT NOT NULL IDENTITY(1,1),
    [userId] INT NOT NULL,
    [action] NVARCHAR(1000) NOT NULL,
    [entityType] NVARCHAR(1000) NOT NULL,
    [entityId] NVARCHAR(1000),
    [changes] NVARCHAR(1000),
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [AuditLog_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [AuditLog_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[NotificationLog] (
    [id] INT NOT NULL IDENTITY(1,1),
    [type] NVARCHAR(1000) NOT NULL,
    [toEmail] NVARCHAR(1000) NOT NULL,
    [growerId] INT,
    [vendorId] INT,
    [subject] NVARCHAR(1000) NOT NULL,
    [body] NVARCHAR(1000) NOT NULL,
    [status] NVARCHAR(1000) NOT NULL CONSTRAINT [NotificationLog_status_df] DEFAULT 'Mocked',
    [relatedEntity] NVARCHAR(1000),
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [NotificationLog_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [sentAt] DATETIME2,
    CONSTRAINT [NotificationLog_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[PowerBiReport] (
    [id] INT NOT NULL IDENTITY(1,1),
    [name] NVARCHAR(1000) NOT NULL,
    [embedUrl] NVARCHAR(1000) NOT NULL,
    [roleScope] NVARCHAR(1000) NOT NULL CONSTRAINT [PowerBiReport_roleScope_df] DEFAULT 'Admin',
    [isActive] BIT NOT NULL CONSTRAINT [PowerBiReport_isActive_df] DEFAULT 1,
    [createdBy] INT,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [PowerBiReport_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedBy] INT,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [PowerBiReport_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateIndex
CREATE NONCLUSTERED INDEX [User_roleId_idx] ON [dbo].[User]([roleId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [User_growerId_idx] ON [dbo].[User]([growerId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [User_vendorId_idx] ON [dbo].[User]([vendorId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [SubCategory_materialCategoryCode_idx] ON [dbo].[SubCategory]([materialCategoryCode]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Item_commodityCode_idx] ON [dbo].[Item]([commodityCode]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Item_materialCategoryCode_idx] ON [dbo].[Item]([materialCategoryCode]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Item_subCategoryId_idx] ON [dbo].[Item]([subCategoryId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Item_countryOfOriginId_idx] ON [dbo].[Item]([countryOfOriginId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [GrowerItemAuthorization_itemId_idx] ON [dbo].[GrowerItemAuthorization]([itemId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [ItemVendor_itemId_idx] ON [dbo].[ItemVendor]([itemId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [VendorMaterialCategory_materialCategoryCode_idx] ON [dbo].[VendorMaterialCategory]([materialCategoryCode]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [GrowerSubmission_growerId_idx] ON [dbo].[GrowerSubmission]([growerId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [GrowerSubmission_submissionDate_idx] ON [dbo].[GrowerSubmission]([submissionDate]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [GrowerSubmissionDetail_submissionId_idx] ON [dbo].[GrowerSubmissionDetail]([submissionId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [GrowerSubmissionDetail_itemId_idx] ON [dbo].[GrowerSubmissionDetail]([itemId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Order_growerId_status_idx] ON [dbo].[Order]([growerId], [status]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Order_itemId_idx] ON [dbo].[Order]([itemId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Order_vendorId_idx] ON [dbo].[Order]([vendorId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [InventoryLedger_growerId_itemId_date_idx] ON [dbo].[InventoryLedger]([growerId], [itemId], [date]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [InventoryLedger_date_idx] ON [dbo].[InventoryLedger]([date]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [VendorSubmission_vendorId_idx] ON [dbo].[VendorSubmission]([vendorId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [VendorSubmission_submissionDate_idx] ON [dbo].[VendorSubmission]([submissionDate]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [VendorSubmissionDetail_submissionId_idx] ON [dbo].[VendorSubmissionDetail]([submissionId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [VendorSubmissionDetail_itemId_idx] ON [dbo].[VendorSubmissionDetail]([itemId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [VendorAllocation_vendorSubmissionDetailId_idx] ON [dbo].[VendorAllocation]([vendorSubmissionDetailId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [VendorAllocation_growerId_idx] ON [dbo].[VendorAllocation]([growerId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [MissingItemRequest_growerId_idx] ON [dbo].[MissingItemRequest]([growerId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [MissingItemRequest_status_idx] ON [dbo].[MissingItemRequest]([status]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [LowInventoryFlag_growerId_idx] ON [dbo].[LowInventoryFlag]([growerId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [LowInventoryFlag_itemId_idx] ON [dbo].[LowInventoryFlag]([itemId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [ItemThreshold_itemId_idx] ON [dbo].[ItemThreshold]([itemId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [SchedulerSetting_growerId_idx] ON [dbo].[SchedulerSetting]([growerId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [AuditLog_userId_idx] ON [dbo].[AuditLog]([userId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [AuditLog_entityType_idx] ON [dbo].[AuditLog]([entityType]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [AuditLog_createdAt_idx] ON [dbo].[AuditLog]([createdAt]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [NotificationLog_createdAt_idx] ON [dbo].[NotificationLog]([createdAt]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [NotificationLog_type_idx] ON [dbo].[NotificationLog]([type]);

-- AddForeignKey
ALTER TABLE [dbo].[User] ADD CONSTRAINT [User_roleId_fkey] FOREIGN KEY ([roleId]) REFERENCES [dbo].[Role]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[User] ADD CONSTRAINT [User_growerId_fkey] FOREIGN KEY ([growerId]) REFERENCES [dbo].[Grower]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[User] ADD CONSTRAINT [User_vendorId_fkey] FOREIGN KEY ([vendorId]) REFERENCES [dbo].[Vendor]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[SubCategory] ADD CONSTRAINT [SubCategory_materialCategoryCode_fkey] FOREIGN KEY ([materialCategoryCode]) REFERENCES [dbo].[MaterialCategory]([code]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[Item] ADD CONSTRAINT [Item_commodityCode_fkey] FOREIGN KEY ([commodityCode]) REFERENCES [dbo].[Commodity]([code]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[Item] ADD CONSTRAINT [Item_materialCategoryCode_fkey] FOREIGN KEY ([materialCategoryCode]) REFERENCES [dbo].[MaterialCategory]([code]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[Item] ADD CONSTRAINT [Item_subCategoryId_fkey] FOREIGN KEY ([subCategoryId]) REFERENCES [dbo].[SubCategory]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[Item] ADD CONSTRAINT [Item_countryOfOriginId_fkey] FOREIGN KEY ([countryOfOriginId]) REFERENCES [dbo].[CountryOfOrigin]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[GrowerItemAuthorization] ADD CONSTRAINT [GrowerItemAuthorization_growerId_fkey] FOREIGN KEY ([growerId]) REFERENCES [dbo].[Grower]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[GrowerItemAuthorization] ADD CONSTRAINT [GrowerItemAuthorization_itemId_fkey] FOREIGN KEY ([itemId]) REFERENCES [dbo].[Item]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[ItemVendor] ADD CONSTRAINT [ItemVendor_vendorId_fkey] FOREIGN KEY ([vendorId]) REFERENCES [dbo].[Vendor]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[ItemVendor] ADD CONSTRAINT [ItemVendor_itemId_fkey] FOREIGN KEY ([itemId]) REFERENCES [dbo].[Item]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[VendorMaterialCategory] ADD CONSTRAINT [VendorMaterialCategory_vendorId_fkey] FOREIGN KEY ([vendorId]) REFERENCES [dbo].[Vendor]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[VendorMaterialCategory] ADD CONSTRAINT [VendorMaterialCategory_materialCategoryCode_fkey] FOREIGN KEY ([materialCategoryCode]) REFERENCES [dbo].[MaterialCategory]([code]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[GrowerSubmission] ADD CONSTRAINT [GrowerSubmission_growerId_fkey] FOREIGN KEY ([growerId]) REFERENCES [dbo].[Grower]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[GrowerSubmission] ADD CONSTRAINT [GrowerSubmission_submittedBy_fkey] FOREIGN KEY ([submittedBy]) REFERENCES [dbo].[User]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[GrowerSubmissionDetail] ADD CONSTRAINT [GrowerSubmissionDetail_submissionId_fkey] FOREIGN KEY ([submissionId]) REFERENCES [dbo].[GrowerSubmission]([id]) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[GrowerSubmissionDetail] ADD CONSTRAINT [GrowerSubmissionDetail_itemId_fkey] FOREIGN KEY ([itemId]) REFERENCES [dbo].[Item]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[GrowerSubmissionDetail] ADD CONSTRAINT [GrowerSubmissionDetail_locationId_fkey] FOREIGN KEY ([locationId]) REFERENCES [dbo].[Location]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[Order] ADD CONSTRAINT [Order_growerId_fkey] FOREIGN KEY ([growerId]) REFERENCES [dbo].[Grower]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[Order] ADD CONSTRAINT [Order_itemId_fkey] FOREIGN KEY ([itemId]) REFERENCES [dbo].[Item]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[Order] ADD CONSTRAINT [Order_vendorId_fkey] FOREIGN KEY ([vendorId]) REFERENCES [dbo].[Vendor]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[InventoryLedger] ADD CONSTRAINT [InventoryLedger_submissionId_fkey] FOREIGN KEY ([submissionId]) REFERENCES [dbo].[GrowerSubmission]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[InventoryLedger] ADD CONSTRAINT [InventoryLedger_growerId_fkey] FOREIGN KEY ([growerId]) REFERENCES [dbo].[Grower]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[InventoryLedger] ADD CONSTRAINT [InventoryLedger_itemId_fkey] FOREIGN KEY ([itemId]) REFERENCES [dbo].[Item]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[InventoryLedger] ADD CONSTRAINT [InventoryLedger_locationId_fkey] FOREIGN KEY ([locationId]) REFERENCES [dbo].[Location]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[VendorSubmission] ADD CONSTRAINT [VendorSubmission_vendorId_fkey] FOREIGN KEY ([vendorId]) REFERENCES [dbo].[Vendor]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[VendorSubmission] ADD CONSTRAINT [VendorSubmission_submittedBy_fkey] FOREIGN KEY ([submittedBy]) REFERENCES [dbo].[User]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[VendorSubmissionDetail] ADD CONSTRAINT [VendorSubmissionDetail_submissionId_fkey] FOREIGN KEY ([submissionId]) REFERENCES [dbo].[VendorSubmission]([id]) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[VendorSubmissionDetail] ADD CONSTRAINT [VendorSubmissionDetail_itemId_fkey] FOREIGN KEY ([itemId]) REFERENCES [dbo].[Item]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[VendorAllocation] ADD CONSTRAINT [VendorAllocation_vendorSubmissionDetailId_fkey] FOREIGN KEY ([vendorSubmissionDetailId]) REFERENCES [dbo].[VendorSubmissionDetail]([id]) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[VendorAllocation] ADD CONSTRAINT [VendorAllocation_growerId_fkey] FOREIGN KEY ([growerId]) REFERENCES [dbo].[Grower]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[MissingItemRequest] ADD CONSTRAINT [MissingItemRequest_growerId_fkey] FOREIGN KEY ([growerId]) REFERENCES [dbo].[Grower]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[MissingItemRequest] ADD CONSTRAINT [MissingItemRequest_requestedBy_fkey] FOREIGN KEY ([requestedBy]) REFERENCES [dbo].[User]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[LowInventoryFlag] ADD CONSTRAINT [LowInventoryFlag_growerId_fkey] FOREIGN KEY ([growerId]) REFERENCES [dbo].[Grower]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[LowInventoryFlag] ADD CONSTRAINT [LowInventoryFlag_itemId_fkey] FOREIGN KEY ([itemId]) REFERENCES [dbo].[Item]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[ItemThreshold] ADD CONSTRAINT [ItemThreshold_itemId_fkey] FOREIGN KEY ([itemId]) REFERENCES [dbo].[Item]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[ItemThreshold] ADD CONSTRAINT [ItemThreshold_growerId_fkey] FOREIGN KEY ([growerId]) REFERENCES [dbo].[Grower]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[SchedulerSetting] ADD CONSTRAINT [SchedulerSetting_growerId_fkey] FOREIGN KEY ([growerId]) REFERENCES [dbo].[Grower]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[UnitConversion] ADD CONSTRAINT [UnitConversion_itemId_fkey] FOREIGN KEY ([itemId]) REFERENCES [dbo].[Item]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[UnitConversion] ADD CONSTRAINT [UnitConversion_commodityCode_fkey] FOREIGN KEY ([commodityCode]) REFERENCES [dbo].[Commodity]([code]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[AuditLog] ADD CONSTRAINT [AuditLog_userId_fkey] FOREIGN KEY ([userId]) REFERENCES [dbo].[User]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[NotificationLog] ADD CONSTRAINT [NotificationLog_growerId_fkey] FOREIGN KEY ([growerId]) REFERENCES [dbo].[Grower]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[NotificationLog] ADD CONSTRAINT [NotificationLog_vendorId_fkey] FOREIGN KEY ([vendorId]) REFERENCES [dbo].[Vendor]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH

