import "server-only"
import { type Prisma } from "@prisma/client"

// Shared Prisma `where` builders so list pages and Excel exports apply
// IDENTICAL filters. SQL Server's default collation is case-insensitive,
// so `contains` already does case-insensitive search (Prisma sqlserver
// has no `mode: "insensitive"`).

type SP = Record<string, string>

export function itemsWhere(sp: SP): Prisma.ItemWhereInput {
  const and: Prisma.ItemWhereInput[] = []
  if (sp.q)
    and.push({
      OR: [
        { id: { contains: sp.q } },
        { itemName: { contains: sp.q } },
        { legacyFamousId: { contains: sp.q } },
      ],
    })
  if (sp.status) and.push({ status: sp.status })
  if (sp.commodity) and.push({ commodityCode: sp.commodity })
  if (sp.category) and.push({ materialCategoryCode: sp.category })
  if (sp.region) and.push({ regionId: Number(sp.region) || 0 })
  return and.length ? { AND: and } : {}
}

export function growersWhere(sp: SP): Prisma.GrowerWhereInput {
  const and: Prisma.GrowerWhereInput[] = []
  if (sp.q)
    and.push({
      OR: [{ growerName: { contains: sp.q } }, { primaryEmail: { contains: sp.q } }],
    })
  if (sp.status) and.push({ status: sp.status })
  return and.length ? { AND: and } : {}
}

export function vendorsWhere(sp: SP): Prisma.VendorWhereInput {
  const and: Prisma.VendorWhereInput[] = []
  if (sp.q)
    and.push({
      OR: [
        { vendorName: { contains: sp.q } },
        { primaryContact: { contains: sp.q } },
        { contactEmail: { contains: sp.q } },
      ],
    })
  if (sp.status) and.push({ status: sp.status })
  if (sp.type) and.push({ vendorType: sp.type })
  if (sp.region) and.push({ regionId: Number(sp.region) || 0 })
  return and.length ? { AND: and } : {}
}

export function usersWhere(sp: SP): Prisma.UserWhereInput {
  const and: Prisma.UserWhereInput[] = []
  if (sp.q)
    and.push({
      OR: [
        { firstName: { contains: sp.q } },
        { lastName: { contains: sp.q } },
        { email: { contains: sp.q } },
      ],
    })
  if (sp.role) and.push({ roleId: Number(sp.role) || 0 })
  if (sp.status) and.push({ isActive: sp.status === "active" })
  return and.length ? { AND: and } : {}
}

export function commoditiesWhere(sp: SP): Prisma.CommodityWhereInput {
  if (!sp.q) return {}
  return { OR: [{ code: { contains: sp.q } }, { name: { contains: sp.q } }] }
}

export function categoriesWhere(sp: SP): Prisma.MaterialCategoryWhereInput {
  if (!sp.q) return {}
  return { OR: [{ code: { contains: sp.q } }, { name: { contains: sp.q } }] }
}

export function countriesWhere(sp: SP): Prisma.CountryOfOriginWhereInput {
  if (!sp.q) return {}
  return { name: { contains: sp.q } }
}

export function subCategoriesWhere(sp: SP): Prisma.SubCategoryWhereInput {
  const and: Prisma.SubCategoryWhereInput[] = []
  if (sp.q) and.push({ name: { contains: sp.q } })
  if (sp.category) and.push({ materialCategoryCode: sp.category })
  return and.length ? { AND: and } : {}
}

export function locationsWhere(sp: SP): Prisma.LocationWhereInput {
  const and: Prisma.LocationWhereInput[] = []
  if (sp.q)
    and.push({
      OR: [
        { locationName: { contains: sp.q } },
        { region: { name: { contains: sp.q } } },
      ],
    })
  if (sp.type) and.push({ locationType: sp.type })
  if (sp.region) and.push({ regionId: Number(sp.region) || 0 })
  return and.length ? { AND: and } : {}
}

export function authorizationsWhere(sp: SP): Prisma.GrowerItemAuthorizationWhereInput {
  const and: Prisma.GrowerItemAuthorizationWhereInput[] = []
  if (sp.grower) and.push({ growerId: Number(sp.grower) || 0 })
  if (sp.q)
    and.push({
      OR: [
        { itemId: { contains: sp.q } },
        { item: { itemName: { contains: sp.q } } },
      ],
    })
  if (sp.status) and.push({ isActive: sp.status === "active" })
  return and.length ? { AND: and } : {}
}
