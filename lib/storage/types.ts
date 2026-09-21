/**
 * The storage contract, in its own module so the backends and their consumers
 * can import it without pulling in either implementation — `lib/storage/blob`
 * drags in the Azure SDK, and `lib/storage/local` is Node-only.
 */

export type StoredImage = {
  body: Uint8Array
  contentType: string
}

export interface ImageStore {
  /** Writes (or overwrites) the object at `key`. */
  put(key: string, bytes: Uint8Array, contentType: string): Promise<void>
  /** Returns null when the object does not exist. */
  get(key: string): Promise<StoredImage | null>
  /** Idempotent: deleting something already gone is a success. */
  delete(key: string): Promise<void>
}
