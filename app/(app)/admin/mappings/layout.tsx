import { PageHeader } from "@/components/page-header"
import { TabNav } from "@/components/tab-nav"
import { getT } from "@/lib/i18n/server"

/**
 * Grower authorizations and vendor item mappings share this shell.
 *
 * They are separate ROUTES rather than client-side tabs so each keeps its own
 * search/filter/pagination query string — one route with two tables would make
 * `?q=` and `?page=` ambiguous.
 */
export default async function MappingsLayout({ children }: { children: React.ReactNode }) {
  const t = await getT()
  return (
    <>
      <PageHeader
        title={t("nav.mappings")}
        description={t("admin.mappings.description")}
      />
      <TabNav
        tabs={[
          { href: "/admin/mappings/growers", label: t("admin.mappings.growerAuthorizations") },
          { href: "/admin/mappings/vendors", label: t("admin.mappings.vendorItems") },
        ]}
      />
      <div className="mt-4">{children}</div>
    </>
  )
}
