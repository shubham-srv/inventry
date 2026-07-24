import { prisma } from "@/lib/db"
import type { NotificationInput } from "@/lib/email/notify"

/**
 * Azure Communication Services email sender (ISOLATED — not used while
 * EMAIL_PROVIDER=local). To activate:
 *   1. npm i @azure/communication-email
 *   2. set ACS_CONNECTION_STRING and ACS_SENDER_ADDRESS in .env
 *   3. set EMAIL_PROVIDER=acs
 * See integration/INTEGRATION.md.
 *
 * It records every send to NotificationLog (status Sent/Failed) so the
 * in-app Outbox stays accurate regardless of provider.
 */
export async function sendViaAcs(n: NotificationInput): Promise<void> {
  const connectionString = process.env.ACS_CONNECTION_STRING
  const senderAddress = process.env.ACS_SENDER_ADDRESS

  const log = await prisma.notificationLog.create({
    data: {
      type: n.type,
      toEmail: n.toEmail,
      subject: n.subject,
      body: n.body,
      bodyHtml: n.html ?? null,
      growerId: n.growerId ?? null,
      vendorId: n.vendorId ?? null,
      relatedEntity: n.relatedEntity ?? null,
      status: "Queued",
    },
  })

  if (!connectionString || !senderAddress) {
    await prisma.notificationLog.update({
      where: { id: log.id },
      data: { status: "Failed", body: `${n.body}\n\n[ACS not configured]` },
    })
    return
  }

  try {
    // Resolve the specifier from a variable so TypeScript/bundlers don't
    // require @azure/communication-email to be installed for the local build.
    const pkg = "@azure/communication-email"
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mod: any = await import(/* webpackIgnore: true */ pkg)
    const client = new mod.EmailClient(connectionString)

    const poller = await client.beginSend({
      senderAddress,
      content: {
        subject: n.subject,
        plainText: n.body,
        ...(n.html ? { html: n.html } : {}),
      },
      recipients: { to: [{ address: n.toEmail }] },
    })
    await poller.pollUntilDone()

    await prisma.notificationLog.update({
      where: { id: log.id },
      data: { status: "Sent", sentAt: new Date() },
    })
  } catch (e) {
    await prisma.notificationLog.update({
      where: { id: log.id },
      data: { status: "Failed" },
    })
    console.error("ACS send failed", e)
  }
}
