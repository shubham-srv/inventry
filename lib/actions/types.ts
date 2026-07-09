// Client-safe action types/helpers (no server-only imports).

export type ActionState = {
  ok: boolean
  message?: string
  fieldErrors?: Record<string, string[]>
}

export const initialActionState: ActionState = { ok: false }

export function fail(
  message: string,
  fieldErrors?: Record<string, string[]>
): ActionState {
  return { ok: false, message, fieldErrors }
}

export function ok(message?: string): ActionState {
  return { ok: true, message }
}
