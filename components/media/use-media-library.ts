"use client";

import { useCallback, useEffect, useState } from "react";
import type { MediaAsset } from "@/lib/domain";
import { getMediaAssets, listMediaFolders, listMediaTags } from "@/lib/services";
import type { MediaLibrary } from "./types";

export interface TenantMediaLibrary extends MediaLibrary {
  items: MediaAsset[];
  folders: string[];
  tags: string[];
  /** `null` = every folder. */
  folder: string | null;
  /** `null` = every tag. */
  tag: string | null;
  favoritesOnly: boolean;
  search: string;
  setFolder: (folder: string | null) => void;
  setTag: (tag: string | null) => void;
  setFavoritesOnly: (value: boolean) => void;
  setSearch: (value: string) => void;
}

/**
 * The tenant's media library, with folder/tag/favourite/search filtering.
 *
 * This is the loader behind the `/media` page and the gallery's "attach from
 * library" dialog, so `MediaLibrary` filtering behaves identically wherever the
 * library is browsed. Pass `enabled: false` to defer the first query until a
 * dialog actually opens.
 */
export function useTenantMediaLibrary(
  tenantId: string | null | undefined,
  enabled = true,
): TenantMediaLibrary {
  const [items, setItems] = useState<MediaAsset[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(false);
  const [folders, setFolders] = useState<string[]>([]);
  const [tagOptions, setTagOptions] = useState<string[]>([]);

  const [folder, setFolder] = useState<string | null>(null);
  const [tag, setTag] = useState<string | null>(null);
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [search, setSearch] = useState("");

  const refresh = useCallback(async () => {
    if (!tenantId) return;
    setIsLoading(true);
    try {
      const [assets, folderList, tagList] = await Promise.all([
        getMediaAssets(tenantId, {
          folder: folder ?? undefined,
          tag: tag ?? undefined,
          favoritesOnly,
          search: search || undefined,
        }),
        listMediaFolders(tenantId),
        listMediaTags(tenantId),
      ]);
      setItems(assets);
      setFolders(folderList);
      setTagOptions(tagList);
      setError(false);
    } catch {
      setError(true);
    } finally {
      setIsLoading(false);
    }
  }, [tenantId, folder, tag, favoritesOnly, search]);

  useEffect(() => {
    if (enabled && tenantId) void refresh();
  }, [enabled, refresh, tenantId]);

  return {
    items,
    isLoading,
    error,
    onRefresh: refresh,
    folders,
    tags: tagOptions,
    folder,
    tag,
    favoritesOnly,
    search,
    setFolder,
    setTag,
    setFavoritesOnly,
    setSearch,
  };
}
