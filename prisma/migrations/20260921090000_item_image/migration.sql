/*
  Item photos — one optional image per item.

  Additive only: a single nullable column. No backfill, no contract step, and
  nothing reads it until the application code that sets it ships, so this is
  safe to deploy ahead of the app (expand/contract — see
  TECHNICAL-DOCUMENTATION.md §12).

  The column holds a STORAGE KEY, not a URL — "items/AP-BX-00001/<uuid>.webp".
  Keeping the account and container out of the value means moving storage is a
  config change rather than a data migration. 400 chars is well clear of the key
  shape above while staying far below the 1700-byte index key limit, should this
  ever need indexing.

  The bytes themselves live in blob storage (lib/storage), never in SQL Server:
  images in the database bloat every backup and put image reads on the most
  expensive tier in the deployment.

  REVERSING: drop the column. The blobs it points at are orphaned rather than
  deleted — clean them up separately if the rollback is permanent.
*/
ALTER TABLE [dbo].[Item] ADD [imageKey] NVARCHAR(400) NULL;
