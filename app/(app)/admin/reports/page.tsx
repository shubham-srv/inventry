import { redirect } from "next/navigation"

// /admin/reports is what the sidebar links to (so the nav entry stays
// highlighted across all four tabs), and it lands on the first one. The tabs
// themselves are sibling routes — see layout.tsx for why none of them may live
// at /admin/reports itself.
export default function ReportsIndexPage() {
  redirect("/admin/reports/grower-stock")
}
