import "server-only"

// Sliding-window counter, in memory and per replica: a speed bump against
// guessing and inbox flooding, not a hard security boundary.
const hits = new Map<string, number[]>()
const MAX_KEYS = 10_000
const MAX_WINDOW_MS = 60 * 60 * 1000

/** Records a call for `key`; false if it already made `limit` calls in `windowMs`. */
export function allow(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now()
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs)
  if (recent.length >= limit) {
    hits.set(key, recent)
    return false
  }
  recent.push(now)
  hits.set(key, recent)
  if (hits.size > MAX_KEYS) {
    for (const [k, ts] of hits) if (now - ts[ts.length - 1] > MAX_WINDOW_MS) hits.delete(k)
  }
  return true
}
