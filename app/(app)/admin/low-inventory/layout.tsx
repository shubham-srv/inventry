import { PageHeader } from "@/components/page-header"
import { TabNav } from "@/components/tab-nav"
import { getT } from "@/lib/i18n/server"

/**
 * Two views of "low inventory" that people flip between:
 *
 *  - Flags   — a workflow queue with state: growers raised these, admins clear them.
 *  - Current — a live computed report: what is actually below threshold right now,
 *              regardless of whether anyone flagged it.
 *  - History — every flag ever raised and how it ended (the queue's audit trail).
 *
 * Separate routes rather than client tabs, so each keeps its own search and
 * pagination in the URL.
 */
export default async function LowInventoryLayout({ children }: { children: React.ReactNode }) {
  const t = await getT()
  return (
    <>
      <PageHeader
        title={t("admin.lowInventory.title")}
        description={t("admin.lowInventory.description")}
      />
      <TabNav
        tabs={[
          { href: "/admin/low-inventory/flags", label: t("admin.lowInventory.tabFlags") },
          { href: "/admin/low-inventory/current", label: t("admin.lowInventory.tabCurrent") },
          { href: "/admin/low-inventory/history", label: t("admin.lowInventory.tabHistory") },
        ]}
      />
      <div className="mt-4">{children}</div>
    </>
  )
}
