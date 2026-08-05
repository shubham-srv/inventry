"use client"

import { useActionState, useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { format } from "date-fns"
import { toast } from "sonner"
import {
  TriangleAlert,
  CheckCircle2,
  Flag,
  FileClock,
  Plus,
  PackageCheck,
  Pencil,
  Truck,
  X,
  Megaphone,
} from "lucide-react"
import { submitInventory } from "@/lib/actions/grower"
import {
  createOrder,
  receiveOrder,
  cancelOrder,
  updateOrderDelivery,
} from "@/lib/actions/orders"
import { initialActionState } from "@/lib/actions/types"
import { type SubmitRow, type OrderView, type ItemMessageView } from "@/lib/grower/data"
import { useT } from "@/lib/i18n/client"
import { SUBMISSION_STATUS, ORDER_STATUS } from "@/lib/constants"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import {
  EntityFormDialog,
  type Field,
} from "@/components/crud/entity-form-dialog"
import { ActionButton } from "@/components/action-button"
import { ConfirmButton } from "@/components/crud/confirm-button"
import { cn } from "@/lib/utils"

type RowState = { qty: string; low: boolean }

export function GrowerSubmitForm({
  rows,
  todayStatus,
}: {
  rows: SubmitRow[]
  todayStatus: string | null
}) {
  const t = useT()
  const router = useRouter()
  const [state, formAction, pending] = useActionState(
    submitInventory,
    initialActionState
  )
  const handled = useRef(false)

  const [values, setValues] = useState<Record<string, RowState>>(() =>
    Object.fromEntries(
      rows.map((r) => [
        r.itemId,
        {
          qty: r.todayQty != null ? String(r.todayQty) : "",
          low: r.lowFlagged,
        },
      ])
    )
  )

  useEffect(() => {
    if (state.ok && !handled.current) {
      handled.current = true
      toast.success(state.message ?? t("common.save"))
      router.refresh()
    } else if (!state.ok && state.message) {
      toast.error(state.message)
    }
    handled.current = state.ok
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, router])

  const entered = useMemo(
    () => rows.filter((r) => values[r.itemId]?.qty.trim() !== "").length,
    [rows, values]
  )
  // The bar reflects SUBMITTED items (server state), not what's typed locally.
  const submitted = useMemo(
    () => rows.filter((r) => r.submittedToday).length,
    [rows]
  )
  const pct = rows.length ? Math.round((submitted / rows.length) * 100) : 0
  const isDraft = todayStatus === SUBMISSION_STATUS.DRAFT

  const payload = useMemo(
    () =>
      JSON.stringify(
        rows
          .filter((r) => values[r.itemId]?.qty.trim() !== "")
          .map((r) => ({
            itemId: r.itemId,
            quantityOnHand: Number(values[r.itemId].qty),
            uom: r.uom,
            low: values[r.itemId].low,
          }))
      ),
    [rows, values]
  )

  function set(itemId: string, patch: Partial<RowState>) {
    setValues((v) => ({ ...v, [itemId]: { ...v[itemId], ...patch } }))
  }

  // Prefill every box with its last submitted value so the grower only edits
  // the few that changed. Explicit action — overwrites current entries.
  const hasPrev = useMemo(() => rows.some((r) => r.previousQty != null), [rows])
  function loadPrevious() {
    setValues((v) => {
      const next = { ...v }
      for (const r of rows) {
        if (r.previousQty != null) {
          next[r.itemId] = { ...next[r.itemId], qty: String(r.previousQty) }
        }
      }
      return next
    })
  }

  return (
    <>
      {/* The daily on-hand count posts a single JSON payload. This form holds
          only that payload; the sticky buttons target it via the `form`
          attribute, so it needn't wrap the cards — that keeps the header sticky
          across the whole list and keeps the per-card order actions un-nested. */}
      <form id="grower-submit-form" action={formAction}>
        <input type="hidden" name="payload" value={payload} />
      </form>

      {/* Sticky progress + actions */}
      <div className="sticky top-14 z-10 -mx-4 mb-4 border-b bg-background/95 px-4 py-3 backdrop-blur md:-mx-6 md:px-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
          <div className="min-w-0 flex-1">
            <div className="mb-1 flex items-center justify-between text-sm">
              <span className="flex items-center gap-2 font-medium">
                {t("grower.form.progressLabel")}
                {isDraft && (
                  <Badge
                    variant="outline"
                    className="border-transparent bg-amber-500/15 text-amber-700 dark:text-amber-400"
                  >
                    <FileClock className="mr-1 size-3" />{" "}
                    {t("grower.form.draftBadge")}
                  </Badge>
                )}
              </span>
              <span className="text-muted-foreground tabular-nums">
                {t("grower.form.submittedOf", {
                  done: submitted,
                  total: rows.length,
                })}
              </span>
            </div>
            <Progress value={pct} />
          </div>
          <div className="flex shrink-0 gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={loadPrevious}
              disabled={pending || !hasPrev}
            >
              {t("grower.form.loadPrevious")}
            </Button>
            <Button
              type="submit"
              form="grower-submit-form"
              name="mode"
              value="draft"
              variant="outline"
              disabled={pending || entered === 0}
            >
              {pending ? t("common.saving") : t("grower.form.saveDraft")}
            </Button>
            <Button
              type="submit"
              form="grower-submit-form"
              name="mode"
              value="submit"
              disabled={pending || entered === 0}
            >
              {pending ? t("common.saving") : t("grower.form.submit")}
            </Button>
          </div>
        </div>
      </div>

      <div className="grid gap-3">
        {rows.map((r) => {
          const v = values[r.itemId]
          const filled = v.qty.trim() !== ""
          return (
            <Card
              key={r.itemId}
              className={cn(
                "py-0",
                r.submittedToday && "border-emerald-500/40",
                !r.submittedToday && r.recordedToday && "border-amber-500/40"
              )}
            >
              <CardContent className="space-y-3 p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{r.itemName}</span>
                      {r.submittedToday && (
                        <CheckCircle2 className="size-4 text-emerald-600" />
                      )}
                      {!r.submittedToday && r.recordedToday && filled && (
                        <FileClock className="size-4 text-amber-600" />
                      )}
                      {r.belowThreshold && (
                        <Badge
                          variant="outline"
                          className="border-transparent bg-amber-500/15 text-amber-700 dark:text-amber-400"
                        >
                          <TriangleAlert className="mr-1 size-3" />{" "}
                          {t("grower.form.belowThreshold")}
                        </Badge>
                      )}
                      {v.low && (
                        <Badge
                          variant="outline"
                          className="border-transparent bg-red-500/15 text-red-700 dark:text-red-400"
                        >
                          <Flag className="mr-1 size-3" />{" "}
                          {t("grower.form.low")}
                        </Badge>
                      )}
                    </div>
                    <p className="mt-0.5 font-mono text-xs text-muted-foreground">
                      {r.itemId}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {r.commodityName ?? "—"} · {r.categoryName ?? "—"}
                      {r.previousQty != null && (
                        <>
                          {" "}
                          · {t("grower.form.prev")}: {r.previousQty}{" "}
                          {r.uom ?? ""}
                        </>
                      )}
                      {r.thresholdQty != null && (
                        <>
                          {" "}
                          · {t("grower.form.min")}: {r.thresholdQty}
                        </>
                      )}
                    </p>
                  </div>

                  <div className="flex items-end gap-3">
                    <div className="w-24">
                      <Label htmlFor={`qty-${r.itemId}`} className="text-xs">
                        {t("grower.form.onHand")}
                        {r.uom ? ` (${r.uom})` : ""}
                      </Label>
                      <Input
                        id={`qty-${r.itemId}`}
                        type="number"
                        min={0}
                        inputMode="decimal"
                        value={v.qty}
                        onChange={(e) => set(r.itemId, { qty: e.target.value })}
                        placeholder="0"
                      />
                    </div>
                    <div className="flex flex-col items-center gap-1">
                      <Label htmlFor={`low-${r.itemId}`} className="text-xs">
                        {t("grower.form.low")}
                      </Label>
                      <Switch
                        id={`low-${r.itemId}`}
                        checked={v.low}
                        onCheckedChange={(c) => set(r.itemId, { low: c })}
                      />
                    </div>
                  </div>
                </div>

                {/* Admin notices for this item (retiring, increase stock, …) */}
                {r.messages.length > 0 && (
                  <div className="flex flex-col gap-1.5">
                    {r.messages.map((m) => (
                      <ItemMessageBanner key={m.id} message={m} />
                    ))}
                  </div>
                )}

                {/* Orders — raised separately, tracked independently of on-hand */}
                <div className="border-t pt-3">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <span className="text-xs font-medium text-muted-foreground">
                      {t("grower.orders.heading")}
                    </span>
                    <AddOrderButton item={r} />
                  </div>
                  {r.orders.length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                      {t("grower.orders.none")}
                    </p>
                  ) : (
                    <ul className="flex flex-col gap-1.5">
                      {r.orders.map((o) => (
                        <OrderRow key={o.id} order={o} />
                      ))}
                    </ul>
                  )}
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {rows.length === 0 && (
        <p className="text-sm text-muted-foreground">
          {t("grower.form.noItems")}
        </p>
      )}
    </>
  )
}

function OrderRow({ order }: { order: OrderView }) {
  const t = useT()
  const isOpen = order.status === ORDER_STATUS.OPEN
  const isReceived = order.status === ORDER_STATUS.RECEIVED
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md bg-muted/40 px-2.5 py-1.5 text-sm">
      <span className="font-medium">{order.vendorName}</span>
      <span className="tabular-nums">
        {order.quantity} {order.uom ?? ""}
      </span>
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
        <Badge variant="outline" className="text-muted-foreground line-through">
          {t("grower.orders.cancelledBadge")}
        </Badge>
      )}
      <span className="text-xs text-muted-foreground">
        {isOpen
          ? t("grower.orders.orderedOn", {
              date: format(new Date(order.orderDate), "MMM d"),
            })
          : t("grower.orders.closedOn", {
              date: format(
                new Date(order.closedAt ?? order.orderDate),
                "MMM d"
              ),
            })}
      </span>
      {order.expectedDeliveryDate && (
        <span className="flex items-center gap-1 text-xs text-muted-foreground">
          <Truck className="size-3" />
          {t("grower.orders.eta", {
            date: format(new Date(order.expectedDeliveryDate), "MMM d"),
          })}
        </span>
      )}
      {isOpen && (
        <div className="ml-auto flex items-center gap-1">
          <EditDeliveryButton order={order} />
          <ActionButton
            action={receiveOrder.bind(null, order.id)}
            variant="outline"
            size="xs"
          >
            <PackageCheck className="size-3.5" /> {t("grower.orders.receive")}
          </ActionButton>
          <ConfirmButton
            title={t("grower.orders.cancelTitle")}
            description={t("grower.orders.cancelDesc", {
              vendor: order.vendorName,
            })}
            confirmLabel={t("grower.orders.cancelConfirm")}
            action={cancelOrder.bind(null, order.id)}
            trigger={
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                aria-label={t("grower.orders.cancel")}
              >
                <X />
              </Button>
            }
          />
        </div>
      )}
    </li>
  )
}

function AddOrderButton({ item }: { item: SubmitRow }) {
  const t = useT()
  if (item.vendorOptions.length === 0) {
    return (
      <span className="text-xs text-muted-foreground">
        {t("grower.orders.noVendors")}
      </span>
    )
  }
  // Not an edit — `values` only seeds the unit display from the item's UOM.
  const fields: Field[] = [
    { name: "itemId", type: "hidden", placeholder: item.itemId },
    {
      name: "vendorId",
      label: t("grower.orders.vendor"),
      type: "select",
      required: true,
      placeholder: t("grower.orders.vendorPh"),
      colSpan: 2,
      options: item.vendorOptions.map((v) => ({
        label: v.name,
        value: String(v.id),
      })),
    },
    {
      name: "quantity",
      label: t("grower.orders.quantity"),
      type: "number",
      required: true,
      step: "any",
    },
    {
      // The item's own unit: displayed for context, never chosen here. The
      // server re-reads it from the item, so this field is purely informational.
      name: "unitOfMeasure",
      label: t("grower.orders.unit"),
      type: "text",
      readOnly: true,
    },
    {
      name: "expectedDeliveryDate",
      label: t("grower.orders.expectedDelivery"),
      type: "date",
      colSpan: 2,
    },
  ]
  return (
    <EntityFormDialog
      title={t("grower.orders.addTitle")}
      description={`${item.itemName} · ${item.itemId}`}
      fields={fields}
      action={createOrder}
      submitLabel={t("grower.orders.add")}
      values={{ vendorId: "", quantity: "", unitOfMeasure: item.uom ?? "—", expectedDeliveryDate: "" }}
      trigger={
        <Button type="button" variant="outline" size="xs">
          <Plus className="size-3.5" /> {t("grower.orders.add")}
        </Button>
      }
    />
  )
}

// <input type="date"> wants a YYYY-MM-DD value; slice it off the stored ISO.
function toDateInput(iso: string | null): string {
  return iso ? iso.slice(0, 10) : ""
}

function EditDeliveryButton({ order }: { order: OrderView }) {
  const t = useT()
  const fields: Field[] = [
    {
      name: "expectedDeliveryDate",
      label: t("grower.orders.expectedDelivery"),
      type: "date",
      colSpan: 2,
    },
  ]
  return (
    <EntityFormDialog
      title={t("grower.orders.editDeliveryTitle")}
      description={`${order.vendorName} · ${order.quantity} ${order.uom ?? ""}`}
      fields={fields}
      action={updateOrderDelivery}
      submitLabel={t("common.save")}
      values={{ id: order.id, expectedDeliveryDate: toDateInput(order.expectedDeliveryDate) }}
      trigger={
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label={t("grower.orders.editDelivery")}
        >
          <Pencil />
        </Button>
      }
    />
  )
}

const MESSAGE_STYLES: Record<string, string> = {
  info: "border-sky-500/30 bg-sky-500/10 text-sky-800 dark:text-sky-300",
  warning: "border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-300",
  critical: "border-red-500/30 bg-red-500/10 text-red-800 dark:text-red-300",
}

// A single admin notice shown under an item. The type label is localized; the
// optional free-text note is shown as the admin authored it.
function ItemMessageBanner({ message }: { message: ItemMessageView }) {
  const t = useT()
  return (
    <div
      className={cn(
        "flex items-start gap-2 rounded-md border px-3 py-2 text-sm",
        MESSAGE_STYLES[message.severity] ?? MESSAGE_STYLES.info
      )}
    >
      <Megaphone className="mt-0.5 size-4 shrink-0" />
      <div className="min-w-0">
        <span className="font-medium">{t(`itemMessage.type.${message.type}`)}</span>
        {message.body ? <span> — {message.body}</span> : null}
      </div>
    </div>
  )
}
