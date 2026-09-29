import { LANGUAGES } from "@/components/providers/language-provider";
import type { LangCode } from "@/lib/domain";
import { cn } from "@/lib/utils";

/**
 * Language switcher for per-language content.
 *
 * Shared by the product name, product long description and category name
 * editors so all three read the same way: the active language is marked with an
 * underline on the section border.
 */
export function LanguageTabs({
  value,
  onChange,
  className,
}: {
  value: LangCode;
  onChange: (code: LangCode) => void;
  className?: string;
}) {
  return (
    <div role="tablist" className={cn("flex gap-1", className)}>
      {LANGUAGES.map((l) => (
        <button
          key={l.code}
          type="button"
          role="tab"
          aria-selected={value === l.code}
          onClick={() => onChange(l.code)}
          className={cn(
            "relative cursor-pointer px-3 py-2 text-[13px] font-medium transition-colors",
            value === l.code
              ? "text-text-primary"
              : "text-text-secondary hover:text-text-primary",
          )}
        >
          {l.nativeName}
          {value === l.code && (
            <span
              aria-hidden
              className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-primary"
            />
          )}
        </button>
      ))}
    </div>
  );
}
