import "server-only"
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises"
import { dirname, resolve, sep } from "node:path"
import type { ImageStore, StoredImage } from "@/lib/storage/types"

/**
 * Development backend: files under .uploads/ in the project root.
 *
 * Exists so nobody needs an Azure account — or Azurite — to work on the items
 * page. It is never selected in production; see lib/storage/index.ts, which
 * fails closed there rather than quietly writing to a container filesystem that
 * disappears on the next revision.
 */

const ROOT = resolve(process.cwd(), ".uploads")

/**
 * Resolve a key under ROOT, refusing anything that escapes it. Keys are built
 * by this module today, but the importer will take names from a client
 * spreadsheet, and "../../etc/passwd" is exactly the kind of value a
 * spreadsheet eventually contains.
 */
function pathFor(key: string): string {
  const full = resolve(ROOT, key)
  if (full !== ROOT && !full.startsWith(ROOT + sep)) {
    throw new Error(`[storage] key escapes the upload root: ${key}`)
  }
  return full
}

export function localStore(): ImageStore {
  return {
    async put(key, bytes, contentType) {
      const path = pathFor(key)
      await mkdir(dirname(path), { recursive: true })
      await writeFile(path, bytes)
      // Content type is implied by the extension locally; the blob backend
      // stores it properly. Keep the signature identical either way.
      void contentType
    },

    async get(key): Promise<StoredImage | null> {
      try {
        const body = await readFile(pathFor(key))
        return { body: new Uint8Array(body), contentType: contentTypeOf(key) }
      } catch {
        return null
      }
    },

    async delete(key) {
      try {
        await unlink(pathFor(key))
      } catch {
        // Already gone is the desired end state.
      }
    },
  }
}

function contentTypeOf(key: string): string {
  if (key.endsWith(".webp")) return "image/webp"
  if (key.endsWith(".png")) return "image/png"
  return "image/jpeg"
}

export const LOCAL_ROOT = ROOT
