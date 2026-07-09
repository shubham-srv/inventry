import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  // Next.js 16 blocks cross-origin requests to dev assets by default. When you
  // open the dev server from another device on your LAN (e.g. a phone at
  // http://192.168.x.x:3000), client-side React won't hydrate — links work but
  // buttons/dropdowns/dialogs don't. List the origins (your machine's LAN IP)
  // that are allowed to reach the dev server. Update this to your own IP if it
  // differs (run `ipconfig` / `Get-NetIPAddress`).
  allowedDevOrigins: ["192.168.31.39", "192.168.31.*", "192.168.0.*", "192.168.1.*"],
}

export default nextConfig
