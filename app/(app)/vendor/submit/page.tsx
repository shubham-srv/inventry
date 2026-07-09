import { requireRole } from "@/lib/auth/session"
import { ROLES } from "@/lib/constants"
import { getVendorSubmitData } from "@/lib/vendor/data"
import { getT } from "@/lib/i18n/server"
import { PageHeader } from "@/components/page-header"
import { VendorSubmitForm } from "@/components/vendor/vendor-submit-form"

export default async function VendorSubmitPage() {
  const user = await requireRole([ROLES.VENDOR_USER])
  if (!user.vendorId) return <p className="text-sm">Your account is not mapped to a vendor.</p>

  const t = await getT()
  const { rows } = await getVendorSubmitData(user.vendorId)

  return (
    <>
      <PageHeader
        title={t("vendor.form.title")}
        description={t("vendor.form.description")}
      />
      <VendorSubmitForm rows={rows} />
    </>
  )
}
