import "server-only"
import {
  BlobServiceClient,
  type ContainerClient,
} from "@azure/storage-blob"
import type { ImageStore, StoredImage } from "@/lib/storage/types"

/**
 * Azure Blob Storage backend.
 *
 * The container is PRIVATE. Images reach the browser through
 * app/(app)/items/[id]/image/route.ts, which applies the same session gate as
 * the rest of the app, so there is no public container and no SAS token to
 * leak. If thumbnail traffic ever justifies it, that route can start handing
 * out short-lived SAS URLs without anything here changing.
 *
 * Authentication is a connection string, matching how the ACS email transport
 * is configured. Managed identity (DefaultAzureCredential against
 * AZURE_STORAGE_ACCOUNT) is the natural upgrade and needs only this file to
 * change.
 */

const CONTAINER = process.env.AZURE_STORAGE_CONTAINER || "item-images"

export function isBlobConfigured(): boolean {
  return Boolean(process.env.AZURE_STORAGE_CONNECTION_STRING)
}

// Built on first use, not at module scope: this module is imported while
// `next build` traces the routes, where the connection string legitimately does
// not exist, and constructing eagerly would fail the build instead of the
// request. Same reasoning as the MSAL client in lib/auth/entra.ts.
let cached: ContainerClient | null = null
async function container(): Promise<ContainerClient> {
  if (!cached) {
    const service = BlobServiceClient.fromConnectionString(
      process.env.AZURE_STORAGE_CONNECTION_STRING!
    )
    const client = service.getContainerClient(CONTAINER)
    // Private by default — createIfNotExists with no access option leaves the
    // container non-public. Never pass { access: "blob" } here.
    await client.createIfNotExists()
    cached = client
  }
  return cached
}

export function blobStore(): ImageStore {
  return {
    async put(key, bytes, contentType) {
      const client = (await container()).getBlockBlobClient(key)
      await client.uploadData(Buffer.from(bytes), {
        blobHTTPHeaders: {
          blobContentType: contentType,
          // The key carries a uuid that changes on every replace, so a given
          // key's bytes never change. Safe to cache hard at every layer.
          blobCacheControl: "private, max-age=31536000, immutable",
        },
      })
    },

    async get(key): Promise<StoredImage | null> {
      const client = (await container()).getBlockBlobClient(key)
      try {
        const buffer = await client.downloadToBuffer()
        const props = await client.getProperties()
        return {
          body: new Uint8Array(buffer),
          contentType: props.contentType || "application/octet-stream",
        }
      } catch {
        return null
      }
    },

    async delete(key) {
      const client = (await container()).getBlockBlobClient(key)
      await client.deleteIfExists()
    },
  }
}
