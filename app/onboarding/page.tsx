"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/fields";
import { Monogram } from "@/components/monogram";
import { useLanguage } from "@/components/providers/language-provider";
import { cn } from "@/lib/utils";

const STEPS = [0, 1, 2];

export default function OnboardingPage() {
  const router = useRouter();
  const { t } = useLanguage();
  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");

  const canNext = step === 0 || (step === 1 && name.trim().length >= 2);

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg-primary px-4">
      <div className="w-full max-w-md">
        <div className="mb-6 flex items-center justify-center gap-2">
          {STEPS.map((s) => (
            <span
              key={s}
              className={cn(
                "h-1.5 rounded-full transition-all",
                s < step && "w-8 bg-success",
                s === step && "w-12 bg-primary",
                s > step && "w-8 bg-bg-surface",
              )}
            />
          ))}
        </div>

        <div className="rounded-[var(--radius-lg)] border border-border bg-bg-secondary p-6">
          {step === 0 && (
            <div className="animate-fade-in text-center">
              <div className="mx-auto w-fit">
                <Monogram className="h-12 w-12" alt="ESTINAD" />
              </div>
              <h1 className="mt-4 text-lg font-semibold text-text-primary">
                {t("welcome")}
              </h1>
              <p className="mt-1 text-[13px] text-text-secondary">
                {t("onboarding_subtitle")}
              </p>
            </div>
          )}

          {step === 1 && (
            <div className="animate-fade-in">
              <h1 className="text-lg font-semibold text-text-primary">
                {t("onboarding_title")}
              </h1>
              <div className="mt-4 space-y-4">
                <Field label={t("store_name")}>
                  <Input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Maison Olive"
                    autoFocus
                  />
                </Field>
                <Field label={t("address")}>
                  <Input
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder="Rue Didouche Mourad, Alger"
                  />
                </Field>
                <Field label={t("phone")}>
                  <Input
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+213 …"
                    inputMode="tel"
                  />
                </Field>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="animate-fade-in text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-success-muted">
                <Check className="h-6 w-6 text-success" />
              </div>
              <h1 className="mt-4 text-lg font-semibold text-text-primary">
                {name.trim() || "Maison Olive"}
              </h1>
              <p className="mt-1 text-[13px] text-text-secondary">
                {t("onboarding_subtitle")}
              </p>
            </div>
          )}

          <div className="mt-6 flex items-center justify-between gap-2">
            <Button
              variant="ghost"
              onClick={() => router.push("/dashboard")}
            >
              {t("skip")}
            </Button>
            <div className="flex gap-2">
              {step > 0 && (
                <Button onClick={() => setStep((s) => s - 1)}>{t("back")}</Button>
              )}
              {step < 2 ? (
                <Button
                  variant="primary"
                  disabled={!canNext}
                  onClick={() => setStep((s) => s + 1)}
                >
                  {t("next")}
                </Button>
              ) : (
                <Button variant="primary" onClick={() => router.push("/dashboard")}>
                  {t("finish")}
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
