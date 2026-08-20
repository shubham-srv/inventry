import { PrismaClient, Prisma } from "@prisma/client"
import { resolvePack } from "../lib/packaging/resolve"
import {
  ROLES,
  NOTIFICATION_TYPES,
  AUDIT_ACTIONS,
  COUNTRIES_OF_ORIGIN,
  REGIONS,
} from "../lib/constants"

const prisma = new PrismaClient()

// ---- helpers ----------------------------------------------------------
function daysAgo(n: number): Date {
  const d = new Date()
  d.setHours(12, 0, 0, 0)
  d.setDate(d.getDate() - n)
  return d
}

// deterministic pseudo-random so seed output is stable
function rng(seed: number): number {
  const x = Math.sin(seed) * 10000
  return x - Math.floor(x)
}

/** How far back the demo history runs — one quarter. */
const QUARTER_DAYS = 91

/**
 * createMany in fixed-size batches.
 *
 * SQL Server caps a statement at 2,100 bind parameters. A quarter of history is
 * ~1,800 ledger rows × 8 columns ≈ 14,000 parameters, so a single createMany
 * would have to be split. Prisma does chunk internally, but doing it here keeps
 * the batch size explicit and predictable rather than relying on that.
 */
async function createManyChunked<T>(
  model: { createMany: (args: { data: T[] }) => Promise<unknown> },
  rows: T[],
  size = 200
): Promise<void> {
  for (let i = 0; i < rows.length; i += size) {
    await model.createMany({ data: rows.slice(i, i + size) })
  }
}

async function clearAll() {
  // delete in FK-safe order
  await prisma.notificationLog.deleteMany()
  await prisma.auditLog.deleteMany()
  await prisma.vendorAllocation.deleteMany()
  await prisma.vendorSubmissionDetail.deleteMany()
  await prisma.vendorSubmission.deleteMany()
  await prisma.orderPackLine.deleteMany()
  await prisma.order.deleteMany()
  await prisma.inventoryLedger.deleteMany()
  await prisma.growerSubmissionDetail.deleteMany()
  await prisma.growerSubmission.deleteMany()
  await prisma.lowInventoryFlag.deleteMany()
  await prisma.missingItemRequest.deleteMany()
  await prisma.itemThreshold.deleteMany()
  await prisma.schedulerSetting.deleteMany()
  await prisma.vendorMaterialCategory.deleteMany()
  await prisma.vendorPackRatio.deleteMany()
  await prisma.itemVendor.deleteMany()
  // Chains are referenced by ItemVendor (NoAction) and reference MaterialCategory
  // (NoAction), so they sit between the two.
  await prisma.packagingChainLevel.deleteMany()
  await prisma.packagingChain.deleteMany()
  await prisma.growerItemAuthorization.deleteMany()
  // Both hold FKs into tables cleared further down (Country, Location, Grower,
  // Vendor), so they have to go first.
  await prisma.vendorCountry.deleteMany()
  await prisma.growerLocation.deleteMany()
  // Both FK to Item/Grower with NoAction, so they must go before item/grower
  // below — otherwise a re-run of the seed dies on a FK constraint violation.
  await prisma.itemMessageGrower.deleteMany()
  await prisma.itemMessageTranslation.deleteMany()
  await prisma.itemMessage.deleteMany()
  await prisma.item.deleteMany()
  await prisma.country.deleteMany()
  await prisma.subCategory.deleteMany()
  await prisma.materialCategory.deleteMany()
  await prisma.commodity.deleteMany()
  await prisma.powerBiReport.deleteMany()
  await prisma.user.deleteMany()
  await prisma.role.deleteMany()
  await prisma.location.deleteMany()
  await prisma.vendor.deleteMany()
  await prisma.grower.deleteMany()
  await prisma.region.deleteMany()
}

