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
      region: true,
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
      { header: "Unit of measure", key: "uom", width: 16 },
      { header: "Application", key: "app", width: 16 },
      { header: "Status", key: "status", width: 12 },
      { header: "Region", key: "region", width: 12 },
      { header: "Legacy ID", key: "legacy", width: 16 },
    ],
    rows: rows.map((i) => ({
      id: i.id,
      name: i.itemName,
      commodity: i.commodity?.name ?? i.commodityCode ?? "",
      category: i.materialCategory?.name ?? i.materialCategoryCode ?? "",
      sub: i.subCategory?.name ?? "",
      coo: i.countryOfOrigin?.name ?? "",
      uom: i.unitOfMeasure ?? "",
      app: i.applicationMethod ?? "",
      status: i.status,
      region: i.region?.name ?? "",
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
      region: true,
      materialCategories: { where: { isActive: true }, include: { materialCategory: true } },
    },
    orderBy: { vendorName: "asc" },
  })
  return {
    name: "Vendors",
    columns: [
      { header: "ID", key: "id", width: 8 },
      { header: "Name", key: "name", width: 28 },
      { header: "Type", key: "type", width: 18 },
      { header: "Region", key: "region", width: 12 },
      { header: "Country", key: "country", width: 12 },
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
      region: v.region?.name ?? "",
      country: v.country ?? "",
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
  const rows = await prisma.countryOfOrigin.findMany({
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
    include: { region: true },
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
      type: l.locationType ?? "",
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

export function isExportableEntity(entity: string): boolean {
  return entity === "full" || entity in SINGLE
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
  const fn = SINGLE[entity]
  return { filename: entity, sheets: [await fn(sp)] }
}
