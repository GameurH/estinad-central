"use client";

import { useState } from "react";
import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/fields";
import { Monogram } from "@/components/monogram";
import { useLanguage } from "@/components/providers/language-provider";

export default function ForgotPasswordPage() {
  const { t } = useLanguage();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    window.setTimeout(() => {
      setLoading(false);
      setSent(true);
    }, 500);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg-primary px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <Monogram className="h-9 w-9" alt="ESTINAD" />
          <h1 className="mt-4 text-xl font-semibold tracking-tight text-text-primary">
            {t("forgot_password")}
          </h1>
        </div>

        <div className="rounded-[var(--radius-lg)] border border-border bg-bg-secondary p-5">
          {sent ? (
            <div className="animate-fade-in flex flex-col items-center py-4 text-center">
              <CheckCircle2 className="h-10 w-10 text-success" />
              <p className="mt-3 text-[13px] text-text-secondary">{t("reset_sent")}</p>
            </div>
          ) : (
            <form onSubmit={submit}>
              <Field label={t("email")}>
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  required
                />
              </Field>
              <Button
                type="submit"
                variant="primary"
                loading={loading}
                className="mt-4 w-full"
              >
                {t("reset_password")}
              </Button>
            </form>
          )}
        </div>

        <p className="mt-5 text-center text-[13px]">
          <Link href="/login" className="font-medium text-accent hover:text-accent-hover">
            {t("back_to_login")}
          </Link>
        </p>
      </div>
    </div>
  );
}
