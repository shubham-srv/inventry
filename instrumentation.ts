import { sessionSecretProblem } from "@/lib/auth/secret"

/**
 * Next.js runs `register()` once per server process, on startup.
 *
 * Two jobs: refuse to boot on a session-secret misconfiguration, and start the
 * email outbox drain (lib/email/dispatch-loop.ts). Guarded on the Node runtime
 * because this file is also evaluated for the edge runtime, where Prisma and
 * timers of this kind have no business running.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return

  // `next build` evaluates this file too, and SESSION_SECRET is injected at
  // deploy time rather than `docker build` time — asserting during the build
  // would fail the image for a variable that is legitimately absent there.
  // Starting the dispatch loop mid-build would be equally wrong.
  if (process.env.NEXT_PHASE === "phase-production-build") return

  // Fail at boot, loudly, rather than leaving the first request to discover it.
  // An unset SESSION_SECRET used to fall back to a constant published in this
  // repo, which would let anyone forge a session cookie for any user id.
  const problem = sessionSecretProblem()
  if (problem) {
    throw new Error(
      `[startup] ${problem}. Set it to a long random string; refusing to start.`
    )
  }

  const { startEmailDispatchLoop } = await import("@/lib/email/dispatch-loop")
  startEmailDispatchLoop()
}
