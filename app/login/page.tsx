"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/fields";
import { Monogram } from "@/components/monogram";
import { useLanguage } from "@/components/providers/language-provider";
import { LANGUAGES } from "@/components/providers/language-provider";
import {
  createBrowserSupabaseClient,
  isSupabaseConfigured,
} from "@/lib/supabase/browser";
import { cn } from "@/lib/utils";

function GoogleIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden>
      <path
        fill="currentColor"
        d="M21.35 11.1h-9.17v2.73h6.51c-.33 3.81-3.5 5.44-6.5 5.44C8.36 19.27 5 16.25 5 12c0-4.1 3.2-7.27 7.2-7.27 3.09 0 4.9 1.97 4.9 1.97L19 4.72S16.56 2 12.1 2C6.42 2 2.03 6.8 2.03 12c0 5.05 4.13 10 10.22 10 5.35 0 9.25-3.67 9.25-9.09 0-1.15-.15-1.81-.15-1.81Z"
      />
    </svg>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginInner />
    </Suspense>
  );
}

function LoginInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const oauthError = searchParams.get("error");
  const { t, lang, setLang } = useLanguage();
  const configured = isSupabaseConfigured();
  const [email, setEmail] = useState(
    configured ? "" : "contact@maison-olive.dz",
  );
  const [password, setPassword] = useState(configured ? "" : "demo-2026");
  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [googlePending, setGooglePending] = useState(false);
  const [googleError, setGoogleError] = useState<string | null>(null);

  const error =
    oauthError === "access_denied"
      ? t("err_access_denied")
      : oauthError === "oauth_failed"
        ? t("err_oauth_failed")
        : (formError ?? googleError);

  const signInWithGoogle = async () => {
    setGoogleError(null);
    setGooglePending(true);
    try {
      if (!isSupabaseConfigured()) {
        setGoogleError(t("err_oauth_unconfigured"));
        setGooglePending(false);
        return;
      }
      const supabase = createBrowserSupabaseClient();
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
        },
      });
      if (error) {
        setGoogleError(t("err_oauth_unconfigured"));
        setGooglePending(false);
      }
      // On success the browser redirects to /auth/callback.
    } catch {
      setGoogleError(t("err_oauth_failed"));
      setGooglePending(false);
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setLoading(true);
    try {
      if (!configured) {
        // Demo build: no backend auth yet — the service layer will own this
        // once ESTINAD Core / Supabase is wired in.
        await new Promise((r) => window.setTimeout(r, 500));
        router.push("/dashboard");
        return;
      }
      const supabase = createBrowserSupabaseClient();
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (error) {
        setFormError(t("err_invalid_credentials"));
        return;
      }
      router.push("/dashboard");
      router.refresh();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg-primary px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <Monogram className="h-9 w-9" alt="ESTINAD" />
          <p className="mt-4 text-[11px] font-medium tracking-[0.18em] text-text-muted uppercase">
            ESTINAD
          </p>
          <h1 className="mt-1 text-xl font-semibold tracking-tight text-text-primary">
            Central
          </h1>
          <p className="mt-1 text-[13px] text-text-secondary">{t("login_subtitle")}</p>
        </div>

        <div className="rounded-[var(--radius-lg)] border border-border bg-bg-secondary p-5">
          <Button
            type="button"
            onClick={signInWithGoogle}
            disabled={googlePending || loading}
            icon={<GoogleIcon />}
            className="w-full"
          >
            {googlePending ? t("redirecting_to_google") : t("continue_with_google")}
          </Button>

          <div className="my-4 flex items-center gap-3" aria-hidden>
            <span className="h-px flex-1 bg-border" />
            <span className="text-[11px] font-medium tracking-[0.14em] text-text-muted uppercase">
              {t("or_email")}
            </span>
            <span className="h-px flex-1 bg-border" />
          </div>

          <form onSubmit={submit}>
            <div className="space-y-4">
              <Field label={t("email")}>
                <Input
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </Field>
              <Field label={t("password")}>
                <Input
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={4}
                />
              </Field>
            </div>
            <Button type="submit" variant="primary" loading={loading} disabled={googlePending} className="mt-5 w-full">
              {t("sign_in")}
            </Button>
            <div className="mt-3 flex items-center justify-between text-[13px]">
              <Link
                href="/forgot-password"
                className="text-text-secondary hover:text-text-primary"
              >
                {t("forgot_password")}
              </Link>
              <Link href="/register" className="font-medium text-accent hover:text-accent-hover">
                {t("register")}
              </Link>
            </div>
            {!configured ? (
              <Button
                type="button"
                variant="ghost"
                className="mt-2 w-full"
                onClick={() => router.push("/dashboard")}
              >
                {t("continue_demo")}
              </Button>
            ) : null}
          </form>

          {error ? (
            <p
              role="alert"
              className="mt-4 rounded-[var(--radius-sm)] border border-danger bg-danger-muted px-3 py-2 text-[13px] text-danger"
            >
              {error}
            </p>
          ) : null}
        </div>

        <div className="mt-5 flex justify-center gap-1">
          {LANGUAGES.map((l) => (
            <button
              key={l.code}
              onClick={() => setLang(l.code)}
              className={cn(
                "cursor-pointer rounded-[var(--radius-sm)] px-2.5 py-1.5 text-xs font-medium transition-colors",
                lang === l.code
                  ? "bg-bg-surface text-text-primary"
                  : "text-text-muted hover:text-text-secondary",
              )}
            >
              {l.nativeName}
            </button>
          ))}
        </div>

        <p className="mt-4 text-center font-mono text-[0.65rem] tracking-[0.18em] text-text-muted uppercase">
          central.estinad.com
        </p>
      </div>
    </div>
  );
}
