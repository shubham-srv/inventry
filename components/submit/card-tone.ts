/**
 * Shared card styling for the grower/vendor submit and history lists.
 *
 * Why this exists at all: `Card` (components/ui/card.tsx) draws its edge with
 * `ring-1 ring-foreground/10` and never sets a border *width*. Tailwind v4's
 * preflight resets every element to `border: 0 solid`, so the state classes the
 * submit forms used to carry — `border-emerald-500/40`, `border-amber-500/40` —
 * were colour-only and rendered nothing: a submitted card and an untouched one
 * were pixel-identical. Anything here that carries colour also carries width.
 *
 * The second problem is separation. In light mode `--card` (oklch 1) sits 0.8%
 * off `--background` (oklch 0.992), so a 10%-alpha hairline was the only thing
 * between two stacked cards. Hence the stronger ring and the shadow.
 *
 * Plain string helpers rather than a wrapper component: the two forms have very
 * different bodies and only the shell is shared. Follows the same instinct as
 * submit-list-controls.tsx — share the common part, leave the rest alone.
 */

/** Left-rail colour = the row's state. `neutral` is "nothing entered yet". */
export type CardTone = "neutral" | "done" | "draft" | "error"

const TONE: Record<CardTone, string> = {
  neutral: "border-l-border ring-foreground/15",
  done: "border-l-emerald-500 ring-emerald-500/30",
  draft: "border-l-amber-500 ring-amber-500/30",
  error: "border-l-destructive ring-destructive/40",
}

/**
 * One item row on a submit page.
 *
 * The rail is always 4px, so switching tone never reflows the card. `ring-1`
 * repeats deliberately — it re-states the width next to the colour so
 * tailwind-merge resolves both against the primitive's `ring-1 ring-foreground/10`.
 * `focus-within` is the one that earns its keep day to day: on a list of eighty
 * items, the card you are typing into should be obvious.
 */
export function itemCardClass(tone: CardTone): string {
  return [
    "border-l-4 ring-1 shadow-sm transition-shadow",
    "hover:shadow-md",
    "focus-within:ring-2 focus-within:ring-ring/50 focus-within:shadow-md",
    TONE[tone],
  ].join(" ")
}

/** One submission on a history page. No state — history is read-only. */
export function submissionCardClass(): string {
  return "border-l-4 border-l-border ring-1 ring-foreground/15 shadow-sm"
}
