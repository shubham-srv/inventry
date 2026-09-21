/**
 * What counts as an acceptable item photo.
 *
 * Kept away from the storage backends so the upload action, the (future)
 * workbook importer and any test all apply exactly one definition.
 */

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024 // 10 MB

/** Accepted types, and the extension each is stored under. */
const TYPES = [
  { contentType: "image/webp", ext: "webp" },
  { contentType: "image/jpeg", ext: "jpg" },
  { contentType: "image/png", ext: "png" },
] as const

export type ImageType = (typeof TYPES)[number]

export const ACCEPTED_CONTENT_TYPES = TYPES.map((t) => t.contentType)

/** For the file picker's `accept` attribute. */
export const ACCEPT_ATTRIBUTE = ACCEPTED_CONTENT_TYPES.join(",")

/**
 * Identifies an image from its LEADING BYTES rather than its declared
 * Content-Type or file extension, both of which are supplied by the client and
 * can say anything. A .exe renamed to .jpg announces itself as image/jpeg; only
 * the bytes disagree.
 *
 * Returns null when the bytes are not one of the accepted formats.
 */
export function sniffImageType(bytes: Uint8Array): ImageType | null {
  const at = (i: number) => bytes[i]

  // WebP: "RIFF" .... "WEBP"
  if (
    bytes.length >= 12 &&
    at(0) === 0x52 && at(1) === 0x49 && at(2) === 0x46 && at(3) === 0x46 &&
    at(8) === 0x57 && at(9) === 0x45 && at(10) === 0x42 && at(11) === 0x50
  ) {
    return TYPES[0]
  }

  // JPEG: FF D8 FF
  if (bytes.length >= 3 && at(0) === 0xff && at(1) === 0xd8 && at(2) === 0xff) {
    return TYPES[1]
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    bytes.length >= 8 &&
    at(0) === 0x89 && at(1) === 0x50 && at(2) === 0x4e && at(3) === 0x47 &&
    at(4) === 0x0d && at(5) === 0x0a && at(6) === 0x1a && at(7) === 0x0a
  ) {
    return TYPES[2]
  }

  return null
}

export type ImageRejection = "empty" | "too-large" | "unsupported"

export type ImageCheck =
  | { ok: true; type: ImageType }
  | { ok: false; reason: ImageRejection }

/** Size + real-format check. The only gate any upload path should need. */
export function checkImage(bytes: Uint8Array): ImageCheck {
  if (bytes.length === 0) return { ok: false, reason: "empty" }
  if (bytes.length > MAX_IMAGE_BYTES) return { ok: false, reason: "too-large" }
  const type = sniffImageType(bytes)
  if (!type) return { ok: false, reason: "unsupported" }
  return { ok: true, type }
}
