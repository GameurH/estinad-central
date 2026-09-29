"use client";

import { useEffect, useMemo, useState } from "react";
import { FolderOpen, Pencil, Star, Trash2 } from "lucide-react";
import { MediaFilterBar } from "@/components/media/media-filter-bar";
import { MediaGrid } from "@/components/media/media-grid";
import { MediaUploadButton } from "@/components/media/media-upload-button";
import { useMediaUpload } from "@/components/media/media-upload";
import { useTenantMediaLibrary } from "@/components/media/use-media-library";
import { PageHeader } from "@/components/patterns/page-header";
import { useLanguage } from "@/components/providers/language-provider";
import { useTenant } from "@/components/providers/tenant-provider";
import { useToast } from "@/components/providers/toast-provider";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { ConfirmDialog, Dialog } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/fields";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState } from "@/components/ui/states";
import type { MediaAsset } from "@/lib/domain";
import { deleteMediaAsset, updateMediaAsset, uploadMediaAsset } from "@/lib/services";
import { cn } from "@/lib/utils";

/**
 * The tenant media library: every uploaded image, organised by folder, tag and
 * favourite. Products, long descriptions and category tiles all pick from this
 * same set, so an image is uploaded and organised once.
 */
export default function MediaLibraryPage() {
  const { current } = useTenant();
  const { t } = useLanguage();
  const { toast } = useToast();
  const [searchInput, setSearchInput] = useState("");
  const library = useTenantMediaLibrary(current?.id ?? null);
  const { setSearch: setLibrarySearch } = library;

  const [editing, setEditing] = useState<MediaAsset | null>(null);
  const [draftFolder, setDraftFolder] = useState("");
  const [draftTags, setDraftTags] = useState("");
  const [draftAlt, setDraftAlt] = useState("");
  const [removing, setRemoving] = useState<MediaAsset | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  // Debounced so typing in the search box does not query per keystroke.
  useEffect(() => {
    const id = setTimeout(() => setLibrarySearch(searchInput), 250);
    return () => clearTimeout(id);
  }, [searchInput, setLibrarySearch]);

  const { uploadFiles, uploading } = useMediaUpload(async (file) => {
    if (!current) return;
    await uploadMediaAsset({ tenantId: current.id, file, folder: library.folder ?? "" });
    await library.onRefresh?.();
  });

  const setFavorite = async (asset: MediaAsset) => {
    setBusyId(asset.id);
    try {
      await updateMediaAsset(asset.id, { isFavorite: !asset.isFavorite });
      await library.onRefresh?.();
    } catch (e) {
      toast(e instanceof Error ? e.message : t("error_title"), "error");
    } finally {
      setBusyId(null);
    }
  };

  const openEditor = (asset: MediaAsset) => {
    setEditing(asset);
    setDraftFolder(asset.folder);
    setDraftTags(asset.tags.join(", "));
    setDraftAlt(asset.alt ?? "");
  };

  const saveEditor = async () => {
    if (!editing) return;
    try {
      await updateMediaAsset(editing.id, {
        altText: draftAlt,
        folder: draftFolder,
        tags: draftTags
          .split(",")
          .map((tag) => tag.trim())
          .filter(Boolean),
      });
      setEditing(null);
      toast(t("saved"));
      await library.onRefresh?.();
    } catch (e) {
      toast(e instanceof Error ? e.message : t("error_title"), "error");
    }
  };

  const confirmRemove = async () => {
    const asset = removing;
    if (!asset) return;
    setRemoving(null);
    setBusyId(asset.id);
    try {
      const { objectRemoved } = await deleteMediaAsset(asset);
      toast(objectRemoved ? t("media_deleted") : t("media_file_kept"));
      await library.onRefresh?.();
    } catch (e) {
      toast(e instanceof Error ? e.message : t("error_title"), "error");
    } finally {
      setBusyId(null);
    }
  };

  // Folder rail: every folder in use, plus an explicit "all" entry.
  const folders = useMemo(
    () => [
      { value: null as string | null, label: t("media_all_folders") },
      ...library.folders.map((name) => ({
        value: name as string | null,
        label: name || t("media_root"),
      })),
    ],
    [library.folders, t],
  );

  const locked = uploading || busyId !== null;

  return (
    <div className="animate-fade-in space-y-4">
      <PageHeader
        title={t("media_library")}
        subtitle={t("media_library_hint")}
        actions={
          <MediaUploadButton
            label={t("media_upload")}
            loading={uploading}
            disabled={!current}
            onFiles={uploadFiles}
          />
        }
      />

      {!current ? (
        <Skeleton className="h-72 w-full" />
      ) : (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-4">
          <Card className="lg:col-span-1">
            <CardHeader title={t("media_folders")} />
            <nav className="p-2">
              {folders.map((entry) => (
                <button
                  key={entry.value ?? "__all__"}
                  type="button"
                  onClick={() => library.setFolder(entry.value)}
                  className={cn(
                    "flex w-full cursor-pointer items-center gap-2 rounded-[var(--radius-sm)] px-2.5 py-2 text-start text-[13px] transition-colors",
                    library.folder === entry.value
                      ? "bg-bg-surface text-text-primary"
                      : "text-text-secondary hover:bg-bg-surface/60 hover:text-text-primary",
                  )}
                >
                  <FolderOpen className="h-4 w-4 shrink-0 text-text-muted" />
                  <span className="truncate">{entry.label}</span>
                </button>
              ))}
            </nav>
          </Card>

          <div className="space-y-3 lg:col-span-3">
            <MediaFilterBar
              folders={library.folders}
              tags={library.tags}
              folder={library.folder}
              tag={library.tag}
              favoritesOnly={library.favoritesOnly}
              search={searchInput}
              onFolder={library.setFolder}
              onTag={library.setTag}
              onFavorites={library.setFavoritesOnly}
              onSearch={setSearchInput}
            />

            {library.error ? (
              <Card>
                <ErrorState
                  title={t("error_title")}
                  onRetry={() => void library.onRefresh?.()}
                  retryLabel={t("retry")}
                />
              </Card>
            ) : library.isLoading ? (
              <Skeleton className="h-72 w-full" />
            ) : library.items.length === 0 ? (
              <Card>
                <EmptyState title={t("media_picker_empty")} hint={t("photo_drop")} />
              </Card>
            ) : (
              <MediaGrid
                items={library.items}
                busyId={busyId}
                renderOverlay={(asset) =>
                  asset.isFavorite ? (
                    <Star className="absolute top-2 start-2 h-4 w-4 fill-current text-warning" />
                  ) : null
                }
                renderActions={(asset) => (
                  <>
                    <button
                      type="button"
                      title={t("media_favorites")}
                      aria-label={t("media_favorites")}
                      aria-pressed={asset.isFavorite}
                      disabled={locked}
                      onClick={() => void setFavorite(asset)}
                      className="pressable grid h-7 w-7 cursor-pointer place-items-center rounded-[var(--radius-sm)] text-text-secondary transition-colors hover:bg-bg-surface hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-30"
                    >
                      <Star
                        className={cn("h-3.5 w-3.5", asset.isFavorite && "fill-current text-warning")}
                      />
                    </button>
                    <span className="truncate px-1 text-[11px] text-text-muted">
                      {asset.folder || t("media_root")}
                    </span>
                    <span className="flex gap-0.5">
                      <button
                        type="button"
                        title={t("edit")}
                        aria-label={t("edit")}
                        disabled={locked}
                        onClick={() => openEditor(asset)}
                        className="pressable grid h-7 w-7 cursor-pointer place-items-center rounded-[var(--radius-sm)] text-text-secondary transition-colors hover:bg-bg-surface hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-30"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        title={t("photo_remove")}
                        aria-label={t("photo_remove")}
                        disabled={locked}
                        onClick={() => setRemoving(asset)}
                        className="pressable grid h-7 w-7 cursor-pointer place-items-center rounded-[var(--radius-sm)] text-text-secondary transition-colors hover:bg-danger-muted hover:text-danger disabled:cursor-not-allowed disabled:opacity-30"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </span>
                  </>
                )}
              />
            )}
          </div>
        </div>
      )}

      <Dialog
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={t("media_library")}
        description={editing?.storagePath.split("/").pop()}
      >
        {editing && (
          <div className="space-y-4">
            <Field label={t("media_asset_folder")} hint={t("media_folders")}>
              <Input
                value={draftFolder}
                onChange={(e) => setDraftFolder(e.target.value)}
                placeholder="Miels/Sidr"
                autoFocus
              />
            </Field>
            <Field label={t("media_asset_tags")}>
              <Input
                value={draftTags}
                onChange={(e) => setDraftTags(e.target.value)}
                placeholder="miel, sachet"
              />
            </Field>
            <Field label={t("media_asset_alt")}>
              <Input value={draftAlt} onChange={(e) => setDraftAlt(e.target.value)} />
            </Field>
            <div className="flex justify-end gap-2">
              <Button onClick={() => setEditing(null)}>{t("cancel")}</Button>
              <Button variant="primary" onClick={() => void saveEditor()}>
                {t("save")}
              </Button>
            </div>
          </div>
        )}
      </Dialog>

      <ConfirmDialog
        open={removing !== null}
        onClose={() => setRemoving(null)}
        onConfirm={() => void confirmRemove()}
        title={t("photo_remove")}
        body={t("photo_remove_confirm")}
        confirmLabel={t("delete")}
        cancelLabel={t("cancel")}
      />
    </div>
  );
}
