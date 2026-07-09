import { requireRole } from "@/lib/auth/session"
import { INTERNAL_ROLES } from "@/lib/constants"

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  await requireRole(INTERNAL_ROLES)
  return <>{children}</>
}
