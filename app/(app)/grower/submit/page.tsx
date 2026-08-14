import { requireRole } from "@/lib/auth/session"
import { ROLES } from "@/lib/constants"
import { getGrowerLocations, getGrowerSubmitData } from "@/lib/grower/data"
import { getT } from "@/lib/i18n/server"
import { PageHeader } from "@/components/page-header"
import { GrowerSubmitForm } from "@/components/grower/grower-submit-form"

export default async function GrowerSubmitPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const user = await requireRole([ROLES.GROWER_USER])
  if (!user.growerId) return <p className="text-sm">Your account is not mapped to a grower.</p>

  const t = await getT()
  const locations = await getGrowerLocations(user.growerId)

  // Counts are recorded against a location, so with none mapped there is
  // nothing valid to submit. An admin fixes this on /admin/growers.
  if (locations.length === 0) {
    return (
      <>
        <PageHeader
          title={t("grower.form.title")}
          description={t("grower.form.description")}
        />
        <p className="text-muted-foreground text-sm">
          {t("grower.form.noLocations")}
        </p>
      </>
    )
  }

  // The selected location rides in the URL rather than component state: it
  // decides what the server fetches, and keeping it in the query string means
  // a reload, a back button or a shared link all land on the same site.
  const raw = await searchParams
  const requested = Number(raw.location)
  const active =
    locations.find((l) => l.id === requested)?.id ?? locations[0].id

  const { rows, todayStatus } = await getGrowerSubmitData(user.growerId, active)

  return (
    <>
      <PageHeader
        title={t("grower.form.title")}
        description={t("grower.form.description")}
      />
      {/* Keyed on the location so switching sites remounts the form. Its
          quantity state is seeded from `rows` in a useState initialiser, which
          would otherwise keep the previous site's typed values on screen. */}
      <GrowerSubmitForm
        key={active}
        rows={rows}
        todayStatus={todayStatus}
        locations={locations}
        activeLocationId={active}
      />
    </>
  )
}
