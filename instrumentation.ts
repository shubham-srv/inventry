/**
 * Next.js runs `register()` once per server process, on startup.
 *
 * Used to start the email outbox drain (lib/email/dispatch-loop.ts). Guarded on
 * the Node runtime because this file is also evaluated for the edge runtime,
 * where Prisma and timers of this kind have no business running.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return

  const { startEmailDispatchLoop } = await import("@/lib/email/dispatch-loop")
  startEmailDispatchLoop()
}
