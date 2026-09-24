import "server-only"
import { prisma } from "@/lib/db"
import { type ExcelSheet } from "@/lib/export/excel"
import {
  itemsWhere,
  growersWhere,
  vendorsWhere,
  usersWhere,
  commoditiesWhere,
  categoriesWhere,
  countriesWhere,
  subCategoriesWhere,
  locationsWhere,
  authorizationsWhere,
} from "@/lib/admin/queries"
import { getInventorySnapshot } from "@/lib/admin/inventory-snapshot"
import { getOrdersReport } from "@/lib/admin/orders-report"
import { getVendorStock } from "@/lib/admin/vendor-stock"

type SP = Record<string, string>
const d = (date: Date) => date.toISOString().slice(0, 10)

async function itemsSheet(sp: SP): Promise<ExcelSheet> {
  const rows = await prisma.item.findMany({
    where: itemsWhere(sp),
    include: {
      commodity: true,
      materialCategory: true,
      subCategory: true,
      countryOfOrigin: true,
    },
    orderBy: { id: "asc" },
  })
  return {
    name: "Items",
    columns: [
      { header: "Item ID", key: "id", width: 16 },
      { header: "Name", key: "name", width: 32 },
      { header: "Commodity", key: "commodity", width: 18 },
      { header: "Category", key: "category", width: 18 },
      { header: "Sub-category", key: "sub", width: 20 },
      { header: "Country of origin", key: "coo", width: 18 },
      { header: "Application", key: "app", width: 16 },
      { header: "Status", key: "status", width: 12 },
      { header: "Legacy ID", key: "legacy", width: 16 },
    ],
    rows: rows.map((i) => ({
      id: i.id,
      name: i.itemName,
      commodity: i.commodity?.name ?? i.commodityCode ?? "",
      category: i.materialCategory?.name ?? i.materialCategoryCode ?? "",
      sub: i.subCategory?.name ?? "",
      coo: i.countryOfOrigin?.name ?? "",
      app: i.applicationMethod ?? "",
      status: i.status,
      legacy: i.legacyFamousId ?? "",
    })),
  }
}

async function growersSheet(sp: SP): Promise<ExcelSheet> {
  const rows = await prisma.grower.findMany({
    where: growersWhere(sp),
    orderBy: { growerName: "asc" },
  })
  return {
    name: "Growers",
    columns: [
      { header: "ID", key: "id", width: 8 },
      { header: "Name", key: "name", width: 28 },
      { header: "Primary email", key: "email", width: 28 },
      { header: "Status", key: "status", width: 12 },
      { header: "Created", key: "created", width: 14 },
    ],
    rows: rows.map((g) => ({
      id: g.id,
      name: g.growerName,
      email: g.primaryEmail ?? "",
      status: g.status,
      created: d(g.createdAt),
    })),
  }
}

async function vendorsSheet(sp: SP): Promise<ExcelSheet> {
  const rows = await prisma.vendor.findMany({
    where: vendorsWhere(sp),
    include: {
      homeCountry: true,
      locations: {
        where: { isActive: true },
        include: { location: { include: { region: true } } },
        orderBy: { location: { locationName: "asc" } },
      },
      materialCategories: { where: { isActive: true }, include: { materialCategory: true } },
      supplyCountries: { where: { isActive: true }, include: { country: true } },
    },
    orderBy: { vendorName: "asc" },
  })
  return {
    name: "Vendors",
    columns: [
      { header: "ID", key: "id", width: 8 },
      { header: "Name", key: "name", width: 28 },
      { header: "Type", key: "type", width: 18 },
      { header: "Region", key: "region", width: 16 },
      { header: "Country", key: "country", width: 12 },
      { header: "Locations", key: "locations", width: 32 },
      { header: "Supplies to", key: "suppliesTo", width: 28 },
      { header: "Material categories", key: "categories", width: 28 },
      { header: "Contact", key: "contact", width: 20 },
      { header: "Email", key: "email", width: 26 },
      { header: "Lead time (days)", key: "lead", width: 16 },
      { header: "Payment terms (days)", key: "terms", width: 20 },
      { header: "Status", key: "status", width: 12 },
    ],
    rows: rows.map((v) => ({
      id: v.id,
      name: v.vendorName,
      type: v.vendorType ?? "",
      // Deduped, like the admin list: two sites in one region read once.
      region: [
        ...new Set(v.locations.map((vl) => vl.location.region?.name).filter(Boolean)),
      ].join(", "),
      country: v.homeCountry?.name ?? "",
      locations: v.locations.map((vl) => vl.location.locationName).join(", "),
      suppliesTo: v.supplyCountries.map((sc) => sc.country.name).join(", "),
      categories: v.materialCategories.map((mc) => mc.materialCategory.name).join(", "),
      contact: v.primaryContact ?? "",
      email: v.contactEmail ?? "",
      lead: v.leadTimeDays ?? "",
      terms: v.paymentTermsDays ?? "",
      status: v.status,
    })),
  }
}

