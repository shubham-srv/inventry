import { redirect } from "next/navigation"
import { requireUser } from "@/lib/auth/session"
import { homePathForRole } from "@/lib/rbac"

export default async function Home() {
  const user = await requireUser()
  redirect(homePathForRole(user.roleName))
}
