"use client";

import { Star } from "lucide-react";
import { useLanguage } from "@/components/providers/language-provider";
import { Input, Select } from "@/components/ui/fields";
import { cn } from "@/lib/utils";

/**
 * Filter controls for a media library — folders, tags, favourites, search.
 *
 * It is presentation only: state lives in the consumer (the library page and
 * the picker each keep their own), so the same bar works in both places.
 */
export function MediaFilterBar({
  folders,
  tags,
  folder,
  tag,
  favoritesOnly,
  search,
  onFolder,
  onTag,
  onFavorites,
  onSearch,
  className,
}: {
  folders: string[];
  tags: string[];
  folder: string | null;
  tag: string | null;
  favoritesOnly: boolean;
  search: string;
  onFolder: (folder: string | null) => void;
  onTag: (tag: string | null) => void;
  onFavorites: (value: boolean) => void;
  onSearch: (value: string) => void;
  className?: string;
}) {
  const { t } = useLanguage();

  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      <Input
        value={search}
        onChange={(e) => onSearch(e.target.value)}
        placeholder={t("search")}
        aria-label={t("search")}
        className="h-8 flex-1 sm:w-48 sm:flex-none"
      />
      {folders.length > 0 && (
        <Select
          value={folder ?? ""}
          onChange={(e) => onFolder(e.target.value === "" ? null : e.target.value)}
          aria-label={t("media_folders")}
          className="h-8 w-auto"
        >
          <option value="">{t("media_all_folders")}</option>
          {folders.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </Select>
      )}
      {tags.length > 0 && (
        <Select
          value={tag ?? ""}
          onChange={(e) => onTag(e.target.value === "" ? null : e.target.value)}
          aria-label={t("media_tags")}
          className="h-8 w-auto"
        >
          <option value="">{t("media_all_tags")}</option>
          {tags.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </Select>
      )}
      <button
        type="button"
        aria-pressed={favoritesOnly}
        title={t("media_favorites")}
        aria-label={t("media_favorites")}
        onClick={() => onFavorites(!favoritesOnly)}
        className={cn(
          "pressable grid h-8 w-8 cursor-pointer place-items-center rounded-[var(--radius-sm)] border transition-colors",
          favoritesOnly
            ? "border-transparent bg-accent-muted text-accent"
            : "border-border text-text-secondary hover:bg-bg-surface hover:text-text-primary",
        )}
      >
        <Star className={cn("h-4 w-4", favoritesOnly && "fill-current")} />
      </button>
    </div>
  );
}
