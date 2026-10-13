import { type NextRequest } from "next/server"
import { requireRole } from "@/lib/auth/session"
import { AUDIT_ACTIONS, ROLES } from "@/lib/constants"
import { getLocale, getT } from "@/lib/i18n/server"
import { getGrowerItems } from "@/lib/grower/items"
import { buildWorkbook } from "@/lib/export/excel"
import { recordAudit } from "@/lib/audit"

/** The grower's "My items" list as .xlsx — same rows and numbers as the page. */
export async function GET(request: NextRequest) {
  const user = await requireRole([ROLES.GROWER_USER])
  if (!user.growerId) return new Response("Not mapped to a grower", { status: 403 })

  const [t, locale] = await Promise.all([getT(), getLocale()])
  const q = request.nextUrl.searchParams.get("q") || undefined
  const { locations, rows } = await getGrowerItems(user.growerId, locale, q)

  const buffer = await buildWorkbook([
    {
      name: t("grower.items.title"),
      columns: [
        { header: t("grower.items.itemId"), key: "itemId", width: 16 },
        { header: t("grower.items.legacyId"), key: "legacy", width: 16 },
        { header: t("grower.items.item"), key: "item", width: 32 },
        { header: t("grower.items.commodity"), key: "commodity", width: 18 },
        { header: t("grower.items.category"), key: "category", width: 16 },
        ...locations.map((l) => ({ header: l.name, key: `loc${l.id}`, width: 14 })),
        { header: t("grower.items.onHand"), key: "onHand", width: 12 },
        { header: t("grower.items.onOrder"), key: "onOrder", width: 12 },
        { header: t("grower.items.lastCounted"), key: "asOf", width: 14 },
        { header: t("grower.items.notes"), key: "notes", width: 40 },
      ],
      rows: rows.map((r) => ({
        itemId: r.itemId,
        legacy: r.legacyId ?? "",
        item: r.itemName,
        commodity: r.commodityName ?? "",
        category: r.categoryName ?? "",
        ...Object.fromEntries(locations.map((l) => [`loc${l.id}`, r.byLocation.get(l.id)?.quantity ?? ""])),
        // Blank, never 0, for an item nobody has counted.
        onHand: r.onHand ?? "",
        onOrder: r.onOrder,
        asOf: r.asOf ? r.asOf.toISOString().slice(0, 10) : "",
        notes: r.notes ?? "",
      })),
    },
  ])

  await recordAudit({
    userId: user.id,
    action: AUDIT_ACTIONS.EXPORT,
    entityType: "GrowerItems",
    changes: { growerId: user.growerId, rows: rows.length },
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
