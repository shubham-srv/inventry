import { requireUser } from "@/lib/auth/session"
import { getNavForUser } from "@/lib/nav"
import { getNavCounts } from "@/lib/admin/nav-counts"
import { getT } from "@/lib/i18n/server"
import { AppSidebar } from "@/components/app-sidebar"
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar"
import { Separator } from "@/components/ui/separator"
import { ThemeToggle } from "@/components/theme-toggle"
import { LanguageSwitcher } from "@/components/language-switcher"
import { UserMenu } from "@/components/user-menu"

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const user = await requireUser()
  const t = await getT()
  const sections = getNavForUser(user.roleName)
  const navCounts = await getNavCounts(user.roleName)
  const roleLabel = t(`common.roles.${user.roleName}`)
  const contextLabel = user.growerName
    ? `${t("common.grower")} · ${user.growerName}`
    : user.vendorName
      ? `${t("common.vendor")} · ${user.vendorName}`
      : roleLabel

  return (
    // overflow-x-clip: never allow page-level horizontal scroll; wide tables
    // scroll inside their own overflow-x-auto containers instead. This lives on
    // the app wrapper (NOT html/body) on purpose — `overflow: clip` makes its
    // element a containing block for `position: fixed` descendants, and putting
    // it on <body> trapped Radix's fixed-positioned portalled menus, mis-placing
    // them once the page was scrolled. The Radix portal mounts as a direct child
    // of <body>, so it escapes this wrapper and positions against the viewport.
    <SidebarProvider className="overflow-x-clip">
      <AppSidebar sections={sections} counts={navCounts} />
      {/* min-w-0: without it this flex item grows past the viewport when a table is wide → page-level horizontal scroll on mobile */}
      <SidebarInset className="min-w-0">
        <header className="bg-background sticky top-0 z-30 flex h-14 items-center gap-2 border-b px-4">
          <SidebarTrigger />
          <Separator orientation="vertical" className="h-5" />
          <span className="text-muted-foreground hidden text-sm sm:inline">
            {contextLabel}
          </span>
          <div className="ml-auto flex items-center gap-1">
            <LanguageSwitcher />
            <ThemeToggle />
            <UserMenu
              firstName={user.firstName}
              lastName={user.lastName}
              email={user.email}
              roleLabel={roleLabel}
              contextLabel={contextLabel}
            />
          </div>
        </header>
        <main className="flex-1 p-4 md:p-6">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  )
}
