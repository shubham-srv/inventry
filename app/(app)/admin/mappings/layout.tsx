import { PageHeader } from "@/components/page-header"
import { TabNav } from "@/components/tab-nav"

/**
 * Grower authorizations and vendor item mappings share this shell.
 *
 * They are separate ROUTES rather than client-side tabs so each keeps its own
 * search/filter/pagination query string — one route with two tables would make
 * `?q=` and `?page=` ambiguous.
 */
export default function MappingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <PageHeader
        title="Mappings"
        description="Which items each grower may submit for, and which items each vendor supplies."
      />
      <TabNav
        tabs={[
          { href: "/admin/mappings/growers", label: "Grower authorizations" },
          { href: "/admin/mappings/vendors", label: "Vendor items" },
        ]}
      />
      <div className="mt-4">{children}</div>
    </>
  )
}
