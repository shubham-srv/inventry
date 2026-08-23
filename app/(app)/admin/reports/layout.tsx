import { PageHeader } from "@/components/page-header"
import { TabNav } from "@/components/tab-nav"

/**
 * Four views of the supply chain:
 *
 *  - Grower stock  — what growers have counted on hand, right now.
 *  - Orders        — the order book between growers and vendors.
 *  - Vendor stock  — what vendors last reported they are holding.
 *  - Power BI      — the embedded analytics.
 *
 * ⚠️ THE THREE REPORTS DO NOT RECONCILE WITH EACH OTHER, and sitting them side
 * by side invites the assumption that they do. Grower stock is a counted
 * quantity in the ledger. Vendor stock is a vendor's own self-report, and an
 * allocation within it is an INTENTION that moves nothing. And receiving an
 * order writes no ledger row at all — deliberately, because on-hand comes from
 * the daily count and a receipt would double-count it. Each tab is also keyed
 * differently (grower×item, order, vendor×item), so no row-level cross-check
 * between any two of them is even possible.
 *
 * Separate routes rather than client tabs, so each keeps its own filters and
 * pagination in the URL. Note that no tab may be a path prefix of another:
 * TabNav marks a tab active on `startsWith(href + "/")`, so a tab living at
 * `/admin/reports` itself would stay lit on all four. That route redirects to
 * the first tab instead.
 *
 * The capability check lives in each child page, not here — that is the
 * convention across admin, and a layout does not re-run when navigating between
 * sibling routes.
 */
export default function ReportsLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <PageHeader
        title="Reports"
        description="Current stock on both sides of the supply chain, the order book between them, and the embedded Power BI analytics. The three are separate views — they are not meant to add up."
      />
      <TabNav
        tabs={[
          { href: "/admin/reports/grower-stock", label: "Grower stock" },
          { href: "/admin/reports/orders", label: "Orders" },
          { href: "/admin/reports/vendor-stock", label: "Vendor stock" },
          { href: "/admin/reports/power-bi", label: "Power BI" },
        ]}
      />
      <div className="mt-4">{children}</div>
    </>
  )
}
