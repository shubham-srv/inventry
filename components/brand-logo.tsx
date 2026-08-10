import Image from "next/image"

/**
 * The brand mark, in one place so swapping the asset is a single file change.
 *
 * `public/logo.webp` is a wide wordmark (400×217), so it needs a width-driven
 * box rather than the square slot the placeholder icon used. WebP is fine here —
 * every browser supports it. The EMAIL header deliberately uses a PNG instead
 * (public/logo-email.png): Outlook and several other clients don't render WebP.
 */
export function BrandLogo({
  width = 132,
  className,
  priority = false,
}: {
  width?: number
  className?: string
  priority?: boolean
}) {
  // Preserve the asset's own 400:217 ratio so it never distorts.
  const height = Math.round((width * 217) / 400)
  return (
    <Image
      src="/logo.webp"
      alt="Prime Time Produce"
      width={width}
      height={height}
      priority={priority}
      className={className}
      style={{ height: "auto" }}
    />
  )
}
