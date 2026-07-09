"use client"

import * as React from "react"
import { useActionState, useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { MultiSelect } from "@/components/ui/multi-select"
import { type ActionState, initialActionState } from "@/lib/actions/types"
import { useT } from "@/lib/i18n/client"

export type FieldType =
  | "text"
  | "number"
  | "date"
  | "textarea"
  | "select"
  | "multiselect"
  | "switch"
  | "hidden"

export type Field = {
  name: string
  label?: string
  type: FieldType
  options?: { label: string; value: string }[]
  required?: boolean
  placeholder?: string
  description?: string
  step?: string
  lockOnEdit?: boolean // disabled when editing (e.g. id/code)
  colSpan?: 1 | 2
}

type Props = {
  title: string
  description?: string
  fields: Field[]
  action: (prev: ActionState, fd: FormData) => Promise<ActionState>
  values?: Record<string, unknown>
  trigger: React.ReactNode
  submitLabel?: string
}

export function EntityFormDialog({
  title,
  description,
  fields,
  action,
  values,
  trigger,
  submitLabel,
}: Props) {
  const t = useT()
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [state, formAction, pending] = useActionState(action, initialActionState)
  const handled = useRef(false)

  // Local state for controlled inputs (select / multiselect / switch) so they
  // post via hidden fields. Multiselect is stored as a comma-joined string.
  const initControlled: Record<string, string> = {}
  for (const f of fields) {
    if (f.type === "select" || f.type === "switch" || f.type === "multiselect") {
      const v = values?.[f.name]
      initControlled[f.name] =
        f.type === "switch"
          ? String(v ?? false)
          : f.type === "multiselect"
            ? Array.isArray(v)
              ? v.map(String).join(",")
              : v != null
                ? String(v)
                : ""
            : v != null
              ? String(v)
              : ""
    }
  }
  const [controlled, setControlled] = useState(initControlled)

  useEffect(() => {
    if (open) {
      handled.current = false
      // Reset controlled fields each time the dialog opens.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setControlled(initControlled)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  useEffect(() => {
    if (state.ok && !handled.current) {
      handled.current = true
      toast.success(state.message ?? "Saved")
      setOpen(false)
      router.refresh()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state])

  const isEdit = !!values

  const hasIdField = fields.some((f) => f.name === "id")

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {/*
        `trigger` is a React element created in a Server Component (the page) and
        passed across the RSC boundary. Radix's DialogTrigger uses `asChild`,
        which runs React.Children.only() on its child. Once this dialog's other
        serialized props (notably `values`) are large enough, React streams the
        `trigger` element as a deferred reference, so Children.only() no longer
        sees a single plain element and throws
        ("Primitive.button failed to slot onto its children"). Wrapping it in a
        client-created element (this span, display:contents so it's layout-inert)
        gives the Slot a stable single child and sidesteps the issue. Do not
        inline `{trigger}` back into DialogTrigger.
      */}
      <DialogTrigger asChild>
        <span className="contents">{trigger}</span>
      </DialogTrigger>
      {/* Render content lazily so heavy form controls never render until opened. */}
      {open && (
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>

        <form action={formAction} className="grid gap-4 sm:grid-cols-2">
          {/* Auto-include the primary key for edits when not an explicit field. */}
          {!hasIdField && values?.id != null && (
            <input type="hidden" name="id" value={String(values.id)} />
          )}
          {fields.map((f) => {
            if (f.type === "hidden") {
              return (
                <input
                  key={f.name}
                  type="hidden"
                  name={f.name}
                  defaultValue={String(values?.[f.name] ?? f.placeholder ?? "")}
                />
              )
            }
            const err = state.fieldErrors?.[f.name]?.[0]
            const span = f.colSpan ?? (f.type === "textarea" ? 2 : 1)
            return (
              <div
                key={f.name}
                className={span === 2 ? "sm:col-span-2" : "sm:col-span-1"}
              >
                {f.label && (
                  <Label htmlFor={f.name} className="mb-1.5">
                    {f.label}
                    {f.required && <span className="text-destructive">*</span>}
                  </Label>
                )}

                {f.type === "text" || f.type === "number" || f.type === "date" ? (
                  <Input
                    id={f.name}
                    name={f.name}
                    type={f.type}
                    step={f.step}
                    required={f.required}
                    placeholder={f.placeholder}
                    defaultValue={String(values?.[f.name] ?? "")}
                    disabled={isEdit && f.lockOnEdit}
                    aria-invalid={!!err}
                  />
                ) : f.type === "textarea" ? (
                  <Textarea
                    id={f.name}
                    name={f.name}
                    required={f.required}
                    placeholder={f.placeholder}
                    defaultValue={String(values?.[f.name] ?? "")}
                    aria-invalid={!!err}
                  />
                ) : f.type === "select" ? (
                  <>
                    <input type="hidden" name={f.name} value={controlled[f.name] ?? ""} />
                    <Select
                      value={controlled[f.name] ?? ""}
                      onValueChange={(v) =>
                        setControlled((c) => ({ ...c, [f.name]: v }))
                      }
                    >
                      <SelectTrigger id={f.name} aria-invalid={!!err} className="w-full">
                        <SelectValue placeholder={f.placeholder ?? t("common.select")} />
                      </SelectTrigger>
                      <SelectContent>
                        {f.options?.map((o) => (
                          <SelectItem key={o.value} value={o.value}>
                            {o.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </>
                ) : f.type === "multiselect" ? (
                  <>
                    <input type="hidden" name={f.name} value={controlled[f.name] ?? ""} />
                    <MultiSelect
                      id={f.name}
                      invalid={!!err}
                      options={f.options ?? []}
                      placeholder={f.placeholder}
                      value={(controlled[f.name] ?? "").split(",").filter(Boolean)}
                      onChange={(next) =>
                        setControlled((c) => ({ ...c, [f.name]: next.join(",") }))
                      }
                    />
                  </>
                ) : f.type === "switch" ? (
                  <div className="flex h-9 items-center gap-2">
                    <input
                      type="hidden"
                      name={f.name}
                      value={controlled[f.name] === "true" ? "true" : "false"}
                    />
                    <Switch
                      id={f.name}
                      checked={controlled[f.name] === "true"}
                      onCheckedChange={(v) =>
                        setControlled((c) => ({ ...c, [f.name]: String(v) }))
                      }
                    />
                    <span className="text-muted-foreground text-sm">
                      {controlled[f.name] === "true" ? "Yes" : "No"}
                    </span>
                  </div>
                ) : null}

                {f.description && (
                  <p className="text-muted-foreground mt-1 text-xs">{f.description}</p>
                )}
                {err && <p className="text-destructive mt-1 text-xs">{err}</p>}
              </div>
            )
          })}

          {state.message && !state.ok && (
            <p className="text-destructive sm:col-span-2 text-sm">{state.message}</p>
          )}

          <DialogFooter className="sm:col-span-2">
            <Button type="submit" disabled={pending}>
              {pending ? t("common.saving") : (submitLabel ?? t("common.save"))}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
      )}
    </Dialog>
  )
}
