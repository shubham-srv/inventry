import Image from "next/image"
import { AlertCircle } from "lucide-react"
import { prisma } from "@/lib/db"
import { loginAs } from "@/lib/auth/dummy"
import { isDemoLoginEnabled } from "@/lib/auth/demo-gate"
import { isLoginError } from "@/lib/auth/errors"
import { ROLES } from "@/lib/constants"
import { isInternal } from "@/lib/rbac"
import { getT } from "@/lib/i18n/server"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { LanguageSwitcher } from "@/components/language-switcher"
import { BrandLogo } from "@/components/brand-logo"
import { MagicLinkForm } from "@/components/auth/magic-link-form"

/**
 * TWO AUDIENCES, TWO MECHANISMS:
 *
 *   Internal staff (SuperAdmin / InternalAdmin / Editor)
 *     -> "Sign in with Microsoft" -> /api/auth/login -> Entra -> callback
 *
 *   External users (growers & vendors)
 *     -> email box -> /api/auth/magic/request -> 15-min single-use link
 *
 * Both converge on the SAME createSession(user.id), so nothing downstream —
 * roles, capabilities, grower/vendor data isolation — knows or needs to know
 * which door someone came through.
 *
 * WHY BOTH ON ONE PAGE. Growers do not have accounts in the client's tenant, and
 * staff should not be emailed links they do not need. Splitting them across two
 * URLs means telling every user which one is theirs; one page with two clearly
 * labelled routes does not. The Microsoft button comes first because internal
 * staff sign in far more often.
 *
 * NO ACCOUNT ENUMERATION. Neither path reveals whether an address is registered:
 * `requestLink` answers the same either way, and this page never checks the
 * database for it. Do not "improve" that by validating the email against User
 * first — it would hand an attacker the customer list.
 *
 * The demo picker below is development-only; see lib/auth/demo-gate.ts.
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const t = await getT()
  const params = await searchParams

  const rawError = Array.isArray(params.error) ? params.error[0] : params.error
  const error = isLoginError(rawError) ? rawError : null

  // Only same-origin paths survive; the proxy sets this when it bounces an
  // unauthenticated deep link here.
  const rawReturn = Array.isArray(params.returnTo) ? params.returnTo[0] : params.returnTo
  const returnTo =
    rawReturn && rawReturn.startsWith("/") && !rawReturn.startsWith("//") ? rawReturn : ""

  const signInHref = returnTo
    ? `/api/auth/login?returnTo=${encodeURIComponent(returnTo)}`
    : "/api/auth/login"

  const demoEnabled = isDemoLoginEnabled()

  return (
    <div className="relative flex min-h-svh flex-col items-center px-4 py-10">
      {/* Brand background. `fill` + object-cover so it works at any viewport, and
          a scrim above it so the card stays readable over a busy image.
          public/login-bg.webp is the pre-optimised copy. */}
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

      <div className="relative z-10 flex w-full max-w-3xl flex-col items-center">
        <div className="mb-8 flex flex-col items-center text-center">
          <BrandLogo width={200} priority className="mb-4" />
          <h1 className="text-2xl font-semibold tracking-tight">{t("login.title")}</h1>
          <p className="text-muted-foreground mt-1 text-sm">{t("login.signInSubtitle")}</p>
        </div>

        <div className="w-full max-w-sm">
          {error && (
            <Alert variant="destructive" className="mb-4">
              <AlertCircle />
              <AlertTitle>{t("login.error.title")}</AlertTitle>
              <AlertDescription>{t(`login.error.${error}`)}</AlertDescription>
            </Alert>
          )}

          <div className="bg-card space-y-5 rounded-xl border p-6 shadow-sm">
            {/* A plain link, not a form: /api/auth/login is a GET that mints the
                state + PKCE verifier and redirects to Entra, and a form post
                would break the round-trip the callback validates. */}
            <Button asChild variant="default" className="w-full">
              <a href={signInHref}>
                {/* Inline mark rather than an <Image>: four solid squares, no
                    network request, and it cannot 404 in a locked-down tenant. */}
                <svg viewBox="0 0 23 23" aria-hidden className="size-4" fill="currentColor">
                  <path d="M0 0h11v11H0z" opacity=".9" />
                  <path d="M12 0h11v11H12z" opacity=".7" />
                  <path d="M0 12h11v11H0z" opacity=".7" />
                  <path d="M12 12h11v11H12z" opacity=".5" />
                </svg>
                {t("login.microsoft")}
              </a>
            </Button>

            <div className="flex items-center gap-3">
              <span className="bg-border h-px flex-1" />
              <span className="text-muted-foreground text-xs">{t("login.or")}</span>
              <span className="bg-border h-px flex-1" />
            </div>

            <MagicLinkForm />
          </div>

          <p className="text-muted-foreground mt-6 text-center text-xs">
            {t("login.accessHelp")}
          </p>
        </div>

        {demoEnabled && <DemoUserPicker />}
      </div>
    </div>
  )
}

/**
 * Development-only impersonation picker: lists every seeded user and signs in as
 * whoever you click, with no credential of any kind. Renders only when
 * isDemoLoginEnabled(); `loginAs` refuses independently, because a server action
 * is reachable whether or not a form for it is on screen.
 */
async function DemoUserPicker() {
  const t = await getT()
  const users = await prisma.user.findMany({
    where: { isActive: true },
    include: { role: true, grower: true, vendor: true },
    orderBy: [{ roleId: "asc" }, { firstName: "asc" }],
  })

  const groups = [
    {
      label: t("login.internalUsers"),
      description: t("login.internalDesc"),
      users: users.filter((u) => isInternal(u.role.roleName as never)),
    },
    {
      label: t("login.growers"),
      description: t("login.growersDesc"),
      users: users.filter((u) => u.role.roleName === ROLES.GROWER_USER),
    },
    {
      label: t("login.vendors"),
      description: t("login.vendorsDesc"),
      users: users.filter((u) => u.role.roleName === ROLES.VENDOR_USER),
    },
  ]

  return (
    <div className="mt-10 w-full">
      <div className="mb-6 flex items-center gap-3">
        <span className="bg-border h-px flex-1" />
        <Badge variant="outline" className="border-amber-500/40 bg-amber-500/10 text-[10px] font-medium tracking-wide text-amber-700 uppercase dark:text-amber-400">
          {t("login.demoOnly")}
        </Badge>
        <span className="bg-border h-px flex-1" />
      </div>
      <p className="text-muted-foreground mb-6 text-center text-xs">
        {t("login.demoDesc")}
      </p>

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
  )
}