async function usersSheet(sp: SP): Promise<ExcelSheet> {
  const rows = await prisma.user.findMany({
    where: usersWhere(sp),
    include: { role: true, grower: true, vendor: true },
    orderBy: [{ roleId: "asc" }, { firstName: "asc" }],
  })
  return {
    name: "Users",
    columns: [
      { header: "ID", key: "id", width: 8 },
      { header: "First name", key: "first", width: 16 },
      { header: "Last name", key: "last", width: 16 },
      { header: "Email", key: "email", width: 28 },
      { header: "Role", key: "role", width: 16 },
      { header: "Grower", key: "grower", width: 18 },
      { header: "Vendor", key: "vendor", width: 18 },
      { header: "Active", key: "active", width: 10 },
    ],
    rows: rows.map((u) => ({
      id: u.id,
      first: u.firstName,
      last: u.lastName,
      email: u.email,
      role: u.role.roleName,
      grower: u.grower?.growerName ?? "",
      vendor: u.vendor?.vendorName ?? "",
      active: u.isActive ? "Yes" : "No",
    })),
  }
}

async function commoditiesSheet(sp: SP): Promise<ExcelSheet> {
  const rows = await prisma.commodity.findMany({
    where: commoditiesWhere(sp),
    orderBy: { code: "asc" },
  })
  return {
    name: "Commodities",
    columns: [
      { header: "Code", key: "code", width: 12 },
      { header: "Name", key: "name", width: 28 },
    ],
    rows: rows.map((c) => ({ code: c.code, name: c.name })),
  }
}

async function categoriesSheet(sp: SP): Promise<ExcelSheet> {
  const rows = await prisma.materialCategory.findMany({
    where: categoriesWhere(sp),
    orderBy: { code: "asc" },
  })
  return {
    name: "Material Categories",
    columns: [
      { header: "Code", key: "code", width: 12 },
      { header: "Name", key: "name", width: 28 },
    ],
    rows: rows.map((c) => ({ code: c.code, name: c.name })),
  }
}

async function subCategoriesSheet(sp: SP): Promise<ExcelSheet> {
  const rows = await prisma.subCategory.findMany({
    where: subCategoriesWhere(sp),
    include: { materialCategory: true },
    orderBy: { name: "asc" },
  })
  return {
    name: "Sub-categories",
    columns: [
      { header: "ID", key: "id", width: 8 },
      { header: "Name", key: "name", width: 28 },
      { header: "Category", key: "category", width: 22 },
    ],
    rows: rows.map((s) => ({
      id: s.id,
      name: s.name,
      category: s.materialCategory.name,
    })),
  }
}

async function countriesSheet(sp: SP): Promise<ExcelSheet> {
  const rows = await prisma.country.findMany({
    where: countriesWhere(sp),
    include: { _count: { select: { items: true } } },
    orderBy: { name: "asc" },
  })
  return {
    name: "Countries of Origin",
    columns: [
      { header: "ID", key: "id", width: 8 },
      { header: "Country", key: "name", width: 24 },
      { header: "Items", key: "items", width: 10 },
    ],
    rows: rows.map((c) => ({ id: c.id, name: c.name, items: c._count.items })),
  }
}

async function locationsSheet(sp: SP): Promise<ExcelSheet> {
  const rows = await prisma.location.findMany({
    where: locationsWhere(sp),
    include: { locationType: true, region: true },
    orderBy: { locationName: "asc" },
  })
  return {
    name: "Locations",
    columns: [
      { header: "ID", key: "id", width: 8 },
      { header: "Name", key: "name", width: 26 },
      { header: "Type", key: "type", width: 16 },
      { header: "Region", key: "region", width: 12 },
      { header: "Commodity focus", key: "focus", width: 18 },
    ],
    rows: rows.map((l) => ({
      id: l.id,
      name: l.locationName,
      type: l.locationType?.name ?? "",
      region: l.region?.name ?? "",
      focus: l.commodityFocus ?? "",
    })),
  }
}

