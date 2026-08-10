import Image from "next/image"
import { prisma } from "@/lib/db"
import { loginAs } from "@/lib/auth/dummy"
import { ROLES } from "@/lib/constants"
import { isInternal } from "@/lib/rbac"
import { getT } from "@/lib/i18n/server"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { LanguageSwitcher } from "@/components/language-switcher"
import { BrandLogo } from "@/components/brand-logo"

export default async function LoginPage() {
  const t = await getT()
  const users = await prisma.user.findMany({
    where: { isActive: true },
    include: { role: true, grower: true, vendor: true },
    orderBy: [{ roleId: "asc" }, { firstName: "asc" }],
  })

  const internal = users.filter((u) => isInternal(u.role.roleName as never))
  const growers = users.filter((u) => u.role.roleName === ROLES.GROWER_USER)
  const vendors = users.filter((u) => u.role.roleName === ROLES.VENDOR_USER)

  const groups = [
    { label: t("login.internalUsers"), description: t("login.internalDesc"), users: internal },
    { label: t("login.growers"), description: t("login.growersDesc"), users: growers },
    { label: t("login.vendors"), description: t("login.vendorsDesc"), users: vendors },
  ]

  return (
    <div className="relative flex min-h-svh flex-col items-center px-4 py-10">
      {/* Brand background. `fill` + object-cover so it works at any viewport, and
          a scrim above it so the user cards stay readable over a busy image.
          The source is 7001×4001 / 1.6 MB — Next resizes it per viewport, and
          public/login-bg.webp is the pre-optimised copy actually referenced. */}
      <Image
        src="/login-bg.webp"
        alt=""
        aria-hidden
        fill
        priority
        sizes="100vw"
        className="object-cover"
      />
      <div className="bg-background/85 absolute inset-0 backdrop-blur-[2px]" aria-hidden />

      <div className="absolute top-4 right-4 z-10">
        <LanguageSwitcher />
      </div>
      <div className="relative z-10 w-full max-w-3xl">
        <div className="mb-8 flex flex-col items-center text-center">
          <BrandLogo width={200} priority className="mb-4" />
          <h1 className="text-2xl font-semibold tracking-tight">{t("login.title")}</h1>
          <p className="text-muted-foreground mt-1 text-sm">{t("login.subtitle")}</p>
        </div>

        <div className="space-y-8">
          {groups.map((group) => (
            <section key={group.label}>
              <div className="mb-3">
                <h2 className="text-sm font-medium">{group.label}</h2>
                <p className="text-muted-foreground text-xs">{group.description}</p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {group.users.map((user) => {
                  const context =
                    user.grower?.growerName ?? user.vendor?.vendorName ?? t("login.internalUsers")
                  const initials =
                    `${user.firstName[0] ?? ""}${user.lastName[0] ?? ""}`.toUpperCase()
                  return (
                    <form key={user.id} action={loginAs.bind(null, user.id)}>
                      <button
                        type="submit"
                        className="bg-card hover:border-primary/50 hover:bg-accent/50 flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-colors"
                      >
                        <Avatar className="size-10">
                          <AvatarFallback>{initials}</AvatarFallback>
                        </Avatar>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="truncate text-sm font-medium">
                              {user.firstName} {user.lastName}
                            </span>
                            <Badge variant="secondary" className="text-[10px]">
                              {t(`common.roles.${user.role.roleName}`)}
                            </Badge>
                          </div>
                          <div className="text-muted-foreground truncate text-xs">
                            {context} · {user.email}
                          </div>
                        </div>
                      </button>
                    </form>
                  )
                })}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  )
}
