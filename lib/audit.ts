import "server-only"
import { prisma } from "@/lib/db"

export type AuditParams = {
  userId: number
  action: string // use AUDIT_ACTIONS
  entityType: string
  entityId?: string | number | null
  changes?: unknown
}

/** Records an internal-user CRUD/export action for the audit log. */
export async function recordAudit({
  userId,
  action,
  entityType,
  entityId,
  changes,
}: AuditParams): Promise<void> {
  await prisma.auditLog.create({
    data: {
      userId,
      action,
      entityType,
      entityId: entityId == null ? null : String(entityId),
      changes: changes === undefined ? null : JSON.stringify(changes),
    },
  })
}