async function main() {
  // Safety: this seed WIPES the database (clearAll below) — it's for the local
  // demo only. Production reference data is created idempotently by
  // prisma/bootstrap.ts. Refuse to run if NODE_ENV=production.
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "Refusing to run the demo seed with NODE_ENV=production (it deletes all data). Use `npm run db:bootstrap` instead."
    )
  }

  console.log("Clearing existing data…")
  await clearAll()

  // ---- Roles ----------------------------------------------------------
  // Rows whose generated id is needed later are inserted with createMany (one
  // statement) and then read back in a single findMany — `createManyAndReturn`
  // is not supported on the sqlserver provider, so that pair is how we get ids
  // in bulk. Write-only rows just use createMany.
  console.log("Seeding roles…")
  const roleDefs = [
    { roleName: ROLES.SUPER_ADMIN, description: "Full access incl. settings" },
    { roleName: ROLES.INTERNAL_ADMIN, description: "Admin incl. onboarding & settings" },
    { roleName: ROLES.EDITOR, description: "Master data, no onboarding/settings" },
    { roleName: ROLES.GROWER_USER, description: "On-field grower inventory user" },
    { roleName: ROLES.VENDOR_USER, description: "Vendor supply reporting user" },
  ]
  await prisma.role.createMany({ data: roleDefs })
  const roles: Record<string, number> = Object.fromEntries(
    (await prisma.role.findMany({ select: { id: true, roleName: true } })).map((r) => [r.roleName, r.id])
  )

  // ---- Growers --------------------------------------------------------
  console.log("Seeding growers & vendors…")
  await prisma.grower.createMany({
    data: [
      { growerName: "Agribar", primaryEmail: "ops@agribar.example", status: "Active" },
      // Spanish-preference grower — demoes bilingual emails out of the box.
      { growerName: "Brigo", primaryEmail: "ops@brigo.example", status: "Active", preferredLocale: "es" },
      { growerName: "PDG", primaryEmail: "ops@pdg.example", status: "Active" },
      { growerName: "Verdeval", primaryEmail: "ops@verdeval.example", status: "Active" },
      { growerName: "Sunridge Farms", primaryEmail: "ops@sunridge.example", status: "Active" },
    ],
  })
  const growers = await prisma.grower.findMany({ orderBy: { id: "asc" } })
  const growerByName = Object.fromEntries(growers.map((g) => [g.growerName, g])) as Record<
    string,
    (typeof growers)[number]
  >
  const agribar = growerByName["Agribar"]
  const brigo = growerByName["Brigo"]
  const pdg = growerByName["PDG"]
  const verdeval = growerByName["Verdeval"]
  const sunridge = growerByName["Sunridge Farms"]

  // ---- Regions (lookup shared by items, vendors and locations) --------
  await prisma.region.createMany({ data: REGIONS.map((name) => ({ name })) })
  const regionByName: Record<string, number> = Object.fromEntries(
    (await prisma.region.findMany({ select: { id: true, name: true } })).map((r) => [r.name, r.id])
  )

  // ---- Countries (shared lookup: item origin, location, vendor) -------
  // Seeded before vendors and locations because both now hold a country FK.
  // "N/A" is a fine answer for an item's origin but not for a real site or a
  // supply-to list, so it is marked unselectable and those pickers filter it.
  await prisma.country.createMany({
    data: COUNTRIES_OF_ORIGIN.map((name) => ({
      name,
      isSelectable: name !== "N/A",
    })),
  })
  const cooByName: Record<string, number> = Object.fromEntries(
    (await prisma.country.findMany({ select: { id: true, name: true } })).map((c) => [c.name, c.id])
  )

  // ---- Locations ------------------------------------------------------
  console.log("Seeding locations…")
  const loc = await Promise.all(
    [
      { locationName: "Salinas Packing House", locationType: "Packing House", regionId: regionByName["West"], countryId: cooByName["USA"], commodityFocus: "Asparagus" },
      { locationName: "Central Warehouse", locationType: "Warehouse", regionId: regionByName["Central"], countryId: cooByName["USA"], commodityFocus: "Mixed" },
      { locationName: "East Cross-dock", locationType: "Cross-dock", regionId: regionByName["East"], countryId: cooByName["USA"], commodityFocus: "Berries" },
      { locationName: "Hermosillo Yard", locationType: "Warehouse", regionId: regionByName["West"], countryId: cooByName["Mexico"], commodityFocus: "Table Grapes" },
      // Vendor-side sites. Types are gated (lib/constants.ts LOCATION_TYPES), so
      // a vendor cannot sit at the Packing House above and a grower cannot count
      // inventory at these — which is the whole point of the type field.
      { locationName: "PackRight Plant", locationType: "Manufacturing Plant", regionId: regionByName["West"], countryId: cooByName["USA"] },
      { locationName: "Gulf Distribution Center", locationType: "Distribution Center", regionId: regionByName["East"], countryId: cooByName["USA"] },
      { locationName: "Nogales 3PL", locationType: "3PL Facility", regionId: regionByName["West"], countryId: cooByName["Mexico"] },
    ].map((l) => prisma.location.create({ data: l }))
  )

  // ---- Vendors --------------------------------------------------------
  await prisma.vendor.createMany({
    data: [
      { vendorName: "PackRight Manufacturing", vendorType: "Manufacturer", countryId: cooByName["USA"], primaryContact: "Sam Carter", contactEmail: "sam@packright.example", contactPhone: "+1-555-0101", leadTimeDays: 5, paymentTermsDays: 30, status: "Active" },
      { vendorName: "PalletPool Co", vendorType: "Pallet Pooling", countryId: cooByName["USA"], primaryContact: "Lena Ortiz", contactEmail: "lena@palletpool.example", leadTimeDays: 3, paymentTermsDays: 15, status: "Active", preferredLocale: "es" },
      { vendorName: "LabelWorks 3PL", vendorType: "3PL", countryId: cooByName["USA"], primaryContact: "Omar Reed", contactEmail: "omar@labelworks.example", leadTimeDays: 7, paymentTermsDays: 45, status: "Active" },
      { vendorName: "BoxCraft Industries", vendorType: "Manufacturer", countryId: cooByName["USA"], primaryContact: "Nina Patel", contactEmail: "nina@boxcraft.example", leadTimeDays: 10, paymentTermsDays: 60, status: "Active" },
      { vendorName: "StickerPro Labels", vendorType: "3PL", countryId: cooByName["Mexico"], primaryContact: "Hugo Marín", contactEmail: "hugo@stickerpro.example", leadTimeDays: 4, paymentTermsDays: 30, status: "Active", preferredLocale: "es" },
    ],
  })
  const vendorRows = await prisma.vendor.findMany({ orderBy: { id: "asc" } })
  const vendorByName = Object.fromEntries(vendorRows.map((v) => [v.vendorName, v])) as Record<
    string,
    (typeof vendorRows)[number]
  >
  const packRight = vendorByName["PackRight Manufacturing"]
  const palletPool = vendorByName["PalletPool Co"]
  const labelWorks = vendorByName["LabelWorks 3PL"]
  const boxCraft = vendorByName["BoxCraft Industries"]
  const stickerPro = vendorByName["StickerPro Labels"]

  // Vendor sites. Two vendors get more than one on purpose: PackRight spans
  // West + Central and StickerPro spans West + East, so the admin list's region
  // column and the region filter are exercised against a multi-region vendor
  // rather than only the one-site case.
  await prisma.vendorLocation.createMany({
    data: [
      { vendorId: packRight.id, locationId: loc[4].id, isActive: true },
      { vendorId: packRight.id, locationId: loc[1].id, isActive: true },
      { vendorId: palletPool.id, locationId: loc[1].id, isActive: true },
      { vendorId: labelWorks.id, locationId: loc[5].id, isActive: true },
      { vendorId: boxCraft.id, locationId: loc[1].id, isActive: true },
      { vendorId: stickerPro.id, locationId: loc[6].id, isActive: true },
      { vendorId: stickerPro.id, locationId: loc[5].id, isActive: true },
    ],
  })

  // ---- Users ----------------------------------------------------------
  console.log("Seeding users…")
  const admin = await prisma.user.create({
    data: {
      firstName: "Avery",
      lastName: "Admin",
      email: "admin@demo.local",
      roleId: roles[ROLES.INTERNAL_ADMIN],
    },
  })
  const adminId = admin.id

  const growerUserDefs = [
    { firstName: "James", lastName: "Field", email: "james@agribar.local", growerId: agribar.id },
    { firstName: "Maria", lastName: "Lopez", email: "maria@agribar.local", growerId: agribar.id },
    { firstName: "Diago", lastName: "Santos", email: "diago@brigo.local", growerId: brigo.id, preferredLocale: "es" },
    { firstName: "Priya", lastName: "Nair", email: "priya@pdg.local", growerId: pdg.id },
    { firstName: "Tomas", lastName: "Ruiz", email: "tomas@verdeval.local", growerId: verdeval.id },
    { firstName: "Grace", lastName: "Okafor", email: "grace@sunridge.local", growerId: sunridge.id },
  ]
  const vendorUserDefs = [
    { firstName: "Sam", lastName: "Carter", email: "sam@packright.local", vendorId: packRight.id },
    { firstName: "Lena", lastName: "Ortiz", email: "lena@palletpool.local", vendorId: palletPool.id, preferredLocale: "es" },
    { firstName: "Omar", lastName: "Reed", email: "omar@labelworks.local", vendorId: labelWorks.id },
    { firstName: "Nina", lastName: "Patel", email: "nina@boxcraft.local", vendorId: boxCraft.id },
    { firstName: "Hugo", lastName: "Marín", email: "hugo@stickerpro.local", vendorId: stickerPro.id, preferredLocale: "es" },
  ]
  await prisma.user.createMany({
    data: [
      { firstName: "Eddie", lastName: "Editor", email: "editor@demo.local", roleId: roles[ROLES.EDITOR], createdBy: adminId },
      ...growerUserDefs.map((u) => ({ ...u, roleId: roles[ROLES.GROWER_USER], createdBy: adminId })),
      ...vendorUserDefs.map((u) => ({ ...u, roleId: roles[ROLES.VENDOR_USER], createdBy: adminId })),
    ],
  })
  // One read-back for every user id the rest of the seed needs.
  const userIdByEmail: Record<string, number> = Object.fromEntries(
    (await prisma.user.findMany({ select: { id: true, email: true } })).map((u) => [u.email, u.id])
  )
  const jamesUserId = userIdByEmail["james@agribar.local"]
  const diagoUserId = userIdByEmail["diago@brigo.local"]
  const priyaUserId = userIdByEmail["priya@pdg.local"]
  const growerUserByGrower: Record<number, number> = {
    [agribar.id]: jamesUserId,
    [brigo.id]: diagoUserId,
    [pdg.id]: priyaUserId,
    [verdeval.id]: userIdByEmail["tomas@verdeval.local"],
    [sunridge.id]: userIdByEmail["grace@sunridge.local"],
  }
  const vendorUserByVendor: Record<number, number> = {
    [packRight.id]: userIdByEmail["sam@packright.local"],
    [palletPool.id]: userIdByEmail["lena@palletpool.local"],
    [labelWorks.id]: userIdByEmail["omar@labelworks.local"],
    [boxCraft.id]: userIdByEmail["nina@boxcraft.local"],
    [stickerPro.id]: userIdByEmail["hugo@stickerpro.local"],
  }

  // ---- Commodities / Categories / Sub-categories ----------------------
  console.log("Seeding commodities, categories, items…")
  const commodities = [
    { code: "AP", name: "Asparagus" },
    { code: "BP", name: "Bell Peppers" },
    { code: "CG", name: "Table Grapes" },
    { code: "BR", name: "Berries" },
    { code: "AV", name: "Avocado" },
  ]
  await prisma.commodity.createMany({ data: commodities.map((c) => ({ ...c, createdBy: adminId })) })

  const materialCategories = [
    { code: "BX", name: "Boxes" },
    { code: "BG", name: "Bags" },
    { code: "LB", name: "Labels" },
    { code: "PL", name: "Pallets" },
    { code: "ST", name: "Stickers" },
  ]
  await prisma.materialCategory.createMany({ data: materialCategories.map((m) => ({ ...m, createdBy: adminId })) })

  const subCatDefs = [
    { materialCategoryCode: "BX", name: "Cardboard Boxes" },
    { materialCategoryCode: "BX", name: "Packaged Boxes" },
    { materialCategoryCode: "BG", name: "Mesh Bags" },
    { materialCategoryCode: "BG", name: "Poly Bags" },
    { materialCategoryCode: "LB", name: "PLU Stickers" },
    { materialCategoryCode: "LB", name: "Brand Labels" },
    { materialCategoryCode: "PL", name: "Wooden Pallets" },
    { materialCategoryCode: "ST", name: "Adhesive Stickers" },
  ]
  await prisma.subCategory.createMany({ data: subCatDefs.map((s) => ({ ...s, createdBy: adminId })) })
  // Sub-category names are distinct across the seed, so keying the id map by
  // name is safe here (the table itself has no unique constraint on name).
  const subCats: Record<string, number> = Object.fromEntries(
    (await prisma.subCategory.findMany({ select: { id: true, name: true } })).map((s) => [s.name, s.id])
  )

  // ---- Items ----------------------------------------------------------
  const itemDefs = [
    { id: "AP-BX-00001", itemName: "Asparagus Cardboard Box 11lb", commodityCode: "AP", materialCategoryCode: "BX", subCategory: "Cardboard Boxes", uom: "Cases", coo: "USA" },
    { id: "AP-BG-00002", itemName: "Asparagus Mesh Bag 2lb", commodityCode: "AP", materialCategoryCode: "BG", subCategory: "Mesh Bags", uom: "Bags", coo: "Mexico" },
    { id: "BP-BX-00003", itemName: "Bell Pepper Box 25lb", commodityCode: "BP", materialCategoryCode: "BX", subCategory: "Cardboard Boxes", uom: "Cases", coo: "USA" },
    { id: "BP-LB-00004", itemName: "Bell Pepper PLU Sticker", commodityCode: "BP", materialCategoryCode: "LB", subCategory: "PLU Stickers", uom: "Rolls", coo: "USA" },
    { id: "CG-BX-00005", itemName: "Grape Clamshell Box", commodityCode: "CG", materialCategoryCode: "BX", subCategory: "Packaged Boxes", uom: "Cases", coo: "Peru" },
    { id: "CG-PL-00006", itemName: "Grape Wooden Pallet", commodityCode: "CG", materialCategoryCode: "PL", subCategory: "Wooden Pallets", uom: "Pallets", coo: "Canada" },
    { id: "BR-BX-00007", itemName: "Berry Clamshell 6oz", commodityCode: "BR", materialCategoryCode: "BX", subCategory: "Packaged Boxes", uom: "Cases", coo: "Mexico" },
    { id: "BR-LB-00008", itemName: "Berry Brand Label", commodityCode: "BR", materialCategoryCode: "LB", subCategory: "Brand Labels", uom: "Rolls", coo: "USA" },
    { id: "AV-BX-00009", itemName: "Avocado Box 25lb", commodityCode: "AV", materialCategoryCode: "BX", subCategory: "Cardboard Boxes", uom: "Cases", coo: "Mexico" },
    { id: "AV-BG-00010", itemName: "Avocado Poly Bag 4ct", commodityCode: "AV", materialCategoryCode: "BG", subCategory: "Poly Bags", uom: "Bags", coo: "Ecuador" },
    { id: "BP-PL-00011", itemName: "Bell Pepper Pallet", commodityCode: "BP", materialCategoryCode: "PL", subCategory: "Wooden Pallets", uom: "Pallets", coo: "USA" },
    { id: "CG-ST-00012", itemName: "Grape Adhesive Sticker", commodityCode: "CG", materialCategoryCode: "ST", subCategory: "Adhesive Stickers", uom: "Rolls", coo: "N/A" },
    // Units stay consistent per material category (BX=Cases, BG=Bags, LB/ST=Rolls,
    // PL=Pallets) — packaging chains hang off the category and are only offered
    // for items whose unit matches the chain's baseUnit.
    { id: "AP-LB-00013", itemName: "Asparagus Brand Label", commodityCode: "AP", materialCategoryCode: "LB", subCategory: "Brand Labels", uom: "Rolls", coo: "USA" },
    { id: "BP-BG-00014", itemName: "Bell Pepper Mesh Bag 3lb", commodityCode: "BP", materialCategoryCode: "BG", subCategory: "Mesh Bags", uom: "Bags", coo: "Mexico" },
    { id: "CG-BG-00015", itemName: "Grape Poly Bag 2lb", commodityCode: "CG", materialCategoryCode: "BG", subCategory: "Poly Bags", uom: "Bags", coo: "Peru" },
    { id: "BR-PL-00016", itemName: "Berry Wooden Pallet", commodityCode: "BR", materialCategoryCode: "PL", subCategory: "Wooden Pallets", uom: "Pallets", coo: "USA" },
    { id: "AV-LB-00017", itemName: "Avocado PLU Sticker", commodityCode: "AV", materialCategoryCode: "LB", subCategory: "PLU Stickers", uom: "Rolls", coo: "Mexico" },
    { id: "AP-PL-00018", itemName: "Asparagus Pallet", commodityCode: "AP", materialCategoryCode: "PL", subCategory: "Wooden Pallets", uom: "Pallets", coo: "USA" },
    { id: "BR-BG-00019", itemName: "Berry Poly Bag 1lb", commodityCode: "BR", materialCategoryCode: "BG", subCategory: "Poly Bags", uom: "Bags", coo: "Mexico" },
    { id: "BP-ST-00020", itemName: "Bell Pepper Adhesive Sticker", commodityCode: "BP", materialCategoryCode: "ST", subCategory: "Adhesive Stickers", uom: "Rolls", coo: "N/A" },
  ]
  await prisma.item.createMany({
    data: itemDefs.map((it) => ({
      id: it.id,
      itemName: it.itemName,
      commodityCode: it.commodityCode,
      materialCategoryCode: it.materialCategoryCode,
      subCategoryId: subCats[it.subCategory],
      countryOfOriginId: cooByName[it.coo],
      // The item's own unit — the source of truth resolveItemUnits() reads.
      // Without it only items that happen to have a threshold get a unit.
      unitOfMeasure: it.uom,
      applicationMethod: "Machine/Hand",
      status: "Active",
      createdBy: adminId,
    })),
  })
  const uomByItem: Record<string, string> = Object.fromEntries(itemDefs.map((i) => [i.id, i.uom]))

  // ---- Grower ↔ Item authorizations -----------------------------------
  const authMap: Record<number, string[]> = {
    [agribar.id]: ["AP-BX-00001", "AP-BG-00002", "BP-BX-00003", "BP-LB-00004", "CG-BX-00005", "CG-PL-00006", "BR-BX-00007", "BR-LB-00008"],
    [brigo.id]: ["BP-BX-00003", "BP-LB-00004", "CG-BX-00005", "CG-PL-00006", "BR-BX-00007", "BR-LB-00008", "AV-BX-00009", "AV-BG-00010"],
    [pdg.id]: ["AP-BX-00001", "AP-BG-00002", "CG-BX-00005", "CG-PL-00006", "AV-BX-00009", "AV-BG-00010", "BP-PL-00011", "CG-ST-00012"],
    [verdeval.id]: ["AP-BX-00001", "BP-BX-00003", "BR-BX-00007", "AP-LB-00013", "BP-BG-00014", "CG-BG-00015", "BR-PL-00016", "AV-LB-00017"],
    [sunridge.id]: ["CG-BX-00005", "AV-BX-00009", "AP-LB-00013", "BP-BG-00014", "AP-PL-00018", "BR-BG-00019", "BP-ST-00020"],
  }
  await prisma.growerItemAuthorization.createMany({
    data: growers.flatMap((g) =>
      authMap[g.id].map((itemId) => ({ growerId: g.id, itemId, isActive: true, createdBy: adminId }))
    ),
  })

  // ---- Grower ↔ Location mappings --------------------------------------
  // Deliberately uneven: one single-site grower, two-site and three-site ones.
  // A grower with one location is the degenerate case the location picker has
  // to stay sane for, and the multi-site ones are what per-location inventory
  // actually exists to serve.
  const growerLocationMap: Record<number, number[]> = {
    [agribar.id]: [loc[0].id, loc[1].id],
    [brigo.id]: [loc[1].id],
    [pdg.id]: [loc[0].id, loc[1].id, loc[2].id],
    [verdeval.id]: [loc[2].id],
    [sunridge.id]: [loc[0].id, loc[3].id],
  }
  await prisma.growerLocation.createMany({
    data: growers.flatMap((g) =>
      growerLocationMap[g.id].map((locationId) => ({
        growerId: g.id,
        locationId,
        isActive: true,
        createdBy: adminId,
      }))
    ),
  })

  // ---- Item ↔ Vendor mappings -----------------------------------------
  const vendorItemMap: Record<number, string[]> = {
    [packRight.id]: ["AP-BX-00001", "AP-BG-00002", "BP-BX-00003", "CG-BX-00005", "BR-BX-00007", "AV-BX-00009", "AV-BG-00010"],
    [palletPool.id]: ["CG-PL-00006", "BP-PL-00011", "BR-PL-00016", "AP-PL-00018"],
    [labelWorks.id]: ["BP-LB-00004", "BR-LB-00008", "CG-ST-00012"],
    [boxCraft.id]: ["BP-BX-00003", "BR-BX-00007", "BP-BG-00014", "CG-BG-00015", "BR-BG-00019"],
    [stickerPro.id]: ["AP-LB-00013", "AV-LB-00017", "BP-ST-00020"],
  }
  await prisma.itemVendor.createMany({
    data: Object.entries(vendorItemMap).flatMap(([vendorId, items]) =>
      items.map((itemId) => ({ vendorId: Number(vendorId), itemId, isActive: true, createdBy: adminId }))
    ),
  })

  // ---- Vendor ↔ Material category mappings ----------------------------
  const vendorCategoryMap: Record<number, string[]> = {
    [packRight.id]: ["BX", "BG"], // boxes & bags
    [palletPool.id]: ["PL"], // pallets
    [labelWorks.id]: ["LB", "ST"], // labels & stickers
    [boxCraft.id]: ["BX", "BG"], // second source for boxes & bags
    [stickerPro.id]: ["LB", "ST"], // second source for labels & stickers
  }
  await prisma.vendorMaterialCategory.createMany({
    data: Object.entries(vendorCategoryMap).flatMap(([vendorId, codes]) =>
      codes.map((materialCategoryCode) => ({ vendorId: Number(vendorId), materialCategoryCode, isActive: true, createdBy: adminId }))
    ),
  })

  // ---- Vendor ↔ supply-to country mappings ----------------------------
  // Where each vendor can ship TO, as opposed to the single `countryId` saying
  // where they are based.
  const vendorSupplyMap: Record<number, string[]> = {
    [packRight.id]: ["USA", "Canada"],
    [palletPool.id]: ["USA"],
    [labelWorks.id]: ["USA", "Canada", "Mexico"],
    [boxCraft.id]: ["USA", "Mexico"],
    [stickerPro.id]: ["Mexico", "USA", "Peru"],
  }
  await prisma.vendorCountry.createMany({
    data: Object.entries(vendorSupplyMap).flatMap(([vendorId, names]) =>
      names.map((name) => ({
        vendorId: Number(vendorId),
        countryId: cooByName[name],
        isActive: true,
        createdBy: adminId,
      }))
    ),
  })

  // ---- Thresholds (some global, one per-grower override) --------------
  console.log("Seeding thresholds, schedulers, packaging…")
  const thresholdDefs = [
    { itemId: "AP-BX-00001", growerId: null, qty: 50 },
    { itemId: "BP-BX-00003", growerId: null, qty: 40 },
    { itemId: "CG-BX-00005", growerId: null, qty: 60 },
    { itemId: "BR-BX-00007", growerId: null, qty: 30 },
    { itemId: "AV-BX-00009", growerId: null, qty: 35 },
    { itemId: "BP-BG-00014", growerId: null, qty: 120 },
    { itemId: "CG-BG-00015", growerId: null, qty: 100 },
    { itemId: "AP-LB-00013", growerId: null, qty: 25 },
    { itemId: "AV-LB-00017", growerId: null, qty: 20 },
    { itemId: "BR-BG-00019", growerId: null, qty: 90 },
    { itemId: "AP-BX-00001", growerId: agribar.id, qty: 80 }, // per-grower override
    { itemId: "BP-BG-00014", growerId: verdeval.id, qty: 160 }, // per-grower override
  ]
  await prisma.itemThreshold.createMany({
    data: thresholdDefs.map((t) => ({
      itemId: t.itemId,
      growerId: t.growerId,
      thresholdQuantity: new Prisma.Decimal(t.qty),
      unitOfMeasure: uomByItem[t.itemId],
      createdBy: adminId,
    })),
  })

  // ---- Scheduler settings (global + one per-grower) -------------------
  await prisma.schedulerSetting.createMany({
    data: [
      { scope: "Global", cadenceType: "AfterNDays", thresholdDays: 3, isEnabled: true, createdBy: adminId },
      { scope: "Grower", growerId: pdg.id, cadenceType: "Weekly", thresholdDays: 7, isEnabled: true, createdBy: adminId },
    ],
  })

  // ---- Packaging chains (structure only — no numbers) -----------------
  // Scoped to a material category; `baseUnit` must match the unit of the items
  // in it, which is what makes a chain pickable for a given item.
  const chainDefs = [
    { materialCategoryCode: "BG", name: "Bags → Boxes → Cases", baseUnit: "Bags", levels: ["Boxes", "Cases"] },
    { materialCategoryCode: "BX", name: "Cases → Pallets", baseUnit: "Cases", levels: ["Pallets"] },
    { materialCategoryCode: "LB", name: "Rolls → Cartons", baseUnit: "Rolls", levels: ["Cartons"] },
    { materialCategoryCode: "ST", name: "Rolls → Cartons", baseUnit: "Rolls", levels: ["Cartons"] },
    // Nothing for PL: pallets ship as-is, so those mappings stay chainless and
    // demo the "no packaging configured" path.
  ]
  await prisma.packagingChain.createMany({
    data: chainDefs.map((c) => ({
      materialCategoryCode: c.materialCategoryCode,
      name: c.name,
      baseUnit: c.baseUnit,
      isActive: true,
      createdBy: adminId,
    })),
  })
  const chains = await prisma.packagingChain.findMany({
    select: { id: true, materialCategoryCode: true, baseUnit: true },
  })
  const chainByCategory: Record<string, number> = Object.fromEntries(
    chains.map((c) => [c.materialCategoryCode, c.id])
  )
  await prisma.packagingChainLevel.createMany({
    data: chainDefs.flatMap((c) =>
      c.levels.map((unitName, i) => ({
        chainId: chainByCategory[c.materialCategoryCode],
        level: i + 1,
        unitName,
      }))
    ),
  })

  // ---- Per-vendor pack ratios + shipping level ------------------------
  // shipsInLevel: 0 = partials allowed (delivered == ordered), 1 = whole first
  // level, 2 = whole second level. Seeded across all three so the demo shows
  // each behaviour.
  const packSetup: Record<string, { ratios: number[]; shipsInLevel: number }> = {
    // vendorId:itemId -> ratios indexed by level-1
    [`${packRight.id}:AP-BG-00002`]: { ratios: [10, 5], shipsInLevel: 1 }, // whole boxes
    [`${packRight.id}:AV-BG-00010`]: { ratios: [20, 4], shipsInLevel: 2 }, // whole cases
    [`${packRight.id}:AP-BX-00001`]: { ratios: [60], shipsInLevel: 0 }, // partials fine
    [`${packRight.id}:BP-BX-00003`]: { ratios: [60], shipsInLevel: 0 },
    [`${packRight.id}:CG-BX-00005`]: { ratios: [48], shipsInLevel: 1 },
    [`${packRight.id}:BR-BX-00007`]: { ratios: [60], shipsInLevel: 0 },
    [`${packRight.id}:AV-BX-00009`]: { ratios: [50], shipsInLevel: 1 },
    [`${labelWorks.id}:BP-LB-00004`]: { ratios: [12], shipsInLevel: 1 },
    [`${labelWorks.id}:BR-LB-00008`]: { ratios: [12], shipsInLevel: 1 },
    [`${labelWorks.id}:CG-ST-00012`]: { ratios: [24], shipsInLevel: 1 },
    // BoxCraft is a second source for items PackRight also supplies, packed
    // differently — the same SKU ordered from either vendor resolves to a
    // different number of containers, which is the whole point of the feature.
    [`${boxCraft.id}:BP-BX-00003`]: { ratios: [40], shipsInLevel: 1 },
    [`${boxCraft.id}:BR-BX-00007`]: { ratios: [75], shipsInLevel: 0 },
    [`${boxCraft.id}:BP-BG-00014`]: { ratios: [25, 4], shipsInLevel: 1 },
    [`${boxCraft.id}:CG-BG-00015`]: { ratios: [12, 6], shipsInLevel: 2 },
    [`${boxCraft.id}:BR-BG-00019`]: { ratios: [15, 8], shipsInLevel: 1 },
    [`${stickerPro.id}:AP-LB-00013`]: { ratios: [18], shipsInLevel: 1 },
    [`${stickerPro.id}:AV-LB-00017`]: { ratios: [30], shipsInLevel: 0 },
    [`${stickerPro.id}:BP-ST-00020`]: { ratios: [20], shipsInLevel: 1 },
  }
  const itemVendorRows = await prisma.itemVendor.findMany({
    select: { id: true, vendorId: true, itemId: true, item: { select: { materialCategoryCode: true } } },
  })
  const packRatioRows: Prisma.VendorPackRatioCreateManyInput[] = []
  for (const iv of itemVendorRows) {
    const setup = packSetup[`${iv.vendorId}:${iv.itemId}`]
    const chainId = iv.item.materialCategoryCode ? chainByCategory[iv.item.materialCategoryCode] : undefined
    if (!setup || chainId == null) continue
    await prisma.itemVendor.update({
      where: { id: iv.id },
      data: { packagingChainId: chainId, shipsInLevel: setup.shipsInLevel },
    })
    setup.ratios.forEach((perParent, i) =>
      packRatioRows.push({ itemVendorId: iv.id, level: i + 1, perParent, createdBy: adminId })
    )
  }
  await prisma.vendorPackRatio.createMany({ data: packRatioRows })

  // ---- Historical grower submissions ----------------------------------
  // A full quarter of daily counts. Cadence differs per grower, which is what
  // makes the reminder scheduler demoable: Sunridge only counts on Mondays, so
  // its last submission is always several days old.
  console.log(`Seeding ${QUARTER_DAYS} days of grower submissions + ledger…`)

  // Which weekdays each grower counts on (0 = Sunday … 6 = Saturday).
  const cadenceByGrower: Record<number, number[]> = {
    [agribar.id]: [1, 2, 3, 4, 5], // weekdays
    [brigo.id]: [1, 3, 5], // Mon / Wed / Fri
    [pdg.id]: [2, 4], // Tue / Thu
    [verdeval.id]: [1, 2, 3, 4, 5, 6], // Mon–Sat
    [sunridge.id]: [1], // Mondays only
  }

  // Base quantity per item, kept coherent across the whole history.
  const baseQty: Record<string, number> = {}
  itemDefs.forEach((it, i) => (baseQty[it.id] = 60 + ((i * 17) % 90)))

  /**
   * On-hand for one item on one day: a slow quarter-long drift, a gentle weekly
   * cycle, and a little deterministic noise. Deliberately smooth — flat random
   * noise reads as obviously synthetic once it is charted across a quarter.
   */
  function quantityFor(itemId: string, dayOffset: number, seed: number): number {
    const base = baseQty[itemId]
    const progress = 1 - dayOffset / QUARTER_DAYS // 0 = oldest, 1 = today
    const drift = 1 + 0.22 * (progress - 0.5) // ±11% across the quarter
    const weekly = 1 + 0.08 * Math.sin((2 * Math.PI * dayOffset) / 7)
    const noise = 1 + (rng(seed) - 0.5) * 0.07
    return Math.max(0, Math.round(base * drift * weekly * noise))
  }

  // Each of a grower's items is counted at exactly one of their locations,
  // assigned round-robin. Counting every item at every site would multiply the
  // seeded quantities by the site count and make the dashboard totals lie.
  const locationForItem = (growerId: number, itemIndex: number): number => {
    const locs = growerLocationMap[growerId]
    return locs[itemIndex % locs.length]
  }

  // At this volume the submissions themselves have to be batched too — five
  // growers over a quarter, now one row per location per day, is ~450 rows, and
  // one round trip each was fine at 13 but is not here. They are read back by
  // (growerId, locationId, submissionDate), which is unique because daysAgo()
  // pins every date to noon and nobody counts a site twice a day.
  const submissionRows: Prisma.GrowerSubmissionCreateManyInput[] = []
  const submissionPlan: { growerId: number; locationId: number; date: Date; dayOffset: number }[] = []
  for (const g of growers) {
    const weekdays = cadenceByGrower[g.id] ?? [1, 3, 5]
    for (let d = QUARTER_DAYS; d >= 1; d--) {
      const date = daysAgo(d)
      if (!weekdays.includes(date.getDay())) continue
      for (const locationId of growerLocationMap[g.id]) {
        submissionRows.push({
          growerId: g.id,
          locationId,
          submittedBy: growerUserByGrower[g.id],
          submissionDate: date,
          status: "Approved",
          createdBy: growerUserByGrower[g.id],
          createdAt: date,
        })
        submissionPlan.push({ growerId: g.id, locationId, date, dayOffset: d })
      }
    }
  }
  await createManyChunked(prisma.growerSubmission, submissionRows)
  const submissionIdByKey = new Map(
    (
      await prisma.growerSubmission.findMany({
        select: { id: true, growerId: true, locationId: true, submissionDate: true },
      })
    ).map((s) => [`${s.growerId}:${s.locationId}:${s.submissionDate.getTime()}`, s.id])
  )

  const growerDetailRows: Prisma.GrowerSubmissionDetailCreateManyInput[] = []
  const ledgerRows: Prisma.InventoryLedgerCreateManyInput[] = []
  for (const plan of submissionPlan) {
    const submissionId = submissionIdByKey.get(
      `${plan.growerId}:${plan.locationId}:${plan.date.getTime()}`
    )
    if (submissionId == null) continue
    const itemIds = authMap[plan.growerId]
    for (let ii = 0; ii < itemIds.length; ii++) {
      const itemId = itemIds[ii]
      const locationId = locationForItem(plan.growerId, ii)
      // This submission only covers its own location's items.
      if (locationId !== plan.locationId) continue
      const onHand = quantityFor(itemId, plan.dayOffset, plan.growerId * 1000 + ii * 37 + plan.dayOffset)
      growerDetailRows.push({
        submissionId,
        itemId,
        locationId,
        quantityOnHand: new Prisma.Decimal(onHand),
        unitOfMeasure: uomByItem[itemId],
        createdAt: plan.date,
      })
      ledgerRows.push({
        submissionId,
        date: plan.date,
        growerId: plan.growerId,
        itemId,
        locationId,
        transactionType: "Daily Count Update",
        finalQuantity: new Prisma.Decimal(onHand),
        createdAt: plan.date,
      })
    }
  }
  await createManyChunked(prisma.growerSubmissionDetail, growerDetailRows)
  await createManyChunked(prisma.inventoryLedger, ledgerRows)

  // ---- Grower orders --------------------------------------------------
  // Orders are raised per item against one of the item's mapped vendors, and
  // tracked independently of the daily on-hand count.
  console.log("Seeding grower orders…")
  const itemToVendors: Record<string, number[]> = {}
  for (const [vendorId, items] of Object.entries(vendorItemMap)) {
    for (const itemId of items) (itemToVendors[itemId] ??= []).push(Number(vendorId))
  }
  const now = new Date()

  // Resolve an order through the vendor's packaging exactly as the app does, so
  // the seeded expectedQuantity and pack lines match what the UI would compute.
  const itemDefById = Object.fromEntries(itemDefs.map((i) => [i.id, i]))
  const chainLevelsByCategory: Record<string, string[]> = Object.fromEntries(
    chainDefs.map((c) => [c.materialCategoryCode, c.levels])
  )
  function packFor(vendorId: number, itemId: string, quantity: number) {
    const setup = packSetup[`${vendorId}:${itemId}`]
    const levelNames = chainLevelsByCategory[itemDefById[itemId]?.materialCategoryCode ?? ""]
    return resolvePack({
      requested: quantity,
      baseUnit: uomByItem[itemId] ?? "units",
      levels: setup && levelNames ? levelNames.map((unitName, i) => ({ level: i + 1, unitName })) : [],
      ratios: setup ? setup.ratios.map((perParent, i) => ({ level: i + 1, perParent })) : [],
      shipsInLevel: setup?.shipsInLevel ?? 0,
    })
  }

  // One order per (grower, item, day) — that triple is the read-back key below,
  // so the generator must never emit two on the same day for the same pair.
  const orderPlan: {
    growerId: number
    itemId: string
    vendorId: number
    quantity: number
    orderDate: Date
    status: string
    closedAt: Date | null
    received: boolean
  }[] = []

  for (const g of growers) {
    const orderable = authMap[g.id].filter((id) => itemToVendors[id]?.length)
    if (!orderable.length) continue
    // Roughly one order a week through the quarter, rotating across items and
    // across each item's mapped vendors.
    let n = 0
    for (let d = QUARTER_DAYS - 3; d >= 1; d -= 7) {
      const itemId = orderable[n % orderable.length]
      const vendors = itemToVendors[itemId]
      const vendorId = vendors[n % vendors.length]
      const quantity = 20 + Math.round(rng(g.id * 31 + n) * 120)
      // Anything ordered more than a fortnight ago has long since arrived.
      const closed = d > 14
      orderPlan.push({
        growerId: g.id,
        itemId,
        vendorId,
        quantity,
        orderDate: daysAgo(d),
        status: closed ? "Received" : "Open",
        closedAt: closed ? daysAgo(d - 4) : null,
        received: closed,
      })
      n++
    }
  }

  // Agribar: a received + a cancelled order closed TODAY (still visible today),
  // plus one received YESTERDAY (should have dropped off the active list).
  const agriOrderable = authMap[agribar.id].filter((id) => itemToVendors[id]?.length)
  if (agriOrderable.length >= 2) {
    const [a0, a1] = agriOrderable
    orderPlan.push(
      { growerId: agribar.id, itemId: a0, vendorId: itemToVendors[a0][0], quantity: 25, orderDate: daysAgo(3), status: "Received", closedAt: now, received: true },
      { growerId: agribar.id, itemId: a1, vendorId: itemToVendors[a1][0], quantity: 15, orderDate: daysAgo(2), status: "Cancelled", closedAt: now, received: false },
      { growerId: agribar.id, itemId: a0, vendorId: itemToVendors[a0][0], quantity: 30, orderDate: daysAgo(5), status: "Received", closedAt: daysAgo(1), received: true }
    )
  }

  await createManyChunked(
    prisma.order,
    orderPlan.map((o) => {
      const pack = packFor(o.vendorId, o.itemId, o.quantity)
      return {
        growerId: o.growerId,
        itemId: o.itemId,
        vendorId: o.vendorId,
        quantity: new Prisma.Decimal(o.quantity),
        unitOfMeasure: uomByItem[o.itemId],
        expectedQuantity: new Prisma.Decimal(pack.deliveredQuantity),
        // Receipts match what the pack maths predicted — no discrepancies are
        // seeded, so the vendor-scorecard views start clean. Edit a receipt in
        // the UI to see the mismatch path.
        receivedQuantity: o.received ? new Prisma.Decimal(pack.deliveredQuantity) : null,
        status: o.status,
        orderDate: o.orderDate,
        expectedDeliveryDate: o.closedAt ?? daysAgo(-4),
        closedAt: o.closedAt,
        createdBy: growerUserByGrower[o.growerId],
        createdAt: o.orderDate,
      } satisfies Prisma.OrderCreateManyInput
    })
  )

  // Pack lines hang off the order id, so the orders are read back once and
  // matched on (growerId, itemId, orderDate) — unique by construction above.
  const orderIdByKey = new Map(
    (
      await prisma.order.findMany({ select: { id: true, growerId: true, itemId: true, orderDate: true } })
    ).map((o) => [`${o.growerId}:${o.itemId}:${o.orderDate.getTime()}`, o.id])
  )
  const packLineRows: Prisma.OrderPackLineCreateManyInput[] = []
  for (const o of orderPlan) {
    const orderId = orderIdByKey.get(`${o.growerId}:${o.itemId}:${o.orderDate.getTime()}`)
    if (orderId == null) continue
    const pack = packFor(o.vendorId, o.itemId, o.quantity)
    // A single base-unit line means no packaging is configured — nothing to snapshot.
    if (pack.lines.length < 2) continue
    for (const l of pack.lines)
      packLineRows.push({
        orderId,
        level: l.level,
        unitName: l.unitName,
        quantity: new Prisma.Decimal(l.quantity),
      })
  }
  await createManyChunked(prisma.orderPackLine, packLineRows)

  // ---- Historical vendor submissions + allocations --------------------
  console.log("Seeding vendor submissions + allocations…")
  // Weekly supply reports across the same quarter.
  const vendorSubmitDays = Array.from(
    { length: Math.floor(QUARTER_DAYS / 7) },
    (_, i) => QUARTER_DAYS - 2 - i * 7
  ).filter((d) => d >= 1)
  const vendors = vendorRows
  // Allocations hang off the *detail* id, so unlike the grower loop above the
  // details have to be read back after their bulk insert. (submissionId, itemId)
  // is unique within a submission here, which makes a safe key to match them on.
  const vendorDetailPlan: { submissionId: number; itemId: string; qty: number; date: Date }[] = []

  // Same pattern as the grower side: submissions in one bulk insert, then read
  // back by (vendorId, submissionDate) — unique, since a vendor reports once a day.
  const vendorSubmissionRows: Prisma.VendorSubmissionCreateManyInput[] = []
  for (const v of vendors) {
    for (const d of vendorSubmitDays) {
      const date = daysAgo(d)
      vendorSubmissionRows.push({
        vendorId: v.id,
        submittedBy: vendorUserByVendor[v.id],
        submissionDate: date,
        status: "Approved",
        createdBy: vendorUserByVendor[v.id],
        createdAt: date,
      })
    }
  }
  await createManyChunked(prisma.vendorSubmission, vendorSubmissionRows)
  const vendorSubmissionIdByKey = new Map(
    (
      await prisma.vendorSubmission.findMany({
        select: { id: true, vendorId: true, submissionDate: true },
      })
    ).map((s) => [`${s.vendorId}:${s.submissionDate.getTime()}`, s.id])
  )

  for (const v of vendors) {
    const items = vendorItemMap[v.id] ?? []
    for (let di = 0; di < vendorSubmitDays.length; di++) {
      const date = daysAgo(vendorSubmitDays[di])
      const submissionId = vendorSubmissionIdByKey.get(`${v.id}:${date.getTime()}`)
      if (submissionId == null) continue
      for (let ii = 0; ii < items.length; ii++) {
        const itemId = items[ii]
        // Same smooth shape as the grower counts: slow drift plus a little noise.
        const dayOffset = vendorSubmitDays[di]
        const progress = 1 - dayOffset / QUARTER_DAYS
        const qty = Math.round(
          (220 + ((ii * 37) % 160)) * (1 + 0.2 * (progress - 0.5)) * (1 + (rng(v.id * 7 + ii * 3 + di) - 0.5) * 0.08)
        )
        vendorDetailPlan.push({ submissionId, itemId, qty, date })
      }
    }
  }
  await createManyChunked(
    prisma.vendorSubmissionDetail,
    vendorDetailPlan.map((d) => ({
      submissionId: d.submissionId,
      itemId: d.itemId,
      quantity: new Prisma.Decimal(d.qty),
      unitOfMeasure: uomByItem[d.itemId],
      createdAt: d.date,
    }))
  )
  const detailIdByKey = new Map(
    (await prisma.vendorSubmissionDetail.findMany({ select: { id: true, submissionId: true, itemId: true } })).map(
      (d) => [`${d.submissionId}:${d.itemId}`, d.id]
    )
  )

  // allocate to growers authorized for this item
  const allocationRows: Prisma.VendorAllocationCreateManyInput[] = []
  for (const d of vendorDetailPlan) {
    const detailId = detailIdByKey.get(`${d.submissionId}:${d.itemId}`)
    const eligibleGrowers = growers.filter((g) => authMap[g.id].includes(d.itemId))
    if (detailId == null || eligibleGrowers.length === 0) continue
    const per = Math.floor(d.qty / eligibleGrowers.length)
    for (let gi = 0; gi < eligibleGrowers.length; gi++) {
      const amount = gi === eligibleGrowers.length - 1 ? d.qty - per * (eligibleGrowers.length - 1) : per
      allocationRows.push({
        vendorSubmissionDetailId: detailId,
        growerId: eligibleGrowers[gi].id,
        quantity: new Prisma.Decimal(amount),
        createdAt: d.date,
      })
    }
  }
  await createManyChunked(prisma.vendorAllocation, allocationRows)

  // ---- Low inventory flags + missing item requests --------------------
  console.log("Seeding flags, requests, audit logs, notifications, reports…")
  await prisma.lowInventoryFlag.createMany({
    data: [
      {
        growerId: agribar.id,
        itemId: "BR-BX-00007",
        flaggedBy: jamesUserId,
        reason: "Running low ahead of weekend harvest",
        isActive: true,
        createdBy: jamesUserId,
      },
      {
        growerId: brigo.id,
        itemId: "CG-BX-00005",
        flaggedBy: diagoUserId,
        reason: "Unexpected demand spike",
        isActive: true,
        createdBy: diagoUserId,
      },
    ],
  })

  await prisma.missingItemRequest.createMany({
    data: [
      {
        growerId: agribar.id,
        requestedBy: jamesUserId,
        itemName: "Asparagus Banding Rubber 9in",
        commodityHint: "Asparagus",
        categoryHint: "Bands",
        notes: "Need for bunching line, not in my list",
        status: "Open",
        createdBy: jamesUserId,
      },
      {
        growerId: pdg.id,
        requestedBy: priyaUserId,
        itemName: "Avocado Tissue Wrap",
        commodityHint: "Avocado",
        categoryHint: "Wrap",
        notes: "Protective wrap for export",
        status: "Reviewed",
        reviewedBy: adminId,
        reviewedAt: daysAgo(1),
        reviewNotes: "Sourcing with vendor",
        createdBy: priyaUserId,
      },
    ],
  })

  // ---- Global item messages (grower-facing notices) -------------------
  // Two all-growers notices: one on a retiring item, one critical.
  await prisma.itemMessage.createMany({
    data: [
      {
        itemId: "CG-ST-00012",
        type: "Retiring",
        severity: "warning",
        audience: "All",
        body: "Being phased out — please run down remaining stock.",
        createdBy: adminId,
        updatedBy: adminId,
      },
      {
        itemId: "AV-BG-00010",
        type: "ClearInventory",
        severity: "critical",
        audience: "All",
        body: "Material out of manufacturing — clear inventory soon.",
        createdBy: adminId,
        updatedBy: adminId,
      },
    ],
  })
  // Spanish notes. Hand-written here rather than machine-translated so the demo
  // works with no translator credentials — one is marked reviewed and one left
  // as machine output, to show both states in the admin list.
  const seededMessages = await prisma.itemMessage.findMany({
    select: { id: true, itemId: true },
  })
  const messageIdByItem = new Map(seededMessages.map((m) => [m.itemId, m.id]))
  await prisma.itemMessageTranslation.createMany({
    data: [
      {
        itemMessageId: messageIdByItem.get("CG-ST-00012")!,
        locale: "es",
        body: "En proceso de retirada — por favor agote las existencias restantes.",
        isMachine: false, // reviewed
        createdBy: adminId,
        updatedBy: adminId,
      },
      {
        itemMessageId: messageIdByItem.get("AV-BG-00010")!,
        locale: "es",
        body: "Material fuera de fabricación — vacíe el inventario pronto.",
        isMachine: true, // still flagged as unreviewed machine output
        createdBy: adminId,
        updatedBy: adminId,
      },
    ],
  })
  // Selected-growers notice (only Brigo, a Spanish-preference grower — the type
  // label renders localized in their view). Created singly because its id is the
  // FK for the ItemMessageGrower target row below.
  const increaseStock = await prisma.itemMessage.create({
    data: {
      itemId: "CG-BX-00005",
      type: "IncreaseStock",
      severity: "info",
      audience: "Selected",
      body: "Seasonal demand high — increase stock for the coming weeks.",
      createdBy: adminId,
      updatedBy: adminId,
    },
  })
  await prisma.itemMessageGrower.create({
    data: { itemMessageId: increaseStock.id, growerId: brigo.id },
  })
  // Brigo is the Spanish-preference grower, so this is the one that most visibly
  // demonstrates the localized note.
  await prisma.itemMessageTranslation.create({
    data: {
      itemMessageId: increaseStock.id,
      locale: "es",
      body: "Demanda estacional alta — aumente las existencias para las próximas semanas.",
      isMachine: false,
      createdBy: adminId,
      updatedBy: adminId,
    },
  })

  // ---- Audit logs (sample of internal CRUD) ---------------------------
  const auditSamples = [
    { action: AUDIT_ACTIONS.CREATE, entityType: "Item", entityId: "AP-BX-00001", changes: '{"itemName":"Asparagus Cardboard Box 11lb"}' },
    { action: AUDIT_ACTIONS.CREATE, entityType: "Grower", entityId: String(agribar.id), changes: '{"growerName":"Agribar"}' },
    { action: AUDIT_ACTIONS.UPDATE, entityType: "Vendor", entityId: String(packRight.id), changes: '{"status":["Pending","Active"]}' },
    { action: AUDIT_ACTIONS.CREATE, entityType: "User", entityId: String(jamesUserId), changes: '{"email":"james@agribar.local"}' },
  ]
  await prisma.auditLog.createMany({
    data: auditSamples.map((a, i) => ({ userId: adminId, ...a, createdAt: daysAgo(8 - i) })),
  })

  // ---- Notification log (mocked emails) -------------------------------
  await prisma.notificationLog.createMany({
    data: [
      {
        type: NOTIFICATION_TYPES.SUBMISSION_RECEIVED,
        toEmail: "ops@agribar.example",
        growerId: agribar.id,
        subject: "Inventory submission received — Agribar",
        body: "Thanks James, your daily count was recorded.",
        status: "Mocked",
        relatedEntity: "GrowerSubmission",
        createdAt: daysAgo(1),
        sentAt: daysAgo(1),
      },
      {
        type: NOTIFICATION_TYPES.SCHEDULED_REMINDER,
        toEmail: "ops@brigo.example",
        growerId: brigo.id,
        subject: "Reminder: please submit your inventory count",
        body: "Brigo has not submitted in 4 days. Please update your inventory.",
        status: "Mocked",
        relatedEntity: "SchedulerSetting",
        createdAt: daysAgo(1),
        sentAt: daysAgo(1),
      },
    ],
  })

  // ---- Power BI placeholder reports -----------------------------------
  await prisma.powerBiReport.createMany({
    data: [
      { name: "Inventory Overview", embedUrl: "https://app.powerbi.com/view?r=DEMO_OVERVIEW", roleScope: "Admin", createdBy: adminId },
      { name: "Grower Submission Trends", embedUrl: "https://app.powerbi.com/view?r=DEMO_TRENDS", roleScope: "Admin", createdBy: adminId },
    ],
  })

  console.log("✅ Seed complete.")
  console.log("   Demo logins (user picker): admin@demo.local, editor@demo.local,")
  console.log("   james@agribar.local, diago@brigo.local, priya@pdg.local,")
  console.log("   sam@packright.local, lena@palletpool.local, omar@labelworks.local")
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
