"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/fields";
import { Monogram } from "@/components/monogram";
import { useLanguage } from "@/components/providers/language-provider";

export default function RegisterPage() {
  const router = useRouter();
  const { t } = useLanguage();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);

  const mismatch = confirm.length > 0 && password !== confirm;
  const valid =
    name.trim().length >= 2 &&
    /.+@.+\..+/.test(email) &&
    password.length >= 8 &&
    !mismatch;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    setLoading(true);
    // Demo build: account creation lives in ESTINAD Core auth.
    window.setTimeout(() => router.push("/onboarding"), 500);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg-primary px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <Monogram className="h-9 w-9" alt="ESTINAD" />
          <h1 className="mt-4 text-xl font-semibold tracking-tight text-text-primary">
            {t("register")}
          </h1>
          <p className="mt-1 text-[13px] text-text-secondary">{t("login_subtitle")}</p>
        </div>

        <form
          onSubmit={submit}
          className="rounded-[var(--radius-lg)] border border-border bg-bg-secondary p-5"
        >
          <div className="space-y-4">
            <Field label={t("full_name")}>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoComplete="name"
                required
              />
            </Field>
            <Field label={t("email")}>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                required
              />
            </Field>
            <Field label={t("password")} hint="8+">
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                required
                minLength={8}
              />
            </Field>
            <Field
              label={t("confirm_password")}
              error={mismatch ? t("passwords_mismatch") : undefined}
            >
              <Input
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                autoComplete="new-password"
                required
              />
            </Field>
          </div>
          <Button
            type="submit"
            variant="primary"
            loading={loading}
            disabled={!valid}
            className="mt-5 w-full"
          >
            {t("register")}
          </Button>
        </form>

        <p className="mt-5 text-center text-[13px] text-text-secondary">
          {t("has_account")}{" "}
          <Link href="/login" className="font-medium text-accent hover:text-accent-hover">
            {t("sign_in")}
          </Link>
        </p>
      </div>
    </div>
  );
}
