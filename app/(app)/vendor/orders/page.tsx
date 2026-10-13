import Link from "next/link"
import { format } from "date-fns"
import { CalendarCheck, CalendarClock, Pencil, Timer } from "lucide-react"
import { requireRole } from "@/lib/auth/session"
import { ROLES, ORDER_STATUS } from "@/lib/constants"
import { prisma } from "@/lib/db"
import { getT } from "@/lib/i18n/server"
import { buildQueryString, parseListParams } from "@/lib/query"
import { getVendorOrders, VENDOR_ORDER_VIEWS } from "@/lib/vendor/orders"
import { confirmDeliveryDate, setLeadTime } from "@/lib/actions/vendor"
import { toDayInput } from "@/lib/orders/dates"
import { PageHeader } from "@/components/page-header"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { DataTable, type Column } from "@/components/data-table/data-table"
import { DataTableToolbar } from "@/components/data-table/data-table-toolbar"
import { EntityFormDialog, type Field } from "@/components/crud/entity-form-dialog"
import { StatusBadge } from "@/components/status-badge"

type Order = Awaited<ReturnType<typeof getVendorOrders>>["orders"][number]

/**
 * Orders growers have placed with this vendor. The vendor's job here is to
 * answer each one with a delivery date — that date is what the admin Orders
 * report measures delivery against, and the grower is emailed when it is set
 * or changed. Also where the vendor keeps their minimum lead time.
 */
