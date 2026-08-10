"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"

export type Tab = { href: string; label: string; badge?: number }

/**
 * Route-based tab bar. Each tab is a real page, so filters and pagination stay
 * in that tab's own URL and the browser back button behaves.
 */
export function TabNav({ tabs }: { tabs: Tab[] }) {
  const pathname = usePathname()
  return (
    <nav className="border-b" aria-label="Sections">
      <ul className="-mb-px flex flex-wrap gap-1">
        {tabs.map((t) => {
          const active = pathname === t.href || pathname.startsWith(t.href + "/")
          return (
            <li key={t.href}>
              <Link
                href={t.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "inline-flex items-center gap-2 border-b-2 px-3 py-2 text-sm font-medium transition-colors",
                  active
                    ? "border-primary text-foreground"
                    : "text-muted-foreground hover:border-muted-foreground/30 hover:text-foreground border-transparent"
                )}
              >
                {t.label}
                {t.badge != null && t.badge > 0 && (
                  <span className="bg-muted text-muted-foreground rounded-full px-1.5 py-0.5 text-[10px] tabular-nums">
                    {t.badge}
                  </span>
                )}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
