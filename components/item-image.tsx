import { ImageOff } from "lucide-react"
import { cn } from "@/lib/utils"

/**
 * An item's photo, or a placeholder when it has none.
 *
 * Plain <img>, NOT next/image, on purpose. next/image routes through the
 * optimizer at /_next/image, which fetches the source server-side with no
 * browser cookies — against /items/<id>/image that is an unauthenticated
 * request, so the proxy bounces it to /login and every thumbnail breaks.
 * Uploads are already downscaled client-side, so the optimizer has little to
 * add here anyway.
 *
 * `hasImage` rather than a URL so callers pass `!!row.imageKey` and no key ever
 * reaches the client — the key is a storage path, and the browser has no
 * business knowing it.
 */
export function ItemImage({
  itemId,
  hasImage,
  alt,
  size = 40,
  className,
}: {
  itemId: string
  hasImage: boolean
  alt: string
  size?: number
  className?: string
}) {
  const box = cn(
    "bg-muted flex shrink-0 items-center justify-center overflow-hidden rounded border",
    className
  )
  const style = { width: size, height: size }

  if (!hasImage) {
    return (
      <div className={box} style={style} aria-hidden>
        <ImageOff className="text-muted-foreground/50 size-4" />
      </div>
    )
  }

  return (
    // next/image cannot authenticate against this route — see the note above.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`/items/${encodeURIComponent(itemId)}/image`}
      alt={alt}
      width={size}
      height={size}
      loading="lazy"
      decoding="async"
      className={cn(box, "object-cover")}
      style={style}
    />
  )
}
