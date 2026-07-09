import "server-only"
import { z } from "zod"
import { requireCapability, type SessionUser } from "@/lib/auth/session"
import { type Capability } from "@/lib/rbac"

export { type ActionState, initialActionState, fail, ok } from "@/lib/actions/types"
import { fail, type ActionState } from "@/lib/actions/types"

/** Guard for server actions that mutate admin data. */
export async function guard(capability: Capability): Promise<SessionUser> {
  return requireCapability(capability)
}

export function formToObject(fd: FormData): Record<string, string> {
  const o: Record<string, string> = {}
  for (const [k, v] of fd.entries()) o[k] = typeof v === "string" ? v : ""
  return o
}

/** Validate FormData against a zod schema; returns parsed data or an ActionState error. */
export function parseForm<T extends z.ZodTypeAny>(
  schema: T,
  fd: FormData
): { data: z.infer<T>; error?: undefined } | { data?: undefined; error: ActionState } {
  const parsed = schema.safeParse(formToObject(fd))
  if (!parsed.success) {
    return {
      error: fail("Please fix the highlighted fields.", parsed.error.flatten().fieldErrors as Record<string, string[]>),
    }
  }
  return { data: parsed.data }
}

/** Friendly message for FK / unique constraint violations from Prisma. */
export function prismaErrorMessage(e: unknown): string {
  const code = (e as { code?: string })?.code
  if (code === "P2002") return "A record with these values already exists."
  if (code === "P2003" || code === "P2014")
    return "This record is referenced elsewhere and cannot be deleted. Deactivate it instead."
  if (code === "P2025") return "Record not found."
  return "Something went wrong. Please try again."
}
