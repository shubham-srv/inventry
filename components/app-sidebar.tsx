"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  Home,
  ClipboardList,
  Truck,
  History,
  Inbox,
  Package,
  Leaf,
  Layers,
  List,
  MapPin,
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
  Boxes,
  type LucideIcon,
} from "lucide-react"

import { type NavSection } from "@/lib/nav"
import { useT } from "@/lib/i18n/client"
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
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

export function AppSidebar({ sections }: { sections: NavSection[] }) {
  const pathname = usePathname()
  const t = useT()

  return (
    <Sidebar>
      <SidebarHeader>
        <div className="flex items-center gap-2 px-2 py-1.5">
          <div className="bg-primary text-primary-foreground flex size-8 items-center justify-center rounded-lg">
            <Boxes className="size-5" />
          </div>
          <div className="flex flex-col leading-tight">
            <span className="text-sm font-semibold">{t("common.appName")}</span>
            <span className="text-muted-foreground text-xs">{t("common.appTagline")}</span>
          </div>
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
                          <Icon />
                          <span>{t(item.title)}</span>
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
