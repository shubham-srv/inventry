/**
 * Works out how an order quantity breaks down into shipping containers, and how
 * much material therefore actually arrives.
 *
 * Pure — no DB, no server-only import — so it runs in the order dialog on the
 * client and on the server when the order is written, and both agree.
 *
 * Two rules matter:
 *
 *  1. ROUNDING CASCADES. Each level rounds up from the ALREADY-ROUNDED level
 *     below it, never from the raw quantity. Computing every level from the raw
 *     number independently produces contradictions: with 10 bags/box and
 *     3 boxes/case, 343 bags gives ceil(34.3)=35 boxes and ceil(11.4)=12 cases —
 *     but 12 cases hold 36 boxes, not 35.
 *
 *  2. `shipsInLevel` decides what actually arrives. It names the level that has
 *     to be a whole, full container:
 *       0 = the item's own unit — partial containers are fine, so the grower
 *           receives exactly what was ordered and the counts are descriptive.
 *       k = whole level-k containers, so the quantity rounds UP to a multiple of
 *           that container, and the grower may receive more than they asked for.
 */

export type ChainLevel = { level: number; unitName: string }
export type Ratio = { level: number; perParent: number }

export type PackLine = {
  level: number // 0 = the item's own unit
  unitName: string
  quantity: number
}

export type PackResolution = {
  lines: PackLine[]
  /** Base units actually shipped. Equals `requested` when shipsInLevel is 0. */
  deliveredQuantity: number
  requested: number
  /** True when rounding means more arrives than was asked for. */
  roundedUp: boolean
}

export type PackInput = {
  requested: number
  baseUnit: string
  levels: ChainLevel[]
  ratios: Ratio[]
  shipsInLevel: number
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
 * Resolve an order quantity into per-level container counts.
 *
 * With no chain, no levels, or incomplete ratios this degrades to a single
 * base-unit line — the same behaviour as before packaging existed.
 */
export function resolvePack(input: PackInput): PackResolution {
  const { requested, baseUnit, levels, ratios, shipsInLevel } = input
  const sorted = [...levels].sort((a, b) => a.level - b.level)
  const perLevel = unitsPerLevel(sorted, ratios)

  if (!Number.isFinite(requested) || requested <= 0 || sorted.length === 0 || !perLevel) {
    return {
      lines: [{ level: 0, unitName: baseUnit, quantity: Math.max(0, requested) }],
      deliveredQuantity: Math.max(0, requested),
      requested: Math.max(0, requested),
      roundedUp: false,
    }
  }

  // Clamp: a shipsInLevel pointing past the end of the chain (a chain edited
  // shorter, say) falls back to the outermost level that does exist.
  const shipLevel = Math.min(Math.max(shipsInLevel, 0), sorted[sorted.length - 1].level)

  // 1. Delivered quantity — only a shipping level above the base unit inflates it.
  let delivered = requested
  if (shipLevel >= 1) {
    const per = perLevel.get(shipLevel)
    if (per) delivered = Math.ceil(requested / per) * per
  }

  // 2. Container counts. At or below the shipping level they divide exactly;
  //    above it they cascade upward from the level below.
  const lines: PackLine[] = [{ level: 0, unitName: baseUnit, quantity: delivered }]
  const byLevel = new Map(ratios.map((r) => [r.level, r.perParent]))
  let previousCount = delivered
  for (const l of sorted) {
    const per = byLevel.get(l.level)!
    const count =
      l.level <= shipLevel
        ? Math.round(delivered / perLevel.get(l.level)!) // exact by construction
        : Math.ceil(previousCount / per)
    lines.push({ level: l.level, unitName: l.unitName, quantity: count })
    previousCount = count
  }

  return { lines, deliveredQuantity: delivered, requested, roundedUp: delivered > requested }
}

/** "350 Bags · 35 Boxes · 7 Cases" — compact summary for a dialog or table. */
export function formatPack(res: PackResolution): string {
  return res.lines.map((l) => `${l.quantity} ${l.unitName}`).join(" · ")
}
