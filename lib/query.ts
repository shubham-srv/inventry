// Helpers for URL-driven list pages (search / filter / pagination).

export type RawParams = Record<string, string | string[] | undefined>

export type ListParams = {
  q: string
  page: number
  pageSize: number
  skip: number
  take: number
  raw: Record<string, string>
}

export function firstValue(
  sp: RawParams,
  key: string
): string | undefined {
  const v = sp[key]
  return Array.isArray(v) ? v[0] : v
}

export function parseListParams(
  sp: RawParams,
  opts?: { pageSize?: number }
): ListParams {
  const pageSize = opts?.pageSize ?? 10
  const page = Math.max(1, Number(firstValue(sp, "page") ?? 1) || 1)
  const q = (firstValue(sp, "q") ?? "").trim()

  const raw: Record<string, string> = {}
  for (const [k, v] of Object.entries(sp)) {
    const val = Array.isArray(v) ? v[0] : v
    if (val != null && val !== "") raw[k] = val
  }

  return { q, page, pageSize, skip: (page - 1) * pageSize, take: pageSize, raw }
}

export function buildQueryString(
  base: Record<string, string | number | undefined | null>,
  overrides: Record<string, string | number | undefined | null> = {}
): string {
  const merged = { ...base, ...overrides }
  const usp = new URLSearchParams()
  for (const [k, v] of Object.entries(merged)) {
    if (v != null && v !== "") usp.set(k, String(v))
  }
  const s = usp.toString()
  return s ? `?${s}` : ""
}
