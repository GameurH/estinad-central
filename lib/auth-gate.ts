import type { User } from "@supabase/supabase-js";

export type ConsoleUser = Pick<User, "id" | "email">;

/**
 * Console access gate — Central's counterpart to control's `platform_admins`
 * check in `app/auth/callback/route.ts`.
 *
 * Production rule (once ESTINAD Core is wired): the user may enter only when
 * they hold a membership row (`tenant_owners`) for at least one tenant, e.g.
 *
 *   admin.from("tenant_owners").select("id").eq("user_id", user.id).limit(1)
 *
 * Demo mode: any authenticated user passes, so Google sign-in is exercisable
 * end-to-end before the backend exists.
 */
export async function assertConsoleAccess(): Promise<
  { ok: true } | { ok: false; reason: string }
> {
  return { ok: true };
}
