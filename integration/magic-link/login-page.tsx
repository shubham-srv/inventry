/**
 * REFERENCE — the PRODUCTION login page.
 *
 * This folder is excluded from the app build (tsconfig "exclude"), so this file
 * does nothing where it sits. Copy it over app/(auth)/login/page.tsx when you
 * are ready to switch off the demo user-picker — see integration/INTEGRATION.md
 * §"Switching on the production login page".
 *
 * It replaces the demo picker at app/(auth)/login/page.tsx, which lists every
 * seeded user and logs in as whoever you click. That page is fine locally and
 * catastrophic anywhere else, so the swap is the last step of going live.
 *
 * TWO AUDIENCES, TWO MECHANISMS — matching the split in INTEGRATION.md:
 *
 *   Internal staff (SuperAdmin / InternalAdmin / Editor)
 *     -> "Sign in with Microsoft" -> /api/auth/login -> Entra -> callback
 *
 *   External users (growers & vendors)
 *     -> email box -> /api/auth/magic/request -> 15-min single-use link
 *
 * Both paths converge on the SAME createSession(user.id) in lib/auth/session.ts,
 * so nothing downstream — roles, capabilities, grower/vendor data isolation —
 * changes or needs to know which door someone came through.
 *
 * WHY BOTH ON ONE PAGE. Growers do not have accounts in your tenant and staff
 * should not be emailed links they do not need. Splitting them across two URLs
 * means telling every user which one is theirs; one page with two clearly
 * labelled routes does not. The Microsoft button is placed first because
 * internal staff sign in far more often.
 *
 * NO ACCOUNT ENUMERATION. Neither path reveals whether an address is
 * registered: `requestLink` returns the same response either way, and this page
 * never checks the database. Do not "improve" it by validating the email
 * against User first — that hands an attacker your customer list.
 *
 * ---- Wiring checklist (details in INTEGRATION.md) --------------------------
 *   1. Add the MagicToken model (top of ./magic-link-routes.ts) + migrate
 *   2. Set MAGIC_LINK_SECRET, APP_URL, AZURE_AD_*, EMAIL_PROVIDER=acs, ACS_*
 *   3. Create the four route handlers re-exporting entra/auth-routes.ts and
 *      ./magic-link-routes.ts
 *   4. Copy this file to app/(auth)/login/page.tsx and this folder's
 *      magic-link-form.tsx to components/auth/magic-link-form.tsx
 *   5. Delete lib/auth/dummy.ts so the impersonation action cannot be reached
 * ---------------------------------------------------------------------------
 */
import Image from "next/image"
import { getT } from "@/lib/i18n/server"
import { Button } from "@/components/ui/button"
import { LanguageSwitcher } from "@/components/language-switcher"
import { BrandLogo } from "@/components/brand-logo"
// After step 4 above this import becomes "@/components/auth/magic-link-form".
import { MagicLinkForm } from "@/integration/magic-link/magic-link-form"

export default async function LoginPage() {
  const t = await getT()

  return (
    <div className="relative flex min-h-svh flex-col items-center justify-center px-4 py-10">
      {/* Same brand treatment as the demo page: a full-bleed image with a scrim
          over it so the card stays readable. `fill` + object-cover so it works
          at any viewport; public/login-bg.webp is the pre-optimised copy. */}
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

      <div className="relative z-10 w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <BrandLogo width={200} priority className="mb-4" />
          <h1 className="text-2xl font-semibold tracking-tight">{t("login.title")}</h1>
          <p className="text-muted-foreground mt-1 text-sm">{t("login.signInSubtitle")}</p>
        </div>

        <div className="bg-card space-y-5 rounded-xl border p-6 shadow-sm">
          {/* Internal staff. A plain link, not a form: /api/auth/login is a GET
              that redirects to Entra, and a form post would break the
              PKCE/state round-trip the callback validates. */}
          <Button asChild variant="default" className="w-full">
            <a href="/api/auth/login">
              {/* Inline mark rather than an <Image>: four solid squares, no
                  network request, and it cannot 404 in a locked-down tenant. */}
              <svg
                viewBox="0 0 23 23"
                aria-hidden
                className="size-4"
                fill="currentColor"
              >
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
    </div>
  )
}
