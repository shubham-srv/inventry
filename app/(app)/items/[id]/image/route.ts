import { prisma } from "@/lib/db"
import { requireUser } from "@/lib/auth/session"
import { imageStore } from "@/lib/storage"

/**
 * GET /items/<itemId>/image — an item's photo.
 *
 * Gated on being SIGNED IN, not on a capability: growers and vendors see item
 * photos in the lists they work from, so this cannot sit under /admin. It lives
 * in the (app) group so the proxy's session check covers it, with requireUser()
 * as the second gate — the same arrangement as app/(app)/admin/export/route.ts.
 *
 * Note this deliberately does NOT check whether the caller is authorized for
 * the item: a photo of a cardboard box is catalog data, not grower- or
 * vendor-isolated data. If that ever needs tightening, the check belongs here.
 *
 * Keeping the bytes behind this route is what lets the storage container stay
 * private — there is no public blob URL and no SAS token anywhere.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  await requireUser()
  const { id } = await params

  const item = await prisma.item.findUnique({
    where: { id },
    select: { imageKey: true },
  })
  if (!item?.imageKey) {
    return new Response("Not found", { status: 404 })
  }

  const stored = await (await imageStore()).get(item.imageKey)
  if (!stored) {
    // The row points at an object that is not there — a failed upload, or a
    // container restored out of step with the database. 404 rather than 500:
    // the caller wants an image and there isn't one.
    console.warn("[items] missing blob for key", item.imageKey)
    return new Response("Not found", { status: 404 })
  }

  return new Response(new Uint8Array(stored.body), {
    headers: {
      "Content-Type": stored.contentType,
      // The key embeds a uuid that changes on every replace, so these bytes are
      // final. `private` keeps them out of shared caches — they are only ever
      // served to a signed-in user.
      "Cache-Control": "private, max-age=31536000, immutable",
      ETag: `"${item.imageKey}"`,
    },
  })
}