async function authorizationsSheet(sp: SP): Promise<ExcelSheet> {
  const rows = await prisma.growerItemAuthorization.findMany({
    where: authorizationsWhere(sp),
    include: { grower: true, item: true },
    orderBy: [{ growerId: "asc" }, { itemId: "asc" }],
  })
  return {
    name: "Item Authorizations",
    columns: [
      { header: "Grower", key: "grower", width: 20 },
      { header: "Item ID", key: "itemId", width: 16 },
      { header: "Item name", key: "itemName", width: 30 },
      { header: "Active", key: "active", width: 10 },
    ],
    rows: rows.map((a) => ({
      grower: a.grower.growerName,
      itemId: a.itemId,
      itemName: a.item.itemName,
      active: a.isActive ? "Yes" : "No",
    })),
  }
}

/**
 * The current-inventory snapshot, honouring whatever filters the page has on.
 *
 * Unpaged on purpose — a download should be the whole filtered set, not the
 * 25 rows that happened to be on screen.
 */
async function inventorySnapshotSheet(sp: SP): Promise<ExcelSheet> {
  const { rows } = await getInventorySnapshot({
    growerId: Number(sp.grower) || undefined,
    locationId: Number(sp.location) || undefined,
    commodity: sp.commodity || undefined,
    category: sp.category || undefined,
    stock: sp.stock || undefined,
    q: sp.q || undefined,
  })
  return {
    name: "Inventory snapshot",
    columns: [
      { header: "Grower", key: "grower", width: 24 },
      { header: "Item ID", key: "itemId", width: 16 },
      { header: "Item", key: "item", width: 32 },
      { header: "Commodity", key: "commodity", width: 18 },
      { header: "Counted in", key: "category", width: 16 },
      { header: "On hand", key: "onHand", width: 12 },
      { header: "Threshold", key: "threshold", width: 12 },
      { header: "Threshold scope", key: "scope", width: 16 },
      { header: "State", key: "state", width: 16 },
      { header: "Last counted", key: "asOf", width: 14 },
    ],
    rows: rows.map((r) => ({
      grower: r.growerName,
      itemId: r.itemId,
      item: r.itemName,
      commodity: r.commodityName ?? "",
      category: r.categoryName ?? "",
      // Blank rather than 0 for a pair that has never been counted — a spurious
      // zero would read as "we counted, and there is none".
      onHand: r.onHand ?? "",
      threshold: r.threshold ?? "",
      scope: r.thresholdScope ?? "",
      state: r.state,
      asOf: r.asOf ? d(r.asOf) : "",
    })),
  }
}

const SINGLE: Record<string, (sp: SP) => Promise<ExcelSheet>> = {
  items: itemsSheet,
  growers: growersSheet,
  vendors: vendorsSheet,
  users: usersSheet,
  commodities: commoditiesSheet,
  categories: categoriesSheet,
  "sub-categories": subCategoriesSheet,
  countries: countriesSheet,
  locations: locationsSheet,
  authorizations: authorizationsSheet,
}

