// Pure navigation model derived from a user's role/capabilities.
// `title` and `label` are i18n dictionary keys, translated in
// components/app-sidebar.tsx; icons are resolved there by string key.
import { type RoleName } from "@/lib/constants"
import { CAPABILITIES, can, isGrower, isVendor } from "@/lib/rbac"

export type NavItem = { title: string; href: string; icon: string }
export type NavSection = { label: string; items: NavItem[] }

export function getNavForUser(roleName: RoleName): NavSection[] {
  if (isGrower(roleName)) {
    return [
      {
        label: "nav.sections.grower",
        items: [
          { title: "nav.dashboard", href: "/grower", icon: "home" },
          { title: "nav.submitInventory", href: "/grower/submit", icon: "clipboard" },
          { title: "nav.onOrder", href: "/grower/on-order", icon: "truck" },
          { title: "nav.history", href: "/grower/history", icon: "history" },
          { title: "nav.requests", href: "/grower/requests", icon: "inbox" },
        ],
      },
    ]
  }

  if (isVendor(roleName)) {
    return [
      {
        label: "nav.sections.vendor",
        items: [
          { title: "nav.dashboard", href: "/vendor", icon: "home" },
          { title: "nav.submitReport", href: "/vendor/submit", icon: "clipboard" },
          { title: "nav.history", href: "/vendor/history", icon: "history" },
        ],
      },
    ]
  }

  // Internal users (admin / editor)
  const sections: NavSection[] = [
    {
      label: "nav.sections.overview",
      items: [{ title: "nav.dashboard", href: "/admin", icon: "home" }],
    },
  ]

  if (can(roleName, CAPABILITIES.MANAGE_MASTER_DATA)) {
    sections.push({
      label: "nav.sections.masterData",
      items: [
        { title: "nav.items", href: "/admin/items", icon: "package" },
        { title: "nav.commodities", href: "/admin/commodities", icon: "leaf" },
        { title: "nav.categories", href: "/admin/categories", icon: "layers" },
        { title: "nav.subCategories", href: "/admin/sub-categories", icon: "list" },
        { title: "nav.locations", href: "/admin/locations", icon: "mapPin" },
      ],
    })
  }

  const partners: NavItem[] = []
  if (can(roleName, CAPABILITIES.MANAGE_GROWERS_VENDORS)) {
    partners.push(
      { title: "nav.growers", href: "/admin/growers", icon: "sprout" },
      { title: "nav.vendors", href: "/admin/vendors", icon: "store" },
      { title: "nav.authorizations", href: "/admin/authorizations", icon: "shieldCheck" },
      { title: "nav.itemRequests", href: "/admin/requests", icon: "inbox" }
    )
  }
  if (can(roleName, CAPABILITIES.MANAGE_USERS)) {
    partners.push({ title: "nav.users", href: "/admin/users", icon: "users" })
  }
  if (partners.length) {
    sections.push({ label: "nav.sections.partners", items: partners })
  }

  sections.push({
    label: "nav.sections.tools",
    items: [
      { title: "nav.conversions", href: "/admin/conversions", icon: "ruler" },
      { title: "nav.reports", href: "/admin/reports", icon: "barChart" },
    ],
  })

  if (can(roleName, CAPABILITIES.ACCESS_SETTINGS)) {
    sections.push({
      label: "nav.sections.settings",
      items: [
        { title: "nav.schedulers", href: "/admin/settings/schedulers", icon: "calendarClock" },
        { title: "nav.thresholds", href: "/admin/settings/thresholds", icon: "gauge" },
        { title: "nav.auditLogs", href: "/admin/settings/audit-logs", icon: "scrollText" },
        { title: "nav.outbox", href: "/admin/settings/outbox", icon: "mail" },
      ],
    })
  }

  return sections
}
