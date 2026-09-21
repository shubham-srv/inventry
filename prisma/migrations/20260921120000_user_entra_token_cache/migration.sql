/*
  Store the Entra token cache per user, for Power BI embedding.

  Additive only: two nullable columns, no backfill, no contract step. Safe to
  deploy ahead of the application code that fills them.

  WHY THIS IS STORED AT ALL. "Embed for your organization" needs a Power BI
  access token for the signed-in admin. Those last about an hour while a session
  lasts a week, so the app must be able to mint a fresh one mid-session — which
  needs the refresh token MSAL keeps in its cache. Until now the app discarded
  the Microsoft token the moment it had confirmed who someone was.

  WHAT IS IN THE COLUMN. entraTokenCache is MSAL's serialized cache, AES-256-GCM
  encrypted with a key derived from TOKEN_CACHE_SECRET (lib/auth/token-cache.ts).
  It is never written in the clear, so a stolen backup does not yield usable
  Microsoft credentials without that secret, which lives in Key Vault.

  NVARCHAR(MAX) because the serialized cache is a few kilobytes of JSON and grows
  with the number of resources a user holds tokens for.

  Only Entra users ever have these set. Growers and vendors sign in by emailed
  link, have no Microsoft identity, and cannot reach reports in any case.

  REVERSING: drop both columns. Users simply re-authenticate.
*/
ALTER TABLE [dbo].[User] ADD [entraHomeAccountId] NVARCHAR(200) NULL;
ALTER TABLE [dbo].[User] ADD [entraTokenCache] NVARCHAR(MAX) NULL;
