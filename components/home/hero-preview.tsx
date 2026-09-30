"use client";

import { useState } from "react";
import { Monitor, Smartphone } from "lucide-react";
import { useLanguage } from "@/components/providers/language-provider";
import { Button } from "@/components/ui/button";
import type { HeroSection } from "@/lib/domain";
import { cn } from "@/lib/utils";

/**
 * Live preview of the storefront hero, repainting as the editor's fields
 * change. Colors and veil gradients are extracted from the honey storefront
 * (`suqya-new-store` — app/globals.css + honey-home.css) and hardcoded here on
 * purpose: central has its own design system, and these belong to the
 * storefront's brand. If the storefront brand changes, update these values.
 *
 * Empty fields show a dimmed "default storefront text" strip instead of fake
 * copy — the real defaults live in the storefront's message bundle and are
 * intentionally not duplicated here.
 */

/* SUQYA brand values — source: suqya-new-store app/globals.css */
const IVORY = "#F8F5EE";
const CACAO = "#181310";
const GOLD = "#C8A24A";
/** color-mix(in oklch, cacao 82%, ivory) — the hero support-text color */
const SUPPORT_INK = "#3f352c";

const H1_SIZE = "clamp(1.6rem, 1.1rem + 1.8vw, 2.6rem)";

/** Veil gradients, per breakpoint — source: honey-home.css .hh-hero-veil */
const VEIL = {
  mobile:
    `linear-gradient(180deg, rgb(248 245 238 / 0.78) 0%, rgb(248 245 238 / 0.40) 30%, transparent 50%)`,
  desktop:
    `linear-gradient(90deg, rgb(248 245 238 / 0.62) 0%, rgb(248 245 238 / 0.26) 36%, transparent 56%)`,
};

function CopyLine({ value, placeholder }: { value: string; placeholder: string }) {
  if (value) return <>{value}</>;
  return <span className="italic opacity-45">{placeholder}</span>;
}

export function HeroPreview({ section }: { section: HeroSection }) {
  const { t } = useLanguage();
  const [lang, setLang] = useState<"fr" | "ar" | "en">("fr");
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");

  const copy = section[lang];
  const image = device === "desktop" ? section.images.desktop : section.images.mobile;
  const alt = section.images.alt[lang];
  const rtl = lang === "ar";

  const empty = (v: string) => v.trim() === "";

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        {/* Language switch mirrors the editor tabs; device mirrors the two images */}
        <div className="flex gap-1">
          {(["fr", "ar", "en"] as const).map((code) => (
            <Button
              key={code}
              size="sm"
              variant={lang === code ? "primary" : "ghost"}
              aria-pressed={lang === code}
              onClick={() => setLang(code)}
            >
              {code.toUpperCase()}
            </Button>
          ))}
        </div>
        <div className="flex gap-1">
          <Button
            size="sm"
            variant={device === "desktop" ? "primary" : "ghost"}
            icon={<Monitor className="h-4 w-4" />}
            aria-pressed={device === "desktop"}
            aria-label={t("hero_image_desktop")}
            onClick={() => setDevice("desktop")}
          />
          <Button
            size="sm"
            variant={device === "mobile" ? "primary" : "ghost"}
            icon={<Smartphone className="h-4 w-4" />}
            aria-pressed={device === "mobile"}
            aria-label={t("hero_image_mobile")}
            onClick={() => setDevice("mobile")}
          />
        </div>
      </div>

      <div
        className="relative overflow-hidden rounded-[var(--radius-lg)] border border-border bg-[#231A15]"
        dir={rtl ? "rtl" : "ltr"}
        aria-label={t("hero_preview")}
      >
        <div className={cn("relative", device === "desktop" ? "aspect-[16/7]" : "aspect-[3/4]")}>
          {/* Photo */}
          {image ? (
            // eslint-disable-next-line @next/next/no-img-element -- merchant-authored URL, same rule as everywhere in central
            <img src={image} alt={alt || ""} className="absolute inset-0 h-full w-full object-cover" />
          ) : (
            <div className="absolute inset-0 grid place-items-center">
              <span className="text-xs text-[#F8F5EE]/60">{t("hero_preview_no_image")}</span>
            </div>
          )}
          {/* Veil — matches the storefront's breakpoint gradient */}
          <div className="absolute inset-0" style={{ background: VEIL[device] }} aria-hidden />

          {/* Copy block — top-aligned like the storefront */}
          <div
            className={cn(
              "absolute inset-x-0 top-0 flex flex-col gap-3 p-5",
              rtl ? "items-start text-right" : "items-start",
            )}
          >
            <h3
              className={cn("m-0 max-w-[90%] text-balance", empty(copy.titleLead) && empty(copy.titleTail) && "opacity-45")}
              style={{
                color: CACAO,
                fontSize: H1_SIZE,
                lineHeight: rtl ? 1.34 : 1.06,
                fontWeight: rtl ? 700 : 400,
                letterSpacing: rtl ? 0 : "-0.018em",
              }}
            >
              <span className="block">
                <CopyLine value={copy.titleLead} placeholder={t("hero_title_lead")} />
              </span>
              <span className="block">
                <CopyLine value={copy.titleTail} placeholder={t("hero_title_tail")} />
              </span>
            </h3>
            <p
              className={cn("m-0 max-w-[22rem]", empty(copy.support) && "opacity-45")}
              style={{ color: SUPPORT_INK, fontSize: "0.95rem", lineHeight: 1.75 }}
            >
              <CopyLine value={copy.support} placeholder={t("hero_support")} />
            </p>
            <div className="mt-1 flex flex-wrap items-center gap-4">
              {/* Primary: cacao bg / ivory text */}
              <span
                className="inline-flex min-h-10 items-center gap-2 rounded-md px-5 text-[0.9rem] font-medium"
                style={{ background: CACAO, color: IVORY }}
              >
                <CopyLine value={copy.primaryCta} placeholder={t("hero_primary_cta")} />
                <span aria-hidden>→</span>
              </span>
              {/* Secondary: inherited ink with gold underline */}
              <span
                className="text-[0.9rem] font-medium underline decoration-1 underline-offset-[0.55em]"
                style={{ color: CACAO, textDecorationColor: GOLD }}
              >
                <CopyLine value={copy.secondaryCta} placeholder={t("hero_secondary_cta")} />
              </span>
            </div>
          </div>
        </div>
      </div>

      <p className="text-xs text-text-muted">{t("hero_preview_hint")}</p>
    </div>
  );
}
