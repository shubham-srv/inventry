/**
 * Describes how an order quantity breaks down into shipping containers.
 *
 * Pure — no DB, no server-only import — so it runs anywhere.
 *
 * This is DESCRIPTIVE ONLY. The containers are packaging: outer boxes, cases and
 * pallets that are discarded on receipt. They are never inventory, and they never
 * change the quantity. What the grower orders is what the grower receives; these
 * lines only say what that quantity occupies on the way.
 *
 * One rule matters: ROUNDING CASCADES. Each level rounds up from the count of the
 * level BELOW it, never from the raw quantity. Computing every level from the raw
 * number independently produces contradictions: with 10 bags/box and 3 boxes/case,
 * 343 bags gives ceil(34.3) = 35 boxes and ceil(11.4) = 12 cases — but 12 cases
 * hold 36 boxes, not 35. The partial container at the top is real; the quantity
 * inside it is not inflated to fill it.
 */

export type ChainLevel = { level: number; unitName: string }
export type Ratio = { level: number; perParent: number }

export type PackLine = {
  level: number // 0 = the item's own quantity, in its category's terms
  unitName: string
  quantity: number
}

export type PackInput = {
  requested: number
  /** Label for level 0 — the item's material category name. */
  baseLabel: string
  levels: ChainLevel[]
  ratios: Ratio[]
}

/**
 * Base units contained by one unit of each level, e.g. with 10 bags/box and
 * 5 boxes/case: { 1: 10, 2: 50 }. Returns null if any ratio is missing or
 * invalid, which means the mapping is half-configured and no maths should be
 * shown at all.
 */
function unitsPerLevel(levels: ChainLevel[], ratios: Ratio[]): Map<number, number> | null {
  const byLevel = new Map(ratios.map((r) => [r.level, r.perParent]))
  const out = new Map<number, number>()
  let running = 1
  for (const l of [...levels].sort((a, b) => a.level - b.level)) {
    const per = byLevel.get(l.level)
    if (per == null || !Number.isFinite(per) || per < 1) return null
    running *= per
    out.set(l.level, running)
  }
  return out
}

/**
 * Break an order quantity into per-level container counts.
 *
 * With no chain, no levels, or incomplete ratios this degrades to a single
 * line — the same behaviour as before packaging existed.
 */
export function describePack(input: PackInput): PackLine[] {
  const { requested, baseLabel, levels, ratios } = input
  const quantity = Math.max(0, requested)
  const sorted = [...levels].sort((a, b) => a.level - b.level)
  const perLevel = unitsPerLevel(sorted, ratios)

  if (!Number.isFinite(requested) || requested <= 0 || sorted.length === 0 || !perLevel) {
    return [{ level: 0, unitName: baseLabel, quantity }]
  }

  // Level 0 is the ordered quantity itself, untouched.
  const lines: PackLine[] = [{ level: 0, unitName: baseLabel, quantity }]
  const byLevel = new Map(ratios.map((r) => [r.level, r.perParent]))
  let previousCount = quantity
  for (const l of sorted) {
    const per = byLevel.get(l.level)!
    const count = Math.ceil(previousCount / per)
    lines.push({ level: l.level, unitName: l.unitName, quantity: count })
    previousCount = count
  }
  return lines
}
