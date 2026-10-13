"use client"

import { startTransition, useActionState, useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { format, startOfDay } from "date-fns"
import { toast } from "sonner"
import { Plus } from "lucide-react"
import { createOrder } from "@/lib/actions/orders"
import { initialActionState } from "@/lib/actions/types"
import { earliestDelivery, parseDay, toDayInput } from "@/lib/orders/dates"
import { type VendorOption } from "@/lib/grower/data"
import { useT } from "@/lib/i18n/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

/**
 * New order for one item. Its own dialog (not EntityFormDialog) because the
 * requested-delivery limit is live: order date + the chosen vendor's minimum
 * lead time, recomputed as either changes. The server re-checks the same rule
 * (lib/orders/dates.ts), so the picker is a convenience, not the guard.
 */
export function OrderFormDialog({
  itemId,
  itemName,
  categoryName,
  vendors,
}: {
  itemId: string
  itemName: string
  categoryName: string | null
  vendors: VendorOption[]
}) {
  const t = useT()
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [state, formAction, pending] = useActionState(createOrder, initialActionState)
  const handled = useRef(false)

  const today = toDayInput(new Date())
  const [vendorId, setVendorId] = useState("")
  const [orderDate, setOrderDate] = useState(today)
  const [requested, setRequested] = useState("")

  const vendor = vendors.find((v) => String(v.id) === vendorId)
  const orderDay = parseDay(orderDate) ?? startOfDay(new Date())
  const earliest = earliestDelivery(orderDay, vendor?.leadTimeDays)
  const minRequested = toDayInput(earliest)

  // Keep the requested date valid as the limit moves: fill it once a vendor is
  // picked, and pull it forward if it falls below the new earliest day.
  useEffect(() => {
    if (!vendor) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRequested((r) => (!r || r < minRequested ? minRequested : r))
  }, [vendor, minRequested])

  useEffect(() => {
    if (open) {
      handled.current = false
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setVendorId("")
      setOrderDate(toDayInput(new Date()))
      setRequested("")
    }
  }, [open])

  useEffect(() => {
    if (state.ok && !handled.current) {
      handled.current = true
      toast.success(state.message ?? t("grower.orders.actions.created"))
      setOpen(false)
      router.refresh()
    }
  }, [state, router, t])

  // Dispatched by hand: a plain form action would reset the typed fields on error.
  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    startTransition(() => formAction(fd))
  }

  const err = (name: string) => state.fieldErrors?.[name]?.[0]

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="xs">
          <Plus className="size-3.5" /> {t("grower.orders.add")}
        </Button>
      </DialogTrigger>
      {open && (
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("grower.orders.addTitle")}</DialogTitle>
            <DialogDescription>{`${itemName} · ${itemId}`}</DialogDescription>
          </DialogHeader>
          <form onSubmit={onSubmit} className="grid gap-4">
            <input type="hidden" name="itemId" value={itemId} />
            <input type="hidden" name="vendorId" value={vendorId} />

            <div>
              <Label htmlFor="order-vendor" className="mb-1.5">
                {t("grower.orders.vendor")}
                <span className="text-destructive">*</span>
              </Label>
              <Select value={vendorId} onValueChange={setVendorId}>
                <SelectTrigger id="order-vendor" className="w-full" aria-invalid={!!err("vendorId")}>
                  <SelectValue placeholder={t("grower.orders.vendorPh")} />
                </SelectTrigger>
                <SelectContent>
                  {vendors.map((v) => (
                    <SelectItem key={v.id} value={String(v.id)}>
                      {v.leadTimeDays
                        ? t("grower.orders.vendorWithLead", { vendor: v.name, days: v.leadTimeDays })
                        : v.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {err("vendorId") && <p className="text-destructive mt-1 text-xs">{err("vendorId")}</p>}
            </div>

            <div>
              <Label htmlFor="order-qty" className="mb-1.5">
                {categoryName ? `${t("grower.orders.quantity")} (${categoryName})` : t("grower.orders.quantity")}
                <span className="text-destructive">*</span>
              </Label>
              <Input id="order-qty" name="quantity" type="number" step="any" min="0" required aria-invalid={!!err("quantity")} />
              {err("quantity") && <p className="text-destructive mt-1 text-xs">{err("quantity")}</p>}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="order-date" className="mb-1.5">
                  {t("grower.orders.orderDate")}
                  <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="order-date"
                  name="orderDate"
                  type="date"
                  required
                  max={today}
                  value={orderDate}
                  onChange={(e) => setOrderDate(e.target.value)}
                  aria-invalid={!!err("orderDate")}
                />
                <p className="text-muted-foreground mt-1 text-xs">{t("grower.orders.orderDateHint")}</p>
                {err("orderDate") && <p className="text-destructive mt-1 text-xs">{err("orderDate")}</p>}
              </div>
              <div>
                <Label htmlFor="order-requested" className="mb-1.5">
                  {t("grower.orders.requestedDelivery")}
                  <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="order-requested"
                  name="expectedDeliveryDate"
                  type="date"
                  required
                  min={minRequested}
                  value={requested}
                  onChange={(e) => setRequested(e.target.value)}
                  aria-invalid={!!err("expectedDeliveryDate")}
                />
                {vendor?.leadTimeDays ? (
                  <p className="text-muted-foreground mt-1 text-xs">
                    {t("grower.orders.leadTimeHint", {
                      vendor: vendor.name,
                      days: vendor.leadTimeDays,
                      date: format(earliest, "MMM d"),
                    })}
                  </p>
                ) : null}
                {err("expectedDeliveryDate") && (
                  <p className="text-destructive mt-1 text-xs">{err("expectedDeliveryDate")}</p>
                )}
              </div>
            </div>

            {state.message && !state.ok && <p className="text-destructive text-sm">{state.message}</p>}

            <DialogFooter>
              <Button type="submit" disabled={pending || !vendorId}>
                {pending ? t("common.saving") : t("grower.orders.add")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      )}
    </Dialog>
  )
}
