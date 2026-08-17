"use client"

/**
 * REFERENCE — the email box on the production login page.
 *
 * This folder is excluded from the app build (tsconfig "exclude"). Nothing here
 * runs until you copy it into the app — see integration/INTEGRATION.md.
 *
 * Posts to /api/auth/magic/request, which is wired to `requestLink` in
 * ./magic-link-routes.ts. That endpoint answers IDENTICALLY whether or not the
 * address exists, so this component must not try to be more helpful than it:
 * distinguishing "sent" from "no such user" here would leak exactly the account
 * enumeration the endpoint is written to prevent. Hence one neutral message on
 * success, and a retry affordance rather than a "did you mean…".
 */
import { useState } from "react"
import { Loader2, Mail, CheckCircle2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

type Status = "idle" | "sending" | "sent" | "error"

export function MagicLinkForm() {
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
      // A non-2xx here means the endpoint itself failed (misconfigured secret,
      // mail provider down) — not "unknown email", which returns 200.
      setStatus(res.ok ? "sent" : "error")
    } catch {
      setStatus("error")
    }
  }

  if (status === "sent") {
    return (
      <div className="rounded-lg border bg-emerald-500/10 p-4 text-sm">
        <p className="flex items-center gap-2 font-medium text-emerald-700 dark:text-emerald-400">
          <CheckCircle2 className="size-4" /> Check your inbox
        </p>
        <p className="text-muted-foreground mt-1">
          If <span className="font-medium">{email}</span> is registered, a sign-in
          link is on its way. It expires in 15 minutes and can only be used once.
        </p>
        <Button
          type="button"
          variant="link"
          className="mt-1 h-auto p-0 text-xs"
          onClick={() => setStatus("idle")}
        >
          Use a different address
        </Button>
      </div>
    )
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div>
        <Label htmlFor="magic-email" className="mb-1.5">
          Grower or vendor? Sign in with your email
        </Label>
        <Input
          id="magic-email"
          type="email"
          name="email"
          autoComplete="email"
          required
          placeholder="you@company.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={status === "sending"}
        />
      </div>

      <Button type="submit" className="w-full" disabled={status === "sending"}>
        {status === "sending" ? (
          <>
            <Loader2 className="size-4 animate-spin" /> Sending…
          </>
        ) : (
          <>
            <Mail className="size-4" /> Email me a sign-in link
          </>
        )}
      </Button>

      {status === "error" && (
        <p className="text-destructive text-xs">
          Something went wrong sending that link. Try again, or contact your
          administrator if it keeps happening.
        </p>
      )}
    </form>
  )
}
