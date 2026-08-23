import { type NextRequest } from "next/server"
import { requireCapability } from "@/lib/auth/session"
import { CAPABILITIES, type Capability } from "@/lib/rbac"
import { buildEntityExport, isExportableEntity } from "@/lib/admin/export"
import { buildWorkbook } from "@/lib/export/excel"
import { recordAudit } from "@/lib/audit"
import { AUDIT_ACTIONS } from "@/lib/constants"

// Admin-only datasets (partner/user data); the rest are master data editors can export.
const ADMIN_ONLY = new Set(["users", "growers", "vendors", "authorizations", "full"])

// Entities that need a capability the two buckets below cannot express. Without
// this the snapshot would fall through to MANAGE_MASTER_DATA, which an Editor
// HAS while lacking VIEW_REPORTS — so they would be 403'd from the page but able
// to pull the whole report by URL.
const CAPABILITY_BY_ENTITY: Record<string, Capability> = {
  "inventory-snapshot": CAPABILITIES.VIEW_REPORTS,
  orders: CAPABILITIES.VIEW_REPORTS,
  "vendor-stock": CAPABILITIES.VIEW_REPORTS,
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const entity = searchParams.get("entity") ?? "full"

  if (!isExportableEntity(entity)) {
    return new Response("Unknown export entity", { status: 400 })
  }

  const capability =
    CAPABILITY_BY_ENTITY[entity] ??
    (ADMIN_ONLY.has(entity)
      ? CAPABILITIES.MANAGE_GROWERS_VENDORS
      : CAPABILITIES.MANAGE_MASTER_DATA)
  const user = await requireCapability(capability)

  const sp: Record<string, string> = {}
  searchParams.forEach((v, k) => {
    if (k !== "entity") sp[k] = v
  })

  const { filename, sheets } = await buildEntityExport(entity, sp)
  const buffer = await buildWorkbook(sheets)

  await recordAudit({
    userId: user.id,
    action: AUDIT_ACTIONS.EXPORT,
    entityType: entity === "full" ? "MasterData" : entity,
    changes: {
      filters: sp,
      sheets: sheets.map((s) => ({ name: s.name, rows: s.rows.length })),
    },
  })

  const date = new Date().toISOString().slice(0, 10)
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}-${date}.xlsx"`,
      "Cache-Control": "no-store",
    },
  })
}
