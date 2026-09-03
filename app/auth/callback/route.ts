import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { assertConsoleAccess } from "@/lib/auth-gate";

/**
 * OAuth callback (Google sign-in) — same flow as control:
 * 1. Exchanges the PKCE code for a session (cookies set server-side)
 * 2. Enforces the console-access gate server-side — an account without
 *    tenant access is signed out immediately, never entering the app
 * 3. Redirects to `next` or /dashboard
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/dashboard";

  if (!code) {
    return NextResponse.redirect(new URL("/login?error=oauth_failed", origin));
  }

  const auth = await createClient();
  const { error } = await auth.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(new URL("/login?error=oauth_failed", origin));
  }

  const {
    data: { user },
  } = await auth.auth.getUser();
  if (!user) {
    return NextResponse.redirect(new URL("/login?error=oauth_failed", origin));
  }

  const access = await assertConsoleAccess();
  if (!access.ok) {
    await auth.auth.signOut();
    return NextResponse.redirect(new URL("/login?error=access_denied", origin));
  }

  return NextResponse.redirect(new URL(next, origin));
}
