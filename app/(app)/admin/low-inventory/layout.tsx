import { PageHeader } from "@/components/page-header"
import { TabNav } from "@/components/tab-nav"

/**
 * Two views of "low inventory" that people flip between:
 *
 *  - Flags   — a workflow queue with state: growers raised these, admins clear them.
 *  - Current — a live computed report: what is actually below threshold right now,
 *              regardless of whether anyone flagged it.
 *
 * Separate routes rather than client tabs, so each keeps its own search and
 * pagination in the URL.
 */
export default function LowInventoryLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <PageHeader
        title="Low inventory"
        description="What growers have flagged, and what is actually below threshold right now."
      />
      <TabNav
        tabs={[
          { href: "/admin/low-inventory/flags", label: "Raised flags" },
          { href: "/admin/low-inventory/current", label: "Currently low" },
        ]}
      />
      <div className="mt-4">{children}</div>
    </>
  )
}
