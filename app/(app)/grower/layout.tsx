import { requireRole } from "@/lib/auth/session"
import { ROLES } from "@/lib/constants"

export default async function GrowerLayout({
  children,
}: {
  children: React.ReactNode
}) {
  await requireRole([ROLES.GROWER_USER])
  return <>{children}</>
}
