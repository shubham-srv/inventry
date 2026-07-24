import { PrismaClient, Prisma } from "@prisma/client"
import {
  ROLES,
  NOTIFICATION_TYPES,
  AUDIT_ACTIONS,
  COUNTRIES_OF_ORIGIN,
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

async function clearAll() {
  // delete in FK-safe order
  await prisma.notificationLog.deleteMany()
  await prisma.auditLog.deleteMany()
  await prisma.vendorAllocation.deleteMany()
  await prisma.vendorSubmissionDetail.deleteMany()
  await prisma.vendorSubmission.deleteMany()
  await prisma.order.deleteMany()
  await prisma.inventoryLedger.deleteMany()
  await prisma.growerSubmissionDetail.deleteMany()
  await prisma.growerSubmission.deleteMany()
  await prisma.lowInventoryFlag.deleteMany()
  await prisma.missingItemRequest.deleteMany()
  await prisma.itemThreshold.deleteMany()
  await prisma.unitConversion.deleteMany()
  await prisma.schedulerSetting.deleteMany()
  await prisma.vendorMaterialCategory.deleteMany()
  await prisma.itemVendor.deleteMany()
  await prisma.growerItemAuthorization.deleteMany()
  await prisma.item.deleteMany()
  await prisma.countryOfOrigin.deleteMany()
  await prisma.subCategory.deleteMany()
  await prisma.materialCategory.deleteMany()
  await prisma.commodity.deleteMany()
  await prisma.powerBiReport.deleteMany()
  await prisma.user.deleteMany()
  await prisma.role.deleteMany()
  await prisma.location.deleteMany()
  await prisma.vendor.deleteMany()
  await prisma.grower.deleteMany()
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
  console.log("Seeding roles…")
  const roleDefs = [
    { roleName: ROLES.SUPER_ADMIN, description: "Full access incl. settings" },
    { roleName: ROLES.INTERNAL_ADMIN, description: "Admin incl. onboarding & settings" },
    { roleName: ROLES.EDITOR, description: "Master data, no onboarding/settings" },
    { roleName: ROLES.GROWER_USER, description: "On-field grower inventory user" },
    { roleName: ROLES.VENDOR_USER, description: "Vendor supply reporting user" },
  ]
  const roles: Record<string, number> = {}
  for (const r of roleDefs) {
    const created = await prisma.role.create({ data: r })
    roles[r.roleName] = created.id
  }

  // ---- Growers --------------------------------------------------------
  console.log("Seeding growers & vendors…")
  const agribar = await prisma.grower.create({
    data: { growerName: "Agribar", primaryEmail: "ops@agribar.example", status: "Active" },
  })
  const brigo = await prisma.grower.create({
    // Spanish-preference grower — demoes bilingual emails out of the box.
    data: { growerName: "Brigo", primaryEmail: "ops@brigo.example", status: "Active", preferredLocale: "es" },
  })
  const pdg = await prisma.grower.create({
    data: { growerName: "PDG", primaryEmail: "ops@pdg.example", status: "Active" },
  })
  const growers = [agribar, brigo, pdg]

  // ---- Vendors --------------------------------------------------------
  const packRight = await prisma.vendor.create({
    data: {
      vendorName: "PackRight Manufacturing",
      vendorType: "Manufacturer",
      region: "West",
      country: "USA",
      primaryContact: "Sam Carter",
      contactEmail: "sam@packright.example",
      contactPhone: "+1-555-0101",
      leadTime: "5 days",
      paymentTerms: "Net 30",
      status: "Active",
    },
  })
  const palletPool = await prisma.vendor.create({
    data: {
      vendorName: "PalletPool Co",
      vendorType: "Pallet Pooling",
      region: "Central",
      country: "USA",
      primaryContact: "Lena Ortiz",
      contactEmail: "lena@palletpool.example",
      leadTime: "3 days",
      paymentTerms: "Net 15",
      status: "Active",
      preferredLocale: "es", // Spanish-preference vendor
    },
  })
  const labelWorks = await prisma.vendor.create({
    data: {
      vendorName: "LabelWorks 3PL",
      vendorType: "3PL",
      region: "East",
      country: "USA",
      primaryContact: "Omar Reed",
      contactEmail: "omar@labelworks.example",
      leadTime: "7 days",
      paymentTerms: "Net 45",
      status: "Active",
    },
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

  await prisma.user.create({
    data: {
      firstName: "Eddie",
      lastName: "Editor",
      email: "editor@demo.local",
      roleId: roles[ROLES.EDITOR],
      createdBy: adminId,
    },
  })

  const growerUserDefs = [
    { firstName: "James", lastName: "Field", email: "james@agribar.local", growerId: agribar.id },
    { firstName: "Maria", lastName: "Lopez", email: "maria@agribar.local", growerId: agribar.id },
    { firstName: "Diago", lastName: "Santos", email: "diago@brigo.local", growerId: brigo.id, preferredLocale: "es" },
    { firstName: "Priya", lastName: "Nair", email: "priya@pdg.local", growerId: pdg.id },
  ]
  for (const u of growerUserDefs) {
    await prisma.user.create({
      data: { ...u, roleId: roles[ROLES.GROWER_USER], createdBy: adminId },
    })
  }

  const vendorUserDefs = [
    { firstName: "Sam", lastName: "Carter", email: "sam@packright.local", vendorId: packRight.id },
    { firstName: "Lena", lastName: "Ortiz", email: "lena@palletpool.local", vendorId: palletPool.id, preferredLocale: "es" },
    { firstName: "Omar", lastName: "Reed", email: "omar@labelworks.local", vendorId: labelWorks.id },
  ]
  for (const u of vendorUserDefs) {
    await prisma.user.create({
      data: { ...u, roleId: roles[ROLES.VENDOR_USER], createdBy: adminId },
    })
  }
  const jamesUser = await prisma.user.findUniqueOrThrow({ where: { email: "james@agribar.local" } })
  const diagoUser = await prisma.user.findUniqueOrThrow({ where: { email: "diago@brigo.local" } })
  const priyaUser = await prisma.user.findUniqueOrThrow({ where: { email: "priya@pdg.local" } })
  const growerUserByGrower: Record<number, number> = {
    [agribar.id]: jamesUser.id,
    [brigo.id]: diagoUser.id,
    [pdg.id]: priyaUser.id,
  }
  const samUser = await prisma.user.findUniqueOrThrow({ where: { email: "sam@packright.local" } })
  const lenaUser = await prisma.user.findUniqueOrThrow({ where: { email: "lena@palletpool.local" } })
  const omarUser = await prisma.user.findUniqueOrThrow({ where: { email: "omar@labelworks.local" } })
  const vendorUserByVendor: Record<number, number> = {
    [packRight.id]: samUser.id,
    [palletPool.id]: lenaUser.id,
    [labelWorks.id]: omarUser.id,
  }

  // ---- Locations ------------------------------------------------------
  console.log("Seeding locations…")
  const loc = await Promise.all(
    [
      { locationName: "Salinas Packing House", locationType: "Packing House", region: "West", commodityFocus: "Asparagus" },
      { locationName: "Central Warehouse", locationType: "Warehouse", region: "Central", commodityFocus: "Mixed" },
      { locationName: "East Cross-dock", locationType: "Cross-dock", region: "East", commodityFocus: "Berries" },
    ].map((l) => prisma.location.create({ data: { ...l, createdBy: adminId } }))
  )

  // ---- Commodities / Categories / Sub-categories ----------------------
  console.log("Seeding commodities, categories, items…")
  const commodities = [
    { code: "AP", name: "Asparagus" },
    { code: "BP", name: "Bell Peppers" },
    { code: "CG", name: "Table Grapes" },
    { code: "BR", name: "Berries" },
    { code: "AV", name: "Avocado" },
  ]
  for (const c of commodities) await prisma.commodity.create({ data: { ...c, createdBy: adminId } })

  const materialCategories = [
    { code: "BX", name: "Boxes" },
    { code: "BG", name: "Bags" },
    { code: "LB", name: "Labels" },
    { code: "PL", name: "Pallets" },
    { code: "ST", name: "Stickers" },
  ]
  for (const m of materialCategories) await prisma.materialCategory.create({ data: { ...m, createdBy: adminId } })

  // ---- Countries of origin (lookup) -----------------------------------
  const cooByName: Record<string, number> = {}
  for (const name of COUNTRIES_OF_ORIGIN) {
    const created = await prisma.countryOfOrigin.create({ data: { name, createdBy: adminId } })
    cooByName[name] = created.id
  }

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
  const subCats: Record<string, number> = {}
  for (const s of subCatDefs) {
    const created = await prisma.subCategory.create({ data: { ...s, createdBy: adminId } })
    subCats[s.name] = created.id
  }

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
  ]
  for (const it of itemDefs) {
    await prisma.item.create({
      data: {
        id: it.id,
        itemName: it.itemName,
        commodityCode: it.commodityCode,
        materialCategoryCode: it.materialCategoryCode,
        subCategoryId: subCats[it.subCategory],
        countryOfOriginId: cooByName[it.coo],
        applicationMethod: "Machine/Hand",
        status: "Active",
        region: "West",
        createdBy: adminId,
      },
    })
  }
  const uomByItem: Record<string, string> = Object.fromEntries(itemDefs.map((i) => [i.id, i.uom]))

  // ---- Grower ↔ Item authorizations -----------------------------------
  const authMap: Record<number, string[]> = {
    [agribar.id]: ["AP-BX-00001", "AP-BG-00002", "BP-BX-00003", "BP-LB-00004", "CG-BX-00005", "CG-PL-00006", "BR-BX-00007", "BR-LB-00008"],
    [brigo.id]: ["BP-BX-00003", "BP-LB-00004", "CG-BX-00005", "CG-PL-00006", "BR-BX-00007", "BR-LB-00008", "AV-BX-00009", "AV-BG-00010"],
    [pdg.id]: ["AP-BX-00001", "AP-BG-00002", "CG-BX-00005", "CG-PL-00006", "AV-BX-00009", "AV-BG-00010", "BP-PL-00011", "CG-ST-00012"],
  }
  for (const g of growers) {
    for (const itemId of authMap[g.id]) {
      await prisma.growerItemAuthorization.create({
        data: { growerId: g.id, itemId, isActive: true, createdBy: adminId },
      })
    }
  }

  // ---- Item ↔ Vendor mappings -----------------------------------------
  const vendorItemMap: Record<number, string[]> = {
    [packRight.id]: ["AP-BX-00001", "AP-BG-00002", "BP-BX-00003", "CG-BX-00005", "BR-BX-00007", "AV-BX-00009", "AV-BG-00010"],
    [palletPool.id]: ["CG-PL-00006", "BP-PL-00011"],
    [labelWorks.id]: ["BP-LB-00004", "BR-LB-00008", "CG-ST-00012"],
  }
  for (const [vendorId, items] of Object.entries(vendorItemMap)) {
    for (const itemId of items) {
      await prisma.itemVendor.create({
        data: { vendorId: Number(vendorId), itemId, isActive: true, createdBy: adminId },
      })
    }
  }

  // ---- Vendor ↔ Material category mappings ----------------------------
  const vendorCategoryMap: Record<number, string[]> = {
    [packRight.id]: ["BX", "BG"], // boxes & bags
    [palletPool.id]: ["PL"], // pallets
    [labelWorks.id]: ["LB", "ST"], // labels & stickers
  }
  for (const [vendorId, codes] of Object.entries(vendorCategoryMap)) {
    for (const materialCategoryCode of codes) {
      await prisma.vendorMaterialCategory.create({
        data: { vendorId: Number(vendorId), materialCategoryCode, isActive: true, createdBy: adminId },
      })
    }
  }

  // ---- Thresholds (some global, one per-grower override) --------------
  console.log("Seeding thresholds, schedulers, conversions…")
  const thresholdDefs = [
    { itemId: "AP-BX-00001", growerId: null, qty: 50 },
    { itemId: "BP-BX-00003", growerId: null, qty: 40 },
    { itemId: "CG-BX-00005", growerId: null, qty: 60 },
    { itemId: "BR-BX-00007", growerId: null, qty: 30 },
    { itemId: "AV-BX-00009", growerId: null, qty: 35 },
    { itemId: "AP-BX-00001", growerId: agribar.id, qty: 80 }, // per-grower override
  ]
  for (const t of thresholdDefs) {
    await prisma.itemThreshold.create({
      data: {
        itemId: t.itemId,
        growerId: t.growerId,
        thresholdQuantity: new Prisma.Decimal(t.qty),
        unitOfMeasure: uomByItem[t.itemId],
        createdBy: adminId,
      },
    })
  }

  // ---- Scheduler settings (global + one per-grower) -------------------
  await prisma.schedulerSetting.create({
    data: { scope: "Global", cadenceType: "AfterNDays", thresholdDays: 3, reminderFrequency: "Daily", isEnabled: true, createdBy: adminId },
  })
  await prisma.schedulerSetting.create({
    data: { scope: "Grower", growerId: pdg.id, cadenceType: "Weekly", thresholdDays: 7, reminderFrequency: "Daily", isEnabled: true, createdBy: adminId },
  })

  // ---- Unit conversions -----------------------------------------------
  const conversions = [
    { fromUnit: "Bags", toUnit: "Boxes", factor: 0.25, notes: "4 bags = 1 box" },
    { fromUnit: "Boxes", toUnit: "Packaged Boxes", factor: 0.5, notes: "2 boxes = 1 packaged box" },
    { fromUnit: "Packaged Boxes", toUnit: "Pallets", factor: 0.0208, notes: "48 packaged boxes = 1 pallet" },
    { fromUnit: "Cases", toUnit: "Pallets", factor: 0.0167, notes: "60 cases = 1 pallet" },
    { fromUnit: "Rolls", toUnit: "Stickers", factor: 5000, notes: "1 roll = 5000 stickers" },
  ]
  for (const c of conversions) {
    await prisma.unitConversion.create({
      data: { ...c, factor: new Prisma.Decimal(c.factor), createdBy: adminId },
    })
  }

  // ---- Historical grower submissions ----------------------------------
  // Agribar: submits through yesterday (active).
  // Brigo: stopped 4 days ago (will trigger reminder).
  // PDG: sporadic, last ~6 days ago.
  console.log("Seeding historical grower submissions + ledger…")
  const growerSubmitDays: Record<number, number[]> = {
    [agribar.id]: [9, 7, 5, 3, 2, 1],
    [brigo.id]: [10, 8, 6, 4],
    [pdg.id]: [12, 9, 6],
  }
  // base quantity per item to keep history coherent
  const baseQty: Record<string, number> = {}
  itemDefs.forEach((it, i) => (baseQty[it.id] = 40 + ((i * 13) % 60)))

  for (const g of growers) {
    const itemIds = authMap[g.id]
    const days = growerSubmitDays[g.id]
    for (let di = 0; di < days.length; di++) {
      const d = days[di]
      const date = daysAgo(d)
      const submission = await prisma.growerSubmission.create({
        data: {
          growerId: g.id,
          submittedBy: growerUserByGrower[g.id],
          submissionDate: date,
          status: "Approved",
          createdBy: growerUserByGrower[g.id],
          createdAt: date,
        },
      })
      for (let ii = 0; ii < itemIds.length; ii++) {
        const itemId = itemIds[ii]
        // vary quantity over time; keep last item unchanged between last 2 days for "no change" badge
        const drift = Math.round((rng(g.id * 100 + ii * 10 + di) - 0.5) * 20)
        const isStable = ii === itemIds.length - 1
        const onHand = Math.max(0, baseQty[itemId] + (isStable ? 0 : drift) - di * 2)
        const detail = await prisma.growerSubmissionDetail.create({
          data: {
            submissionId: submission.id,
            itemId,
            locationId: loc[ii % loc.length].id,
            quantityOnHand: new Prisma.Decimal(onHand),
            unitOfMeasure: uomByItem[itemId],
            createdAt: date,
          },
        })
        await prisma.inventoryLedger.create({
          data: {
            submissionId: submission.id,
            date,
            growerId: g.id,
            itemId,
            locationId: detail.locationId,
            transactionType: "Daily Count Update",
            finalQuantity: new Prisma.Decimal(onHand),
            createdAt: date,
          },
        })
      }
    }
  }

  // ---- Grower orders --------------------------------------------------
  // Orders are raised per item against one of the item's mapped vendors, and
  // tracked independently of the daily on-hand count.
  console.log("Seeding grower orders…")
  const itemToVendors: Record<string, number[]> = {}
  for (const [vendorId, items] of Object.entries(vendorItemMap)) {
    for (const itemId of items) (itemToVendors[itemId] ??= []).push(Number(vendorId))
  }
  const now = new Date()
  for (const g of growers) {
    const orderable = authMap[g.id].filter((id) => itemToVendors[id]?.length)
    // A few open orders spread across recent days.
    for (let i = 0; i < Math.min(3, orderable.length); i++) {
      const itemId = orderable[i]
      const vendors = itemToVendors[itemId]
      await prisma.order.create({
        data: {
          growerId: g.id,
          itemId,
          vendorId: vendors[i % vendors.length],
          quantity: new Prisma.Decimal(10 + Math.round(rng(g.id * 5 + i) * 40)),
          unitOfMeasure: uomByItem[itemId],
          status: "Open",
          orderDate: daysAgo(i + 1),
          // Expected a few days out (daysAgo(negative) => future date).
          expectedDeliveryDate: daysAgo(-(i + 3)),
          createdBy: growerUserByGrower[g.id],
          createdAt: daysAgo(i + 1),
        },
      })
    }
  }
  // Agribar: a received + a cancelled order closed TODAY (still visible today),
  // plus one received YESTERDAY (should have dropped off the active list).
  const agriOrderable = authMap[agribar.id].filter((id) => itemToVendors[id]?.length)
  if (agriOrderable.length >= 2) {
    const [a0, a1] = agriOrderable
    await prisma.order.create({
      data: { growerId: agribar.id, itemId: a0, vendorId: itemToVendors[a0][0], quantity: new Prisma.Decimal(25), unitOfMeasure: uomByItem[a0], status: "Received", orderDate: daysAgo(3), closedAt: now, createdBy: growerUserByGrower[agribar.id], createdAt: daysAgo(3) },
    })
    await prisma.order.create({
      data: { growerId: agribar.id, itemId: a1, vendorId: itemToVendors[a1][0], quantity: new Prisma.Decimal(15), unitOfMeasure: uomByItem[a1], status: "Cancelled", orderDate: daysAgo(2), closedAt: now, createdBy: growerUserByGrower[agribar.id], createdAt: daysAgo(2) },
    })
    await prisma.order.create({
      data: { growerId: agribar.id, itemId: a0, vendorId: itemToVendors[a0][0], quantity: new Prisma.Decimal(30), unitOfMeasure: uomByItem[a0], status: "Received", orderDate: daysAgo(5), closedAt: daysAgo(1), createdBy: growerUserByGrower[agribar.id], createdAt: daysAgo(5) },
    })
  }

  // ---- Historical vendor submissions + allocations --------------------
  console.log("Seeding vendor submissions + allocations…")
  const vendorSubmitDays = [6, 4, 2, 1]
  const vendors = [packRight, palletPool, labelWorks]
  for (const v of vendors) {
    const items = vendorItemMap[v.id]
    for (let di = 0; di < vendorSubmitDays.length; di++) {
      const date = daysAgo(vendorSubmitDays[di])
      const submission = await prisma.vendorSubmission.create({
        data: {
          vendorId: v.id,
          submittedBy: vendorUserByVendor[v.id],
          submissionDate: date,
          status: "Approved",
          createdBy: vendorUserByVendor[v.id],
          createdAt: date,
        },
      })
      for (let ii = 0; ii < items.length; ii++) {
        const itemId = items[ii]
        const qty = 100 + Math.round(rng(v.id * 7 + ii * 3 + di) * 150)
        const detail = await prisma.vendorSubmissionDetail.create({
          data: {
            submissionId: submission.id,
            itemId,
            quantity: new Prisma.Decimal(qty),
            unitOfMeasure: uomByItem[itemId],
            createdAt: date,
          },
        })
        // allocate to growers authorized for this item
        const eligibleGrowers = growers.filter((g) => authMap[g.id].includes(itemId))
        if (eligibleGrowers.length > 0) {
          const per = Math.floor(qty / eligibleGrowers.length)
          for (let gi = 0; gi < eligibleGrowers.length; gi++) {
            const amount = gi === eligibleGrowers.length - 1 ? qty - per * (eligibleGrowers.length - 1) : per
            await prisma.vendorAllocation.create({
              data: {
                vendorSubmissionDetailId: detail.id,
                growerId: eligibleGrowers[gi].id,
                quantity: new Prisma.Decimal(amount),
                createdAt: date,
              },
            })
          }
        }
      }
    }
  }

  // ---- Low inventory flags + missing item requests --------------------
  console.log("Seeding flags, requests, audit logs, notifications, reports…")
  await prisma.lowInventoryFlag.create({
    data: {
      growerId: agribar.id,
      itemId: "BR-BX-00007",
      flaggedBy: jamesUser.id,
      reason: "Running low ahead of weekend harvest",
      isActive: true,
      createdBy: jamesUser.id,
    },
  })
  await prisma.lowInventoryFlag.create({
    data: {
      growerId: brigo.id,
      itemId: "CG-BX-00005",
      flaggedBy: diagoUser.id,
      reason: "Unexpected demand spike",
      isActive: true,
      createdBy: diagoUser.id,
    },
  })

  await prisma.missingItemRequest.create({
    data: {
      growerId: agribar.id,
      requestedBy: jamesUser.id,
      itemName: "Asparagus Banding Rubber 9in",
      commodityHint: "Asparagus",
      categoryHint: "Bands",
      notes: "Need for bunching line, not in my list",
      status: "Open",
      createdBy: jamesUser.id,
    },
  })
  await prisma.missingItemRequest.create({
    data: {
      growerId: pdg.id,
      requestedBy: priyaUser.id,
      itemName: "Avocado Tissue Wrap",
      commodityHint: "Avocado",
      categoryHint: "Wrap",
      notes: "Protective wrap for export",
      status: "Reviewed",
      reviewedBy: adminId,
      reviewedAt: daysAgo(1),
      reviewNotes: "Sourcing with vendor",
      createdBy: priyaUser.id,
    },
  })

  // ---- Global item messages (grower-facing notices) -------------------
  // All-growers notice on a retiring item.
  await prisma.itemMessage.create({
    data: {
      itemId: "CG-ST-00012",
      type: "Retiring",
      severity: "warning",
      audience: "All",
      body: "Being phased out — please run down remaining stock.",
      createdBy: adminId,
      updatedBy: adminId,
    },
  })
  // Selected-growers notice (only Brigo, a Spanish-preference grower — the type
  // label renders localized in their view).
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
  // All-growers critical notice.
  await prisma.itemMessage.create({
    data: {
      itemId: "AV-BG-00010",
      type: "ClearInventory",
      severity: "critical",
      audience: "All",
      body: "Material out of manufacturing — clear inventory soon.",
      createdBy: adminId,
      updatedBy: adminId,
    },
  })

  // ---- Audit logs (sample of internal CRUD) ---------------------------
  const auditSamples = [
    { action: AUDIT_ACTIONS.CREATE, entityType: "Item", entityId: "AP-BX-00001", changes: '{"itemName":"Asparagus Cardboard Box 11lb"}' },
    { action: AUDIT_ACTIONS.CREATE, entityType: "Grower", entityId: String(agribar.id), changes: '{"growerName":"Agribar"}' },
    { action: AUDIT_ACTIONS.UPDATE, entityType: "Vendor", entityId: String(packRight.id), changes: '{"status":["Pending","Active"]}' },
    { action: AUDIT_ACTIONS.CREATE, entityType: "User", entityId: String(jamesUser.id), changes: '{"email":"james@agribar.local"}' },
  ]
  for (let i = 0; i < auditSamples.length; i++) {
    await prisma.auditLog.create({
      data: { userId: adminId, ...auditSamples[i], createdAt: daysAgo(8 - i) },
    })
  }

  // ---- Notification log (mocked emails) -------------------------------
  await prisma.notificationLog.create({
    data: {
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
  })
  await prisma.notificationLog.create({
    data: {
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
  })

  // ---- Power BI placeholder reports -----------------------------------
  await prisma.powerBiReport.create({
    data: { name: "Inventory Overview", embedUrl: "https://app.powerbi.com/view?r=DEMO_OVERVIEW", roleScope: "Admin", createdBy: adminId },
  })
  await prisma.powerBiReport.create({
    data: { name: "Grower Submission Trends", embedUrl: "https://app.powerbi.com/view?r=DEMO_TRENDS", roleScope: "Admin", createdBy: adminId },
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
