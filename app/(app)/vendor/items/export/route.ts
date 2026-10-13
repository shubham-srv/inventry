import { type NextRequest } from "next/server"
import { requireRole } from "@/lib/auth/session"
import { AUDIT_ACTIONS, ROLES } from "@/lib/constants"
import { getLocale, getT } from "@/lib/i18n/server"
import { getVendorItems } from "@/lib/vendor/items"
import { buildWorkbook } from "@/lib/export/excel"
import { recordAudit } from "@/lib/audit"

/** The vendor's "My items" list as .xlsx — same rows and numbers as the page. */
export async function GET(request: NextRequest) {
  const user = await requireRole([ROLES.VENDOR_USER])
  if (!user.vendorId) return new Response("Not mapped to a vendor", { status: 403 })

  const [t, locale] = await Promise.all([getT(), getLocale()])
  const q = request.nextUrl.searchParams.get("q") || undefined
  const rows = await getVendorItems(user.vendorId, locale, q)

  const buffer = await buildWorkbook([
    {
      name: t("vendor.items.title"),
      columns: [
        { header: t("vendor.items.itemId"), key: "itemId", width: 16 },
        { header: t("vendor.items.legacyId"), key: "legacy", width: 16 },
        { header: t("vendor.items.item"), key: "item", width: 32 },
        { header: t("vendor.items.commodity"), key: "commodity", width: 18 },
        { header: t("vendor.items.category"), key: "category", width: 16 },
        { header: t("vendor.items.reported"), key: "reported", width: 12 },
        { header: t("vendor.items.allocated"), key: "allocated", width: 12 },
        { header: t("vendor.items.lastReported"), key: "asOf", width: 14 },
        { header: t("vendor.items.conversions"), key: "conversions", width: 32 },
        { header: t("vendor.items.notes"), key: "notes", width: 40 },
      ],
      rows: rows.map((r) => {
        const per = new Map(r.ratios.map((x) => [x.level, x.perParent]))
        return {
          itemId: r.itemId,
          legacy: r.legacyId ?? "",
          item: r.itemName,
          commodity: r.commodityName ?? "",
          category: r.categoryName ?? "",
          // Blank, never 0, for an item never reported.
          reported: r.reported ?? "",
          allocated: r.allocated ?? "",
          asOf: r.asOf ? r.asOf.toISOString().slice(0, 10) : "",
          // "Bags ×10 → Boxes ×5 → Cases"
          conversions: r.chain
            ? [r.categoryName ?? "", ...r.chain.levels.map((l) => `×${per.get(l.level) ?? "?"} → ${l.unitName}`)].join(" ")
            : "",
          notes: r.notes ?? "",
        }
      }),
    },
  ])

  await recordAudit({
    userId: user.id,
    action: AUDIT_ACTIONS.EXPORT,
    entityType: "VendorItems",
    changes: { vendorId: user.vendorId, rows: rows.length },
  })

  const date = new Date().toISOString().slice(0, 10)
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="my-items-${date}.xlsx"`,
      "Cache-Control": "no-store",
    },
  })
}