/** Every grower order. Unpaged, honouring the page's filters — as above. */
async function ordersSheet(sp: SP): Promise<ExcelSheet> {
  const { rows } = await getOrdersReport({
    status: sp.status || undefined,
    growerId: Number(sp.grower) || undefined,
    vendorId: Number(sp.vendor) || undefined,
    periodDays: Number(sp.period) || undefined,
    delivery: sp.delivery || undefined,
    receipt: sp.receipt || undefined,
    q: sp.q || undefined,
  })
  return {
    name: "Orders",
    columns: [
      { header: "Order", key: "id", width: 8 },
      { header: "Status", key: "status", width: 12 },
      { header: "Grower", key: "grower", width: 24 },
      { header: "Vendor", key: "vendor", width: 24 },
      { header: "Item ID", key: "itemId", width: 16 },
      { header: "Item", key: "item", width: 32 },
      { header: "Counted in", key: "category", width: 14 },
      { header: "Ordered", key: "ordered", width: 12 },
      { header: "Received", key: "received", width: 12 },
      { header: "Variance", key: "variance", width: 12 },
      { header: "Reason", key: "reason", width: 14 },
      { header: "Ordered on", key: "orderDate", width: 14 },
      { header: "ETA", key: "eta", width: 14 },
      { header: "Closed", key: "closedAt", width: 14 },
      { header: "Delivery", key: "delivery", width: 16 },
      { header: "Delivery days", key: "deliveryDays", width: 14 },
      { header: "Lead time (days)", key: "lead", width: 16 },
      { header: "Vendor SLA (days)", key: "sla", width: 18 },
    ],
    rows: rows.map((r) => ({
      id: r.id,
      status: r.status,
      grower: r.growerName,
      vendor: r.vendorName,
      itemId: r.itemId,
      item: r.itemName,
      category: r.categoryName ?? "",
      ordered: r.quantity,
      // Blank, never 0 — "nothing was recorded" is not "nothing arrived".
      received: r.receivedQuantity ?? "",
      variance: r.variance ?? "",
      reason: r.receiptNote ?? "",
      orderDate: d(r.orderDate),
      eta: r.expectedDeliveryDate ? d(r.expectedDeliveryDate) : "",
      closedAt: r.closedAt ? d(r.closedAt) : "",
      delivery: r.delivery,
      deliveryDays: r.deliveryDays ?? "",
      lead: r.actualLeadDays ?? "",
      sla: r.slaLeadDays ?? "",
    })),
  }
}

/** Current vendor-reported stock. Unpaged, honouring the page's filters. */
async function vendorStockSheet(sp: SP): Promise<ExcelSheet> {
  const { rows } = await getVendorStock({
    vendorId: Number(sp.vendor) || undefined,
    commodity: sp.commodity || undefined,
    category: sp.category || undefined,
    growerId: Number(sp.grower) || undefined,
    freshness: sp.freshness || undefined,
    alloc: sp.alloc || undefined,
    q: sp.q || undefined,
  })
  return {
    name: "Vendor stock",
    columns: [
      { header: "Vendor", key: "vendor", width: 24 },
      { header: "Item ID", key: "itemId", width: 16 },
      { header: "Item", key: "item", width: 32 },
      { header: "Commodity", key: "commodity", width: 18 },
      { header: "Counted in", key: "category", width: 14 },
      { header: "Reported", key: "reported", width: 12 },
      { header: "Allocated", key: "allocated", width: 12 },
      { header: "Unallocated", key: "unallocated", width: 14 },
      { header: "Growers served", key: "growers", width: 16 },
      { header: "Last reported", key: "asOf", width: 14 },
      { header: "Status", key: "state", width: 16 },
    ],
    rows: rows.map((r) => ({
      vendor: r.vendorName,
      itemId: r.itemId,
      item: r.itemName,
      commodity: r.commodityName ?? "",
      category: r.categoryName ?? "",
      // Blank, never 0 — a never-reported mapping has no figure, which is not
      // the same as a vendor reporting that they hold none.
      reported: r.reported ?? "",
      allocated: r.allocated ?? "",
      unallocated: r.unallocated ?? "",
      growers: r.growersServed ?? "",
      asOf: r.asOf ? d(r.asOf) : "",
      state: r.state === "NeverReported" ? "Never reported" : r.state,
    })),
  }
}

/**
 * Computed reports, kept OUT of `SINGLE` on purpose: `entity=full` fans out over
 * every sheet in SINGLE, and a master-data workbook should not silently gain an
 * unfiltered growers × items report.
 */
const COMPUTED: Record<string, (sp: SP) => Promise<ExcelSheet>> = {
  "inventory-snapshot": inventorySnapshotSheet,
  orders: ordersSheet,
  "vendor-stock": vendorStockSheet,
}

export function isExportableEntity(entity: string): boolean {
  return entity === "full" || entity in SINGLE || entity in COMPUTED
}

export async function buildEntityExport(
  entity: string,
  sp: SP
): Promise<{ filename: string; sheets: ExcelSheet[] }> {
  if (entity === "full") {
    const sheets = await Promise.all(
      Object.values(SINGLE).map((fn) => fn({}))
    )
    return { filename: "master-data", sheets }
  }
  const fn = SINGLE[entity] ?? COMPUTED[entity]
  return { filename: entity, sheets: [await fn(sp)] }
}
