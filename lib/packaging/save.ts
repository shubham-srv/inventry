import "server-only"
import { prisma } from "@/lib/db"
import { ok, fail, type ActionState } from "@/lib/actions/types"
import { recordAudit } from "@/lib/audit"
import { AUDIT_ACTIONS } from "@/lib/constants"
import { type TFunction } from "@/lib/i18n/translate"

/**
 * Assign a conversion chain to a vendor↔item mapping and record its ratios —
 * shared by the admin mapping screen and the vendor's own "My items" page, so
 * both validate identically. Callers authorize first (who may touch which
 * mapping); this only checks the data.
 *
 * Ratios arrive as one comma-separated field ("10, 5"), positionally matching
 * the chain's levels innermost-first. No chain ("none"/empty) clears the setup,
 * returning the mapping to plain-units ordering. Conversions are descriptive:
 * they never change an ordered quantity.
 */
export async function saveConversions(
  t: TFunction,
  opts: { mappingId: number; chainId: string; ratios: string; userId: number }
): Promise<ActionState> {
  const mapping = await prisma.itemVendor.findUnique({
    where: { id: opts.mappingId },
    include: { item: { select: { materialCategoryCode: true } } },
  })
  if (!mapping) return fail(t("conversions.mappingNotFound"))

  if (!opts.chainId || opts.chainId === "none") {
    await prisma.$transaction([
      prisma.vendorPackRatio.deleteMany({ where: { itemVendorId: mapping.id } }),
      prisma.itemVendor.update({
        where: { id: mapping.id },
        data: { packagingChainId: null, updatedBy: opts.userId },
      }),
    ])
    await recordAudit({
      userId: opts.userId,
      action: AUDIT_ACTIONS.UPDATE,
      entityType: "ItemVendor",
      entityId: mapping.id,
      changes: { packagingChainId: null, ratios: [] },
    })
    return ok(t("conversions.cleared"))
  }

  const chain = await prisma.packagingChain.findUnique({
    where: { id: Number(opts.chainId) || 0 },
    include: { levels: { orderBy: { level: "asc" } } },
  })
  if (!chain || !chain.isActive) return fail(t("conversions.chainNotFound"))

  // The chain must belong to the item's material category — that category is
  // what the item is counted in, so another category's chain would describe
  // containers of the wrong thing. Re-checked here: the id arrives in a form.
  if (chain.materialCategoryCode !== mapping.item.materialCategoryCode)
    return fail(
      t("conversions.wrongCategory", {
        chain: chain.materialCategoryCode,
        item: mapping.item.materialCategoryCode ?? "—",
      })
    )

  const ratios = opts.ratios
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map(Number)
  if (ratios.length !== chain.levels.length) {
    const message = t("conversions.levelCount", {
      count: chain.levels.length,
      levels: chain.levels.map((l) => l.unitName).join(", "),
    })
    return fail(message, { ratios: [message] })
  }
  if (ratios.some((n) => !Number.isInteger(n) || n < 1)) {
    const message = t("conversions.wholeNumbers")
    return fail(message, { ratios: [message] })
  }

  await prisma.$transaction([
    prisma.vendorPackRatio.deleteMany({ where: { itemVendorId: mapping.id } }),
    prisma.itemVendor.update({
      where: { id: mapping.id },
      data: {
        packagingChainId: chain.id,
        updatedBy: opts.userId,
        packRatios: {
          create: ratios.map((perParent, i) => ({
            level: i + 1,
            perParent,
            createdBy: opts.userId,
            updatedBy: opts.userId,
          })),
        },
      },
    }),
  ])
  await recordAudit({
    userId: opts.userId,
    action: AUDIT_ACTIONS.UPDATE,
    entityType: "ItemVendor",
    entityId: mapping.id,
    changes: { packagingChainId: chain.id, ratios },
  })
  return ok(t("conversions.saved"))
}
