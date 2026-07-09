import { requireRole } from "@/lib/auth/session"
import { ROLES } from "@/lib/constants"

export default async function VendorLayout({
  children,
}: {
  children: React.ReactNode
}) {
  await requireRole([ROLES.VENDOR_USER])
  return <>{children}</>
}
