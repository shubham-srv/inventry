"use client"

import Link from "next/link"
import { useLinkStatus } from "next/link"
import { usePathname } from "next/navigation"
import {
  Home,
  Loader2,
  ClipboardList,
  Truck,
  History,
  Inbox,
  Package,
  Leaf,
  Layers,
  List,
  MapPin,
  Globe,
  Sprout,
  Store,
  ShieldCheck,
  Users,
  Ruler,
  BarChart3,
  CalendarClock,
  Gauge,
  ScrollText,
  Mail,
  TriangleAlert,
  Megaphone,
  type LucideIcon,
} from "lucide-react"

import { BrandLogo } from "@/components/brand-logo"
import { type NavSection, type NavCounts } from "@/lib/nav"
import { useT } from "@/lib/i18n/client"
import { cn } from "@/lib/utils"
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"

const ICONS: Record<string, LucideIcon> = {
  home: Home,
  clipboard: ClipboardList,
  truck: Truck,
  history: History,
  inbox: Inbox,
  package: Package,
  leaf: Leaf,
  layers: Layers,
  list: List,
  mapPin: MapPin,
  globe: Globe,
  sprout: Sprout,
  store: Store,
  shieldCheck: ShieldCheck,
  users: Users,
  ruler: Ruler,
  barChart: BarChart3,
  calendarClock: CalendarClock,
  gauge: Gauge,
  scrollText: ScrollText,
  mail: Mail,
  triangleAlert: TriangleAlert,
  megaphone: Megaphone,
}

/**
 * A nav link that shows a spinner while its page is being fetched.
 *
 * `useLinkStatus` reports the pending state of the enclosing <Link>, which is
 * the only feedback a user gets between clicking and the new page painting —
 * on a slow connection there was previously nothing at all.
 */
function NavLinkContent({
  Icon,
  label,
  badge,
  tone,
}: {
  Icon: LucideIcon
  label: string
  badge?: number
  tone?: "action" | "info"
}) {
  const { pending } = useLinkStatus()
  return (
    <>
      {pending ? <Loader2 className="animate-spin" /> : <Icon />}
      <span>{label}</span>
      {badge != null && badge > 0 && (
        <SidebarMenuBadge
          className={cn(
            tone === "action" &&
              "bg-amber-500/15 text-amber-700 dark:text-amber-400"
          )}
        >
          {badge}
        </SidebarMenuBadge>
      )}
    </>
  )
}

export function AppSidebar({
  sections,
  counts = {},
}: {
  sections: NavSection[]
  counts?: NavCounts
}) {
  const pathname = usePathname()
  const t = useT()

  return (
    <Sidebar>
      <SidebarHeader>
        {/* The wordmark carries the brand, so the app name sits under it as a
            quiet subtitle rather than competing with it. */}
        <div className="flex flex-col gap-1 px-2 py-1.5">
          <BrandLogo width={132} priority />
          <span className="text-muted-foreground text-xs">{t("common.appTagline")}</span>
        </div>
      </SidebarHeader>

      <SidebarContent>
        {sections.map((section) => (
          <SidebarGroup key={section.label}>
            <SidebarGroupLabel>{t(section.label)}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {section.items.map((item) => {
                  const Icon = ICONS[item.icon] ?? Home
                  const active =
                    pathname === item.href ||
                    (item.href !== "/admin" &&
                      item.href !== "/grower" &&
                      item.href !== "/vendor" &&
                      pathname.startsWith(item.href))
                  return (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton asChild isActive={active} tooltip={t(item.title)}>
                        <Link href={item.href}>
                          <NavLinkContent
                            Icon={Icon}
                            label={t(item.title)}
                            badge={item.badge ? counts[item.badge] : undefined}
                            tone={item.badgeTone}
                          />
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  )
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>
    </Sidebar>
  )
}
