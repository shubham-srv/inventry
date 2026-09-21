"use client"

import { useEffect, useRef, useState } from "react"
import { ImageOff, Upload, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ACCEPT_ATTRIBUTE } from "@/lib/storage/image"

/**
 * One optional photo, for EntityFormDialog's `image` field type.
 *
 * WHY THE FILE IS RESIZED HERE. Server actions cap request bodies at 1 MB by
 * default and a phone photo is 3–8 MB. Downscaling on a canvas first turns that
 * into ~200–400 KB, so the whole existing form-action pattern keeps working
 * without raising limits to accommodate bytes we were about to throw away. The
 * server still validates independently — this is an optimisation, not a control.
 *
 * WHY A SEPARATE `<name>Action` FIELD. A file input posts nothing when
 * untouched, which is indistinguishable from "the user cleared the image". Left
 * to infer, an unrelated edit to an item's name would delete its photo. The
 * explicit keep/replace/remove removes the guess.
 */

const MAX_EDGE = 1600 // px on the longest side — plenty for a catalog photo

/** Re-encodes to WebP at `MAX_EDGE`, falling back to JPEG where WebP is refused. */
async function downscale(file: File): Promise<File> {
  // `from-image` applies the EXIF rotation, without which portrait photos taken
  // on a phone arrive sideways.
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" })
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height))
  const width = Math.max(1, Math.round(bitmap.width * scale))
  const height = Math.max(1, Math.round(bitmap.height * scale))

  const canvas = document.createElement("canvas")
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext("2d")
  if (!ctx) throw new Error("no 2d context")
  ctx.drawImage(bitmap, 0, 0, width, height)
  bitmap.close()

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/webp", 0.82)
  )
  // A browser that refuses WebP hands back a PNG (or null); retry as JPEG so we
  // never upload a lossless PNG of a photograph.
  if (!blob || blob.type !== "image/webp") {
    const jpeg = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.85)
    )
    if (!jpeg) throw new Error("encode failed")
    return new File([jpeg], "image.jpg", { type: "image/jpeg" })
  }
  return new File([blob], "image.webp", { type: "image/webp" })
}

type Mode = "keep" | "replace" | "remove"

export function ImageField({
  name,
  currentUrl,
  invalid,
}: {
  name: string
  currentUrl?: string
  invalid?: boolean
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [mode, setMode] = useState<Mode>("keep")
  const [preview, setPreview] = useState<string | null>(currentUrl || null)
  const [objectUrl, setObjectUrl] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Object URLs are retained until revoked; drop the previous one whenever it
  // is replaced, and the last one when the dialog unmounts.
  useEffect(() => {
    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [objectUrl])

  function setFiles(files: FileList | null) {
    if (fileRef.current) {
      const dt = new DataTransfer()
      if (files?.[0]) dt.items.add(files[0])
      fileRef.current.files = dt.files
    }
  }

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = e.target.files?.[0]
    if (!picked) return
    setBusy(true)
    setError(null)
    try {
      const resized = await downscale(picked)
      // Swap the input's contents for the resized file, so the form posts the
      // small one. Assigning `.files` does not re-fire change, so this settles.
      const dt = new DataTransfer()
      dt.items.add(resized)
      if (fileRef.current) fileRef.current.files = dt.files

      const url = URL.createObjectURL(resized)
      if (objectUrl) URL.revokeObjectURL(objectUrl)
      setObjectUrl(url)
      setPreview(url)
      setMode("replace")
    } catch {
      setError("That file could not be read as an image.")
      setFiles(null)
      setMode("keep")
    } finally {
      setBusy(false)
    }
  }

  function onRemove() {
    setFiles(null)
    if (objectUrl) URL.revokeObjectURL(objectUrl)
    setObjectUrl(null)
    setPreview(null)
    setError(null)
    setMode(currentUrl ? "remove" : "keep")
  }

  return (
    <div className="flex items-start gap-3">
      <input type="hidden" name={`${name}Action`} value={mode} />
      <input
        ref={fileRef}
        id={name}
        type="file"
        name={name}
        accept={ACCEPT_ATTRIBUTE}
        onChange={onPick}
        className="hidden"
      />

      <div
        className={`bg-muted flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-md border ${
          invalid ? "border-destructive" : ""
        }`}
      >
        {preview ? (
          // Local object URL or our own same-origin route; next/image can do
          // nothing useful with either. See components/item-image.tsx.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt="" className="size-full object-cover" />
        ) : (
          <ImageOff className="text-muted-foreground/50 size-5" aria-hidden />
        )}
      </div>

      <div className="flex min-w-0 flex-col gap-2">
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => fileRef.current?.click()}
          >
            <Upload />
            {busy ? "Processing…" : preview ? "Replace" : "Upload"}
          </Button>
          {preview && (
            <Button type="button" variant="ghost" size="sm" onClick={onRemove}>
              <X />
              Remove
            </Button>
          )}
        </div>
        <p className="text-muted-foreground text-xs">
          JPG, PNG or WebP. Large photos are resized automatically.
        </p>
        {error && <p className="text-destructive text-xs">{error}</p>}
      </div>
    </div>
  )
}
