"use client"

import * as React from "react"
import { ChevronsUpDown, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"

export type MultiSelectOption = { label: string; value: string }

/**
 * A popover checkbox list for selecting multiple values. Controlled: `value`
 * holds the selected option values, `onChange` receives the next selection.
 * Purely presentational — parents post the selection via a hidden input.
 */
export function MultiSelect({
  options,
  value,
  onChange,
  placeholder = "Select…",
  searchPlaceholder = "Search…",
  emptyText = "No options.",
  id,
  invalid,
}: {
  options: MultiSelectOption[]
  value: string[]
  onChange: (next: string[]) => void
  placeholder?: string
  searchPlaceholder?: string
  emptyText?: string
  id?: string
  invalid?: boolean
}) {
  const [open, setOpen] = React.useState(false)
  const [query, setQuery] = React.useState("")

  const selected = new Set(value)
  const labelByValue = React.useMemo(
    () => new Map(options.map((o) => [o.value, o.label])),
    [options]
  )
  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return options
    return options.filter((o) => o.label.toLowerCase().includes(q))
  }, [options, query])

  function toggle(v: string) {
    if (selected.has(v)) onChange(value.filter((x) => x !== v))
    else onChange([...value, v])
  }

  return (
    // modal: this popover often lives inside a Dialog, whose scroll-lock
    // (react-remove-scroll) blocks wheel/touch scrolling on anything outside
    // the dialog's DOM subtree — and the popover is portalled to <body>. A
    // modal popover mounts its own scroll-lock on top of the stack, which
    // whitelists this content so the list scrolls with the wheel again.
    <Popover open={open} onOpenChange={setOpen} modal>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          id={id}
          aria-invalid={invalid}
          className="h-auto min-h-9 w-full justify-between px-3 py-1.5 font-normal"
        >
          <span className="flex flex-1 flex-wrap gap-1 overflow-hidden">
            {value.length === 0 ? (
              <span className="text-muted-foreground">{placeholder}</span>
            ) : (
              value.map((v) => (
                <Badge key={v} variant="secondary" className="gap-1">
                  {labelByValue.get(v) ?? v}
                  <span
                    role="button"
                    tabIndex={-1}
                    aria-label={`Remove ${labelByValue.get(v) ?? v}`}
                    className="hover:text-destructive"
                    onClick={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      toggle(v)
                    }}
                  >
                    <X className="size-3" />
                  </span>
                </Badge>
              ))
            )}
          </span>
          <ChevronsUpDown className="size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-(--radix-popover-trigger-width) p-0"
        align="start"
      >
        <div className="p-2">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={searchPlaceholder}
            className="h-8"
          />
        </div>
        {/* Plain scroll container: a Radix ScrollArea constrained only by
            max-height doesn't clip (its height:100% viewport can't resolve
            against a max-height-only parent), so the list would overflow the
            popover. max-h + overflow-y-auto caps and scrolls reliably. */}
        <div className="max-h-56 overflow-y-auto p-1">
          {filtered.length === 0 ? (
            <p className="text-muted-foreground px-2 py-4 text-center text-xs">
              {emptyText}
            </p>
          ) : (
            filtered.map((o) => (
              <label
                key={o.value}
                className={cn(
                  "flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm",
                  "hover:bg-muted"
                )}
              >
                <Checkbox
                  checked={selected.has(o.value)}
                  onCheckedChange={() => toggle(o.value)}
                />
                <span className="flex-1">{o.label}</span>
              </label>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
