import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  // Produce a self-contained server build in .next/standalone for the Docker
  // image (Azure Container Apps). Build-only — does NOT affect `next dev` or the
  // local demo; it only changes how `next build` packages the production server.
  output: "standalone",

  // Next.js 16 blocks cross-origin requests to dev assets by default. When you
  // open the dev server from another device on your LAN (e.g. a phone at
  // http://192.168.x.x:3000), client-side React won't hydrate — links work but
  // buttons/dropdowns/dialogs don't. List the origins (your machine's LAN IP)
  // that are allowed to reach the dev server. Update this to your own IP if it
  // differs (run `ipconfig` / `Get-NetIPAddress`).
  allowedDevOrigins: ["192.168.31.39", "192.168.31.*", "192.168.0.*", "192.168.1.*"],

  experimental: {
    // Item photos are downscaled in the browser to a few hundred KB before they
    // are posted (components/crud/image-field.tsx), so this is not the expected
    // payload size — it is headroom. Without it, an unresized file (the resize
    // failed, or the form was submitted mid-resize) is rejected by the framework
    // with an opaque error instead of reaching our own validator, which can say
    // "that image is too large. The limit is 10 MB." Keep it above
    // MAX_IMAGE_BYTES in lib/storage/image.ts so ours is always the message.
    serverActions: { bodySizeLimit: "12mb" },
  },
}

export default nextConfig
