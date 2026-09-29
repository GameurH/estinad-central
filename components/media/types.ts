import type { MediaItem } from "@/lib/domain";

/**
 * What the media components need from a source of images.
 *
 * The gallery, the picker and the single-image field depend on this shape —
 * never on `product_media` — so a different scope (a product's photos, the
 * tenant's whole upload history, a future dedicated library table) plugs in
 * without touching a single consumer.
 */
export interface MediaLibrary {
  items: MediaItem[];
  /** `true` while items are being (re)loaded. */
  isLoading?: boolean;
  /** Set when the last load failed; the picker then offers a retry. */
  error?: boolean;
  onRefresh?: () => void | Promise<void>;
  /** When present, the picker exposes an upload action for this source. */
  onUpload?: (file: File) => Promise<void>;
}
