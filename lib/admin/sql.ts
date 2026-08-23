import "server-only"
import { Prisma } from "@prisma/client"

/**
 * The `OFFSET/FETCH` tail for a paged raw query, or nothing when unpaged.
 *
 * Omitting it entirely is how the xlsx exports get the WHOLE filtered set: every
 * report's data function takes `page` as optional, the page passes one and the
 * export sheet does not.
 *
 * The clamping is not decoration. SQL Server throws on a negative `OFFSET` or a
 * `FETCH NEXT` of 0, and both are reachable from a hand-edited `?page=` or
 * `?pageSize=` in the URL. Keeping the guards in one place stops them being
 * dropped the next time this is copied into a new report.
 */
export function sqlPage(page?: { skip: number; take: number }): Prisma.Sql {
  if (!page) return Prisma.empty
  return Prisma.sql`OFFSET ${Math.max(0, Math.trunc(page.skip))} ROWS FETCH NEXT ${Math.max(1, Math.trunc(page.take))} ROWS ONLY`
}
