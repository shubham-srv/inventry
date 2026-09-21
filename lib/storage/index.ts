import "server-only"
import { randomUUID } from "node:crypto"
import type { ImageStore } from "@/lib/storage/types"
import { isBlobConfigured } from "@/lib/storage/blob"

export type { ImageStore, StoredImage } from "@/lib/storage/types"
export { MAX_IMAGE_BYTES, ACCEPT_ATTRIBUTE, checkImage } from "@/lib/storage/image"

/**
 * Picks the storage backend, and refuses to guess in production.
 *
 * Dev degrades to the local filesystem so the items page can be worked on with
 * no Azure account; production with no connection string is a deployment fault
 * and throws, because the alternative — writing to the container filesystem —
 * looks like it works right up until Container Apps replaces the revision and
 * every photo vanishes. Same shape as MAGIC_LINK_SECRET and CRON_SECRET: a
 * missing config closes the door rather than removing it.
 *
 * The backends are imported lazily so a production deployment never loads the
 * Node-only local store, and `next build` never constructs an Azure client.
 */
export async function imageStore(): Promise<ImageStore> {
  if (isBlobConfigured()) {
    const { blobStore } = await import("@/lib/storage/blob")
    return blobStore()
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "[storage] AZURE_STORAGE_CONNECTION_STRING is not set — refusing to store item images on ephemeral container disk."
    )
  }
  const { localStore } = await import("@/lib/storage/local")
  return localStore()
}

/**
 * A fresh key for an item's photo.
 *
 * The uuid is what makes replacement safe: a new upload never reuses the
 * previous key, so a browser or CDN holding the old image cannot serve it for
 * the new one, and the served bytes can be marked immutable. The item id in the
 * path is purely so a human browsing the container can tell what they are
 * looking at.
 */
export function newItemImageKey(itemId: string, ext: string): string {
  return `items/${itemId}/${randomUUID()}.${ext}`
}