export default async function VendorOrdersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const user = await requireRole([ROLES.VENDOR_USER])
  if (!user.vendorId) return <p className="text-sm">Your account is not mapped to a vendor.</p>

  const t = await getT()
  const { page, pageSize, skip, take, raw } = parseListParams(await searchParams, { pageSize: 15 })
  const [{ orders, total, view }, vendor] = await Promise.all([
    getVendorOrders(user.vendorId, { view: raw.view, q: raw.q }, { skip, take }),
    prisma.vendor.findUnique({ where: { id: user.vendorId }, select: { leadTimeDays: true } }),
  ])
  const lead = vendor?.leadTimeDays ?? null

  const leadFields: Field[] = [
    {
      name: "leadTimeDays",
      label: t("vendor.orders.leadTimeLabel"),
      type: "number",
      min: "0",
      step: "1",
      colSpan: 2,
      description: t("vendor.orders.leadTimeHint"),
    },
  ]

  const dateFields = (o: Order): Field[] => [
    {
      name: "confirmedDeliveryDate",
      label: t("vendor.orders.deliveryDate"),
      type: "date",
      required: true,
      min: toDayInput(o.orderDate),
      colSpan: 2,
      description: o.expectedDeliveryDate
        ? t("vendor.orders.requestedHint", { date: format(o.expectedDeliveryDate, "MMM d, yyyy") })
        : undefined,
    },
  ]

  const day = (d: Date | null) => (d ? format(d, "MMM d, yyyy") : "—")

  const columns: Column<Order>[] = [
    { key: "id", header: t("vendor.orders.order"), className: "font-mono text-xs", cell: (o) => `#${o.id}` },
    { key: "grower", header: t("vendor.orders.grower"), cell: (o) => o.grower.growerName },
    {
      key: "item",
      header: t("vendor.orders.item"),
      cell: (o) => (
        <div>
          <span className="font-medium">{o.item.itemName}</span>
          <p className="text-muted-foreground font-mono text-xs">{o.itemId}</p>
        </div>
      ),
    },
    {
      key: "qty",
      header: t("vendor.orders.qty"),
      className: "tabular-nums",
      cell: (o) => (
        <div>
          {Number(o.quantity)} {o.item.materialCategory?.name ?? ""}
          {/* What it ships as, in this vendor's conversions (snapshotted). */}
          {o.packLines.length > 1 && (
            <p className="text-muted-foreground text-xs">
              {o.packLines.slice(1).map((l) => `${Number(l.quantity)} ${l.unitName}`).join(" · ")}
            </p>
          )}
        </div>
      ),
    },
    { key: "ordered", header: t("vendor.orders.ordered"), className: "text-xs whitespace-nowrap", cell: (o) => day(o.orderDate) },
    { key: "requested", header: t("vendor.orders.requested"), className: "text-xs whitespace-nowrap", cell: (o) => day(o.expectedDeliveryDate) },
    {
      key: "confirmed",
      header: t("vendor.orders.yourDate"),
      className: "text-xs whitespace-nowrap",
      cell: (o) =>
        o.confirmedDeliveryDate ? (
          <div>
            <span className="font-medium">{day(o.confirmedDeliveryDate)}</span>
            {o.confirmedAt && (
              <p className="text-muted-foreground">{t("vendor.orders.setOn", { date: format(o.confirmedAt, "MMM d") })}</p>
            )}
          </div>
        ) : o.status === ORDER_STATUS.OPEN ? (
          <Badge variant="outline" className="border-transparent bg-amber-500/15 text-amber-700 dark:text-amber-400">
            <CalendarClock className="mr-1 size-3" /> {t("vendor.orders.awaiting")}
          </Badge>
        ) : (
          "—"
        ),
    },
    { key: "status", header: t("vendor.orders.status"), cell: (o) => <StatusBadge status={o.status} /> },
    {
      key: "actions",
      header: "",
      headClassName: "w-0",
      className: "text-right",
      cell: (o) =>
        o.status === ORDER_STATUS.OPEN ? (
          <EntityFormDialog
            title={o.confirmedDeliveryDate ? t("vendor.orders.changeTitle") : t("vendor.orders.confirmTitle")}
            description={`#${o.id} · ${o.grower.growerName} · ${o.item.itemName}`}
            fields={dateFields(o)}
            action={confirmDeliveryDate}
            values={{
              id: o.id,
              confirmedDeliveryDate: toDayInput(o.confirmedDeliveryDate ?? o.expectedDeliveryDate ?? new Date()),
            }}
            submitLabel={t("vendor.orders.saveDate")}
            trigger={
              <Button variant={o.confirmedDeliveryDate ? "ghost" : "outline"} size="xs">
                {o.confirmedDeliveryDate ? <Pencil className="size-3.5" /> : <CalendarCheck className="size-3.5" />}
                {o.confirmedDeliveryDate ? t("vendor.orders.change") : t("vendor.orders.confirm")}
              </Button>
            }
          />
        ) : null,
    },
  ]

  return (
    <>
      <PageHeader title={t("vendor.orders.title")} description={t("vendor.orders.description")} />

      {/* Lead time sits with the orders it constrains. */}
      <Card className="mb-4 py-0">
        <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
          <div className="flex items-center gap-3">
            <Timer className="text-muted-foreground size-5" />
            <div>
              <p className="text-sm font-medium">
                {lead == null ? t("vendor.orders.leadTimeNone") : t("vendor.orders.leadTimeValue", { days: lead })}
              </p>
              <p className="text-muted-foreground text-xs">{t("vendor.orders.leadTimeExplain")}</p>
            </div>
          </div>
          <EntityFormDialog
            title={t("vendor.orders.leadTimeTitle")}
            fields={leadFields}
            action={setLeadTime}
            values={{ leadTimeDays: lead ?? "" }}
            submitLabel={t("common.save")}
            trigger={
              <Button variant="outline" size="sm">
                <Pencil className="size-3.5" /> {t("vendor.orders.leadTimeEdit")}
              </Button>
            }
          />
        </CardContent>
      </Card>

      <div className="space-y-4">
        <div className="flex flex-wrap gap-1.5">
          {VENDOR_ORDER_VIEWS.map((v) => (
            <Button key={v} asChild size="sm" variant={v === view ? "secondary" : "ghost"}>
              <Link href={buildQueryString({ ...raw, view: v === "open" ? undefined : v, page: undefined }) || "?"} scroll={false}>
                {t(`vendor.orders.views.${v}`)}
              </Link>
            </Button>
          ))}
        </div>
        <DataTableToolbar searchPlaceholder={t("vendor.orders.search")} />
        <DataTable
          columns={columns}
          rows={orders}
          getRowKey={(o) => o.id}
          page={page}
          pageCount={Math.ceil(total / pageSize)}
          total={total}
          searchParams={raw}
          emptyMessage={t("vendor.orders.none")}
        />
      </div>
    </>
  )
}
