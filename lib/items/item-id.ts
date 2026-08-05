import "server-only"
import { type Prisma } from "@prisma/client"

// Item IDs look like CC-MM-NNNNN — commodity code, material category code and a
// zero-padded sequence (e.g. AP-BG-00005). They are generated on create, never
// typed by hand, and never change afterwards (the PK is referenced by ledger,
// submissions and orders).

export const ITEM_ID_SEQUENCE_WIDTH = 5

/** Trailing sequence of an item id: "AP-BG-00005" -> 5. */
const SEQUENCE_SUFFIX = /-(\d+)$/

export function formatItemId(
  commodityCode: string,
  materialCategoryCode: string,
  sequence: number
): string {
  const cc = commodityCode.trim().toUpperCase()
  const mm = materialCategoryCode.trim().toUpperCase()
  return `${cc}-${mm}-${String(sequence).padStart(ITEM_ID_SEQUENCE_WIDTH, "0")}`
}

/**
 * Highest sequence number currently in use among the matching items. Item ids
 * are short and the table is small (thousands, not millions), so scanning the
 * ids beats maintaining a counter table that could drift from reality.
 */
async function maxSequence(
  tx: Prisma.TransactionClient,
  where: Prisma.ItemWhereInput
): Promise<number> {
  const rows = await tx.item.findMany({ where, select: { id: true } })
  let max = 0
  for (const r of rows) {
    const m = SEQUENCE_SUFFIX.exec(r.id)
    if (m) max = Math.max(max, Number(m[1]))
  }
  return max
}

/**
 * ACTIVE STRATEGY — one running number across the whole item table, so the
 * numeric part is unique on its own: AP-BX-00001, AP-BG-00002, BP-BX-00003…
 */
export async function nextItemId(
  tx: Prisma.TransactionClient,
  commodityCode: string,
  materialCategoryCode: string
): Promise<string> {
  return formatItemId(commodityCode, materialCategoryCode, (await maxSequence(tx, {})) + 1)
}

/**
 * The sequence `nextItemId` would use right now — for showing the admin what ID
 * their item will get. Advisory only: the real id is generated inside the create
 * transaction, so a concurrent create can claim this number first.
 */
export async function peekNextSequence(db: Prisma.TransactionClient): Promise<number> {
  return (await maxSequence(db, {})) + 1
}

/** Zero-padded form of a sequence, for building a preview id client-side. */
export function padSequence(sequence: number): string {
  return String(sequence).padStart(ITEM_ID_SEQUENCE_WIDTH, "0")
}

/**
 * ALTERNATIVE STRATEGY — sequence restarts per commodity+category combination
 * (AP-BX-00001, AP-BG-00001, BP-BX-00001…). Not wired up: `createItem` calls
 * `nextItemId`. Kept ready in case the client wants numbering per combination —
 * swap the call in lib/actions/items.ts, nothing else changes.
 */
export async function nextItemIdForCombination(
  tx: Prisma.TransactionClient,
  commodityCode: string,
  materialCategoryCode: string
): Promise<string> {
  const cc = commodityCode.trim().toUpperCase()
  const mm = materialCategoryCode.trim().toUpperCase()
  const seq = await maxSequence(tx, {
    commodityCode: cc,
    materialCategoryCode: mm,
  })
  return formatItemId(cc, mm, seq + 1)
}
