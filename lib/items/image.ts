import "server-only"
import { imageStore, newItemImageKey } from "@/lib/storage"
import { checkImage, type ImageRejection, type ImageType } from "@/lib/storage/image"

/**
 * Turning an item form's image inputs into something the action can act on.
 *
 * Shared rather than inlined in lib/actions/items.ts because the workbook
 * importer will need exactly the same validate-then-store steps for the
 * `ImageFile` column (docs/master-data-upload.md §7).
 */

export const IMAGE_FIELD = "image"

export type ImageIntent =
  | { kind: "keep" }
  | { kind: "remove" }
  | { kind: "replace"; bytes: Uint8Array; type: ImageType }

export type ImageIntentResult =
  | { ok: true; intent: ImageIntent }
  | { ok: false; reason: ImageRejection }

/** Human wording for a rejected file. */
export function imageRejectionMessage(reason: ImageRejection): string {
  switch (reason) {
    case "empty":
      return "That image file is empty."
    case "too-large":
      return "That image is too large. The limit is 10 MB."
    case "unsupported":
      return "That file is not a JPG, PNG or WebP image."
  }
}

/**
 * Reads the image inputs out of a submitted form.
 *
 * Must run BEFORE parseForm: formToObject() in lib/actions/_shared.ts coerces
 * every non-string entry to "", so a File would silently disappear and the
 * upload would look like a no-op.
 *
 * The declared content type is ignored entirely — checkImage() identifies the
 * file from its leading bytes, because the type and extension both come from
 * the client and a renamed file will happily claim to be a JPEG.
 */
export async function readImageIntent(
  fd: FormData,
  field: string = IMAGE_FIELD
): Promise<ImageIntentResult> {
  const mode = String(fd.get(`${field}Action`) ?? "keep")
  if (mode === "remove") return { ok: true, intent: { kind: "remove" } }
  if (mode !== "replace") return { ok: true, intent: { kind: "keep" } }

  const file = fd.get(field)
  // "replace" with nothing attached: the picker was opened and cancelled, or
  // the resize failed. Changing nothing is the safe reading.
  if (!(file instanceof File) || file.size === 0) {
    return { ok: true, intent: { kind: "keep" } }
  }

  const bytes = new Uint8Array(await file.arrayBuffer())
  const checked = checkImage(bytes)
  if (!checked.ok) return { ok: false, reason: checked.reason }

  return { ok: true, intent: { kind: "replace", bytes, type: checked.type } }
}

/** Stores a new photo for `itemId` and returns its key. */
export async function putItemImage(
  itemId: string,
  intent: Extract<ImageIntent, { kind: "replace" }>
): Promise<string> {
  const key = newItemImageKey(itemId, intent.type.ext)
  await (await imageStore()).put(key, intent.bytes, intent.type.contentType)
  return key
}

/**
 * Best-effort delete of a superseded or orphaned object.
 *
 * Never throws: a blob that outlives its row wastes a few kilobytes, whereas an
 * exception here would fail a save that has already been committed.
 */
export async function discardItemImage(key: string | null | undefined): Promise<void> {
  if (!key) return
  try {
    await (await imageStore()).delete(key)
  } catch (e) {
    console.error("[items] could not delete image", key, e)
  }
}

/** What the item row's imageKey should become, or undefined to leave it alone. */
export function nextImageKey(
  intent: ImageIntent,
  uploadedKey: string | null
): string | null | undefined {
  if (intent.kind === "replace") return uploadedKey
  if (intent.kind === "remove") return null
  return undefined
}
