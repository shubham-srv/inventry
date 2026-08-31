"use client"

/**
 * The email box on the login page — the external users' door.
 *
 * Posts to /api/auth/magic/request, which answers IDENTICALLY whether or not the
 * address is registered. This component must not try to be more helpful than it:
 * distinguishing "sent" from "no such user" here would leak exactly the account
 * enumeration the endpoint is written to prevent. Hence one neutral message on
 * success, and a retry affordance rather than a "did you mean…".
 *
 * A non-2xx is the one honest failure — it means OUR mailer broke, which says
 * nothing about the address and which the user needs to know so they can retry.
 */
import { useState } from "react"
import { Loader2, Mail, CheckCircle2 } from "lucide-react"
import { useT } from "@/lib/i18n/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

type Status = "idle" | "sending" | "sent" | "error"

export function MagicLinkForm() {
  const t = useT()
  const [email, setEmail] = useState("")
  const [status, setStatus] = useState<Status>("idle")

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim()) return
    setStatus("sending")
    try {
      const res = await fetch("/api/auth/magic/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      })
      setStatus(res.ok ? "sent" : "error")
    } catch {
      setStatus("error")
    }
  }

  if (status === "sent") {
    return (
      <div className="rounded-lg border bg-emerald-500/10 p-4 text-sm">
        <p className="flex items-center gap-2 font-medium text-emerald-700 dark:text-emerald-400">
          <CheckCircle2 className="size-4" /> {t("login.magic.sentTitle")}
        </p>
        <p className="text-muted-foreground mt-1">
          {t("login.magic.sentBody", { email })}
        </p>
        <Button
          type="button"
          variant="link"
          className="mt-1 h-auto p-0 text-xs"
          onClick={() => setStatus("idle")}
        >
          {t("login.magic.useDifferent")}
        </Button>
      </div>
    )
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div>
        <Label htmlFor="magic-email" className="mb-1.5">
          {t("login.magic.label")}
        </Label>
        <Input
          id="magic-email"
          type="email"
          name="email"
          autoComplete="email"
          required
          placeholder={t("login.magic.placeholder")}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={status === "sending"}
        />
      </div>

      <Button type="submit" className="w-full" disabled={status === "sending"}>
        {status === "sending" ? (
          <>
            <Loader2 className="size-4 animate-spin" /> {t("login.magic.sending")}
          </>
        ) : (
          <>
            <Mail className="size-4" /> {t("login.magic.submit")}
          </>
        )}
      </Button>

      {status === "error" && (
        <p className="text-destructive text-xs">{t("login.magic.error")}</p>
      )}
    </form>
  )
}
