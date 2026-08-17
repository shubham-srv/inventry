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
  | "preview" // read-only, not posted: shows `pattern` filled from other fields

export type Field = {
  name: string
  label?: string
  type: FieldType
  // `parent` narrows a select to the value picked in `dependsOn` (see below).
  options?: { label: string; value: string; parent?: string }[]
  required?: boolean
  placeholder?: string
  description?: string
  step?: string
  min?: string // `number` inputs only — e.g. "0" to refuse negative day counts
  lockOnEdit?: boolean // read-only when editing (e.g. id/code) — still posted
  readOnly?: boolean // always read-only (e.g. a unit inherited from the item)
  colSpan?: 1 | 2
  /**
   * Name of the field this one reacts to. One parent, up to three effects,
   * each switched on by the presence of the prop that configures it:
   *
   *  1. FILTER — if any of this field's `options` carry a `parent`, only those
   *     matching the parent's current value are offered (e.g. sub-category
   *     filtered by category, growers filtered to those mapped to an item).
   *  2. PRESET — `presetFrom` seeds this field's value from the parent's, which
   *     is how a mapping dialog shows what is already mapped (see below).
   *  3. DERIVE — `derive` fills a read-only `preview` from the parent's value,
   *     e.g. showing the unit that belongs to the selected item.
   *
   * Empty-parent behaviour differs by the PARENT's type, deliberately:
   *  - parent is a `select`   -> offer nothing. "Pick a category first."
   *  - parent is a `multiselect` -> offer everything. Nothing ticked reads as
   *    "not filtering", not as "exclude all", which is what a user means when
   *    they clear the box.
   */
  dependsOn?: string
  /**
   * Parent value -> the values this field should hold when that parent is
   * chosen. Used by the mapping dialogs: picking a grower ticks the items it is
   * already authorized for, so the dialog edits the whole set rather than only
   * adding to it. Changing the parent replaces the selection wholesale — the
   * previous grower's ticks are meaningless for this one.
   */
  presetFrom?: Record<string, string[]>
  /**
   * `preview` fields only: parent value -> the text to display. For values that
   * are looked up rather than composed (an item's unit of measure), where
   * `pattern` cannot help because the text is not built from other fields.
   */
  derive?: Record<string, string>
  /**
   * `preview` fields only: a template whose `{fieldName}` placeholders are
   * replaced with the current values of those fields, e.g.
   * "{commodityCode}-{materialCategoryCode}-00013". Until every referenced
   * field has a value the `placeholder` is shown instead. Never posted.
   */
  pattern?: string
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

  /**
   * Options of a dependent field, narrowed to the parent's current value in
   * `state`. Takes the state explicitly so it can be run against a pending
   * update inside a setState callback, not just the committed render.
   */
  function optionsIn(state: Record<string, string>, f: Field) {
    const all = f.options ?? []
    if (!f.dependsOn) return all
    const parentField = fields.find((x) => x.name === f.dependsOn)
    const raw = state[f.dependsOn] ?? ""
    const picked = raw.split(",").filter(Boolean)
    if (picked.length === 0) {
      // See the `dependsOn` docs: an empty multiselect parent means "no filter".
      return parentField?.type === "multiselect" ? all : []
    }
    const matched = all.filter(
      (o) => o.parent === undefined || picked.includes(o.parent)
    )
    // A value can legitimately appear once per parent (one grower is mapped to
    // several items, so it is listed once per item). Collapse those.
    const seen = new Set<string>()
    return matched.filter((o) => !seen.has(o.value) && seen.add(o.value))
  }

  /**
   * Apply every dependent effect of `name` having just changed, mutating the
   * pending state in place.
   *
   * Children are PRUNED rather than cleared: dropping one category out of a
   * filter should remove that category's items from the selection and leave the
   * rest, whereas wiping the box would throw away work the user did not undo.
   * A `presetFrom` child is the exception — its whole point is to be replaced.
   */
  function applyDependents(next: Record<string, string>, name: string) {
    for (const f of fields) {
      if (f.dependsOn !== name) continue
      if (f.presetFrom) {
        next[f.name] = (f.presetFrom[next[name] ?? ""] ?? []).join(",")
        continue
      }
      const valid = new Set(optionsIn(next, f).map((o) => o.value))
      if (f.type === "multiselect") {
        next[f.name] = (next[f.name] ?? "")
          .split(",")
          .filter((v) => v && valid.has(v))
          .join(",")
      } else if (!valid.has(next[f.name] ?? "")) {
        next[f.name] = ""
      }
    }
  }

  function selectValue(name: string, value: string) {
    setControlled((c) => {
      const next = { ...c, [name]: value }
      applyDependents(next, name)
      return next
    })
  }

  function multiValue(name: string, values: string[]) {
    setControlled((c) => {
      const next = { ...c, [name]: values.join(",") }
      applyDependents(next, name)
      return next
    })
  }

  /**
   * Fill a preview pattern from the other fields' current values, or return
   * null while any of them is still empty.
   */
  function previewValue(f: Field): string | null {
    // A looked-up preview (`derive`) resolves straight off its parent; only the
    // composed kind walks a pattern.
    if (f.derive && f.dependsOn) {
      const parent = controlled[f.dependsOn] ?? ""
      return parent ? (f.derive[parent] ?? null) : null
    }
    const pattern = f.pattern ?? ""
    let complete = true
    const filled = pattern.replace(/\{(\w+)\}/g, (_m, name: string) => {
      const v = controlled[name] ?? String(values?.[name] ?? "")
      if (!v) complete = false
      return v
    })
    return complete ? filled : null
  }

  /** Options of a dependent field, narrowed against the committed state. */
  function optionsFor(f: Field) {
    return optionsIn(controlled, f)
  }

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
                  // A locked field is READ-ONLY, never `disabled`: disabled
                  // inputs are omitted from the FormData, which made every edit
                  // fail validation on its own primary key.
                  <Input
                    id={f.name}
                    name={f.name}
                    type={f.type}
                    step={f.step}
                    min={f.min}
                    required={f.required}
                    placeholder={f.placeholder}
                    defaultValue={String(values?.[f.name] ?? "")}
                    readOnly={f.readOnly || (isEdit && f.lockOnEdit)}
                    className={
                      f.readOnly || (isEdit && f.lockOnEdit)
                        ? "bg-muted text-muted-foreground cursor-not-allowed"
                        : undefined
                    }
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
                ) : f.type === "preview" ? (
                  // Display only — the value is derived, so nothing is posted.
                  <div className="bg-muted text-muted-foreground flex h-9 items-center rounded-md border px-3 font-mono text-sm">
                    {previewValue(f) ?? (
                      <span className="font-sans text-xs">{f.placeholder}</span>
                    )}
                  </div>
                ) : f.type === "select" ? (
                  <>
                    <input type="hidden" name={f.name} value={controlled[f.name] ?? ""} />
                    <Select
                      value={controlled[f.name] ?? ""}
                      onValueChange={(v) => selectValue(f.name, v)}
                      disabled={
                        (isEdit && f.lockOnEdit) ||
                        (!!f.dependsOn && !controlled[f.dependsOn])
                      }
                    >
                      <SelectTrigger id={f.name} aria-invalid={!!err} className="w-full">
                        <SelectValue placeholder={f.placeholder ?? t("common.select")} />
                      </SelectTrigger>
                      <SelectContent>
                        {optionsFor(f).map((o) => (
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
                    {/* optionsFor, not f.options — a multiselect can be filtered
                        by a parent just as a select can. */}
                    <MultiSelect
                      id={f.name}
                      invalid={!!err}
                      options={optionsFor(f)}
                      placeholder={f.placeholder}
                      value={(controlled[f.name] ?? "").split(",").filter(Boolean)}
                      onChange={(next) => multiValue(f.name, next)}
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
