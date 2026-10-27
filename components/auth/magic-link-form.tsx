"use client"

/**
 * The email box on the login page — the external users' door.
 *
 * Posts to /api/auth/magic/request, which says why a link was not sent
 * (unknown address, staff account, deactivated…) so each case gets plain
 * next-step guidance here.
 */
import { useEffect, useRef, useState } from "react"
import { AlertCircle, CheckCircle2, Loader2, Mail, RotateCw } from "lucide-react"
import { useT } from "@/lib/i18n/client"
import type { MagicRequestError } from "@/lib/auth/magic-link"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

type Status = "idle" | "sending" | "sent"

const LAST_EMAIL_KEY = "login.lastEmail"
const RESEND_COOLDOWN_S = 30
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function MagicLinkForm({
  microsoftHref,
  autoFocus = false,
}: {
  /** Where the "staff account" error sends people. */
  microsoftHref: string
  autoFocus?: boolean
}) {
  const t = useT()
  const [email, setEmail] = useState("")
  const [status, setStatus] = useState<Status>("idle")
  const [error, setError] = useState<MagicRequestError | "unknown" | null>(null)
  const [cooldown, setCooldown] = useState(0)
  const [resent, setResent] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // Prefill the address used last time on this device.
  useEffect(() => {
    try {
      const last = localStorage.getItem(LAST_EMAIL_KEY)
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (last) setEmail((e) => e || last)
    } catch {}
  }, [])

  useEffect(() => {
    if (cooldown <= 0) return
    const id = setTimeout(() => setCooldown((c) => c - 1), 1000)
    return () => clearTimeout(id)
  }, [cooldown])

  async function send(resend = false) {
    const address = email.trim().toLowerCase()
    if (!EMAIL_RE.test(address)) {
      setError("invalid")
      inputRef.current?.focus()
      return
    }
    setError(null)
    setStatus("sending")
    try {
      const res = await fetch("/api/auth/magic/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: address }),
      })
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: MagicRequestError }
      if (res.ok && body.ok) {
        try {
          localStorage.setItem(LAST_EMAIL_KEY, address)
        } catch {}
        setEmail(address)
        setStatus("sent")
        setResent(resend)
        setCooldown(RESEND_COOLDOWN_S)
        return
      }
      setError(body.error ?? "unknown")
    } catch {
      setError("unknown")
    }
    // A failed resend keeps the "check your inbox" panel; anything else goes back to the form.
    setStatus(resend ? "sent" : "idle")
  }

  function submit(e: React.FormEvent) {
    e.preventDefault()
    void send()
  }

  function startOver() {
    setStatus("idle")
    setError(null)
    setResent(false)
    setTimeout(() => inputRef.current?.focus(), 0)
  }

  const errorBox = error && (
    <div role="alert" className="border-destructive/30 bg-destructive/5 text-destructive rounded-lg border p-3 text-sm">
      <p className="flex items-start gap-2">
        <AlertCircle className="mt-0.5 size-4 shrink-0" />
        <span>
          {error === "unknown" || error === "config"
            ? t("login.magic.error")
            : t(`login.magic.errors.${error}`, { email: email.trim() })}
        </span>
      </p>
      {error === "internal" && (
        <Button asChild size="sm" className="mt-2 w-full">
          <a href={microsoftHref}>{t("login.microsoft")}</a>
        </Button>
      )}
    </div>
  )

  if (status === "sent") {
    return (
      <div className="space-y-3">
        <div className="rounded-lg border bg-emerald-500/10 p-4 text-sm">
          <p className="flex items-center gap-2 font-medium text-emerald-700 dark:text-emerald-400">
            <CheckCircle2 className="size-4" /> {t("login.magic.sentTitle")}
          </p>
          <p className="text-muted-foreground mt-1">
            {resent ? t("login.magic.resent") : t("login.magic.sentBody", { email })}
          </p>
          <p className="text-muted-foreground mt-2 text-xs">{t("login.magic.spamHint")}</p>
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={cooldown > 0}
              onClick={() => void send(true)}
            >
              <RotateCw className="size-3.5" />
              {cooldown > 0 ? t("login.magic.resendIn", { seconds: cooldown }) : t("login.magic.resend")}
            </Button>
            <Button type="button" variant="link" className="h-auto p-0 text-xs" onClick={startOver}>
              {t("login.magic.useDifferent")}
            </Button>
          </div>
        </div>
        {errorBox}
      </div>
    )
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-3">
      <div>
        <Label htmlFor="magic-email" className="mb-1.5">
          {t("login.magic.label")}
        </Label>
        <Input
          ref={inputRef}
          id="magic-email"
          type="email"
          name="email"
          autoComplete="email"
          inputMode="email"
          autoFocus={autoFocus}
          placeholder={t("login.magic.placeholder")}
          value={email}
          onChange={(e) => {
            setEmail(e.target.value)
            if (error) setError(null)
          }}
          disabled={status === "sending"}
          aria-invalid={!!error}
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

      {errorBox}
    </form>
  )
}
