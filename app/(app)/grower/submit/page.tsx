import { requireRole } from "@/lib/auth/session"
import { ROLES } from "@/lib/constants"
import { getGrowerSubmitData } from "@/lib/grower/data"
import { getT } from "@/lib/i18n/server"
import { PageHeader } from "@/components/page-header"
import { GrowerSubmitForm } from "@/components/grower/grower-submit-form"

export default async function GrowerSubmitPage() {
  const user = await requireRole([ROLES.GROWER_USER])
  if (!user.growerId) return <p className="text-sm">Your account is not mapped to a grower.</p>

  const t = await getT()
  const { rows, todayStatus } = await getGrowerSubmitData(user.growerId)

  return (
    <>
      <PageHeader
        title={t("grower.form.title")}
        description={t("grower.form.description")}
      />
      <GrowerSubmitForm rows={rows} todayStatus={todayStatus} />
    </>
  )
}
