import { Pencil } from "lucide-react"
import { startOfDay, format } from "date-fns"
import { requireRole } from "@/lib/auth/session"
import { ROLES, ORDER_STATUS } from "@/lib/constants"
import { prisma } from "@/lib/db"
import { getT } from "@/lib/i18n/server"
import { parseListParams } from "@/lib/query"
import { updateOrderDelivery } from "@/lib/actions/orders"
import { PageHeader } from "@/components/page-header"
import { Pager } from "@/components/pager"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { EntityFormDialog, type Field } from "@/components/crud/entity-form-dialog"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

export default async function GrowerOnOrderPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const user = await requireRole([ROLES.GROWER_USER])
  if (!user.growerId)
    return <p className="text-sm">Your account is not mapped to a grower.</p>

  const t = await getT()
  const todayStart = startOfDay(new Date())
  const { page, pageSize, skip, take, raw } = parseListParams(await searchParams, { pageSize: 15 })

  // Active orders: still Open, or closed today (visible through end of day).
  // The status filter keeps this naturally small, but it was unbounded — a
  // grower with many open orders had no way to reach the older ones.
  const where = {
    growerId: user.growerId,
    OR: [{ status: ORDER_STATUS.OPEN }, { closedAt: { gte: todayStart } }],
  }
  const [orders, total] = await Promise.all([
    prisma.order.findMany({
      where,
      include: { item: true, vendor: true },
      orderBy: [{ status: "asc" }, { orderDate: "desc" }],
      skip,
      take,
    }),
    prisma.order.count({ where }),
  ])

  const deliveryFields: Field[] = [
    {
      name: "expectedDeliveryDate",
      label: t("grower.onOrder.expectedDelivery"),
      type: "date",
      colSpan: 2,
    },
  ]

  return (
    <>
      <PageHeader
        title={t("grower.onOrder.title")}
        description={t("grower.onOrder.description")}
      />
      <Card className="py-0">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("grower.onOrder.item")}</TableHead>
                <TableHead>{t("grower.onOrder.vendor")}</TableHead>
                <TableHead>{t("grower.onOrder.qty")}</TableHead>
                <TableHead>{t("grower.onOrder.ordered")}</TableHead>
                <TableHead>{t("grower.onOrder.expectedDelivery")}</TableHead>
                <TableHead>{t("grower.onOrder.status")}</TableHead>
                <TableHead className="w-0"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orders.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={7}
                    className="h-24 text-center text-muted-foreground"
                  >
                    {t("grower.onOrder.none")}
                  </TableCell>
                </TableRow>
              )}
              {orders.map((o) => {
                const isOpen = o.status === ORDER_STATUS.OPEN
                const isReceived = o.status === ORDER_STATUS.RECEIVED
                return (
                  <TableRow key={o.id}>
                    <TableCell>
                      <span className="font-medium">{o.item.itemName}</span>
                      <span className="ml-2 font-mono text-xs text-muted-foreground">
                        {o.itemId}
                      </span>
                    </TableCell>
                    <TableCell>{o.vendor.vendorName}</TableCell>
                    <TableCell className="tabular-nums">
                      {Number(o.quantity)} {o.unitOfMeasure ?? ""}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {format(o.orderDate, "MMM d, yyyy")}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {o.expectedDeliveryDate
                        ? format(o.expectedDeliveryDate, "MMM d, yyyy")
                        : "—"}
                    </TableCell>
                    <TableCell>
                      {isOpen ? (
                        <Badge
                          variant="outline"
                          className="border-transparent bg-sky-500/15 text-sky-700 dark:text-sky-400"
                        >
                          {t("status.Open")}
                        </Badge>
                      ) : isReceived ? (
                        <Badge
                          variant="outline"
                          className="border-transparent bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
                        >
                          {t("grower.orders.receivedBadge")}
                        </Badge>
                      ) : (
                        <Badge
                          variant="outline"
                          className="text-muted-foreground line-through"
                        >
                          {t("grower.orders.cancelledBadge")}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {isOpen && (
                        <EntityFormDialog
                          title={t("grower.orders.editDeliveryTitle")}
                          description={`${o.vendor.vendorName} · ${Number(o.quantity)} ${o.unitOfMeasure ?? ""}`}
                          fields={deliveryFields}
                          action={updateOrderDelivery}
                          submitLabel={t("common.save")}
                          values={{
                            id: o.id,
                            expectedDeliveryDate: o.expectedDeliveryDate
                              ? o.expectedDeliveryDate.toISOString().slice(0, 10)
                              : "",
                          }}
                          trigger={
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              aria-label={t("grower.orders.editDelivery")}
                            >
                              <Pencil />
                            </Button>
                          }
                        />
                      )}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <div className="mt-4">
        <Pager
          page={page}
          pageCount={Math.ceil(total / pageSize)}
          total={total}
          searchParams={raw}
        />
      </div>
    </>
  )
}
