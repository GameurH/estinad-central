# Session handoff — ESTINAD Central media & variants

**Date:** 2026-09-30 · **Repos:** `estinad-central` (main) · `suqya-new-store` (storefront)
**DB:** Supabase project `rms`, ref `zhfietudqhbjuqjqfpva` (`eu-central-1`)

> Working document, not documentation. It describes one session's state and open
> work. **Delete it once the open items below are done** — a stale handoff is
> worse than none. Durable rules already live in `AGENTS.md` (always-push,
> media model, table list); put anything permanent there instead.

---

## 1. Current state

| Repo | HEAD | Sync | Tree |
|---|---|---|---|
| `estinad-central` | `6f85646` | in sync with `origin/master` | clean |
| `suqya-new-store` | `d651e47` | in sync with `origin/master` | **186 files show as modified, all CRLF-only churn** (not mine — see §5) |

**No work is uncommitted.** Everything this session is pushed. `AGENTS.md` now
requires committing and pushing verified changes.

---

## 2. What shipped this session

### `estinad-central`

| Commit | What it does |
|---|---|
| `c8cff96` | Trilingual product & category **name** translations (`product_translations.name`), plus the product media manager (upload / primary / reorder / delete) |
| `313d87e` | Markdown **image picker** in the long-description editor |
| `f6ef630` | Reusable **media components** (`components/media/`) + category tile image |
| `5568e81` | **Tenant media library** — `media_assets`, folders, tags, favourites, `/media` page, all consumers pick from it |
| `d6a15e8` | `AGENTS.md`: always-push rule + media model |
| `4724f7c` | **Fix**: keep `products.images` mirrored so removed photos stop 404-ing on the storefront |
| `6f85646` | **Product thumbnail** in the products list + `Product.image` precedence fix |

### `suqya-new-store`

| Commit | What it does |
|---|---|
| `d651e47` | Long descriptions render `![alt](url)` images; legacy `/boutique/produit/[id]` page switched from raw text to `MarkdownText` |

---

## 3. Database changes (applied, not in version control)

Migration **`create_media_library`** (applied via MCP — this repo keeps no
`supabase/migrations/`; if you want replayable schema history, that directory is
the missing piece):

```sql
create table public.media_assets (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null,                     -- text, mirrors products.tenant_id
  storage_bucket text not null default 'product-media',
  storage_path text not null,
  alt_text text,
  folder text not null default '',             -- path-style, e.g. 'Miels/Sidr'
  tags text[] not null default '{}',           -- GIN indexed
  is_favorite boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint media_assets_bucket_path_key unique (storage_bucket, storage_path)
);
-- + indexes (tenant/created_at, tenant/folder, gin(tags))
-- + RLS: ONE tenant-scoped policy for all verbs via tenant_owners.
--   Deliberately NO public SELECT (unlike product_media, whose SELECT is USING true).
alter table public.product_media
  add column asset_id uuid references public.media_assets(id) on delete set null;  -- + index
```

Backfill: one asset per existing path (35) + adoption of orphan objects (10, into
folder `Importés`). **4 orphan objects were left alone** — their first path
segment is not a real tenant (`a1000008-…`), so they cannot be filed.

**Rollback:** `alter table product_media drop column asset_id; drop table media_assets cascade;`

---

## 4. The media model (don't break this)

- `media_assets` = the **library** (one row per uploaded object + organisation).
- `product_media` = the **attachment layer the storefront reads**
  (`storage_bucket` + `storage_path` + `position` + `is_primary`), linked to the
  library by nullable `asset_id`. One asset can back several products.
- Uploads land in `<tenant_id>/library/<folder>/…`; **existing objects keep their
  `<tenant_id>/<product_id>/…` paths and are never moved** (moving breaks live URLs).
- `products.images` is **mirrored** from the gallery on every media mutation
  (`syncProductImageMirror`, called from upload / attach / remove / set-primary /
  reorder). `products.image` is **never** written (POS-owned, see §5).
- Deleting: `deleteProductMedia` removes the bytes only when the last gallery
  reference goes; `deleteMediaAsset` keeps the file when a product still uses it
  (and the UI says so).

---

## 5. Gotchas that cost time — read before touching data

1. **`products.image` is POS-owned and holds a bare filename** for ~151 products
   (`photo_2025_10_22_13_12_18_oc8oeuuqtx.jpg`). Never treat it as a URL, never
   overwrite it. Central maps it to `null` unless it is really a URL.
2. **The storefront merges `product_media` THEN falls back to `products.images`.**
   This is why a deleted object used to keep rendering (404): the row went, the
   array still had the URL. Any new media mutation must keep the mirror.
3. **`variants` is POS-synced** (`pb_id`, `pb_updated_at`, `sync_version`) — same
   trap as `products.name`. `variant_translations` is separately writable and the
   storefront already reads it.
4. **`product_media` has a public SELECT policy (`USING true`)** — any anon can
   enumerate every tenant's media rows. Pre-existing; report to the schema owner.
5. **`next/image` throws for any host missing from `images.remotePatterns`.**
   Both repos use plain `<img>` (with an eslint-disable + comment) wherever the
   URL is merchant-authored.
6. **CRLF churn**: `suqya-new-store` reports ~186 modified files that are
   line-ending-only (verify with `git diff --ignore-cr-at-eol`). `estinad-central`
   is LF. Check before staging; `core.autocrlf=input` or a `.gitattributes`
   (`* text=auto`) would end it.
7. **Neither repo has a test runner.** "Verified" = `tsc` + `eslint` + `build`
   (+ `npm run verify:markdown` in central).
8. **Git identity is unset in both repos.** Commits were made with
   `git -c user.name="ameur.gh" -c user.email="suqyahoney@gmail.com"`.
9. **Concurrent edits are real in this repo** — the owner (or another agent) edits
   the same files while a session runs. Staging a file wholesale therefore sweeps
   up work you did not write: commit `48a1744` (variant management) also carried
   the owner's `bulkSetProductsAvailability` / `bulkMoveProductsToCategory` /
   `bulkDeleteProducts` services and the `bulk_*` i18n keys, because
   `lib/services.ts` and `language-provider.tsx` were staged whole while those
   edits sat in the tree. Nothing was lost and nothing was rewritten (history was
   already pushed), but **before staging, run `git diff <file>` and check the hunks
   are yours** — the staged line count will not tell you. Prefer staging paths you
   created or hunks you wrote over whole files that others are editing.
10. **The bulk product actions are half-landed**: services + i18n keys are in
   `48a1744`; `app/(app)/products/page.tsx` and `components/patterns/data-table.tsx`
   were still uncommitted at handoff time.
9. **The PAT pasted in chat must be rotated** (it has push access to both repos).
   It was never written to disk, `.git/config`, or any commit — but it is in the
   transcript.

---

## 6. Verification toolkit

```bash
# central (estinad-central)
npx tsc --noEmit && npx eslint . && npm run build
npm run verify:markdown          # 17 checks: markdown render + caret math, via react-dom/server

# storefront (suqya-new-store)
bunx tsc --noEmit && bun run build      # `bun run lint` fails on ~32 PRE-EXISTING errors
git diff --ignore-cr-at-eol --stat <file>   # separate real changes from CRLF noise
```

Quick DB re-checks (via the Supabase MCP `execute_sql`):

```sql
-- any product image that points at a deleted object (must be 0)
select count(*) from public.products p, unnest(p.images) u(url)
where u.url like '%/object/public/product-media/%'
  and not exists (select 1 from storage.objects o where o.bucket_id='product-media'
    and o.name = split_part(split_part(u.url,'/object/public/product-media/',2),'?',1));

-- library vs attachments drift
select (select count(*) from public.media_assets),
       (select count(*) from public.product_media),
       (select count(*) from public.product_media where asset_id is null);

-- the storefront's own query (should be HTTP 200, no auth needed for reads)
-- $URL/rest/v1/products?select=id,name,product_media(storage_bucket,storage_path,position,is_primary,created_at)&limit=1
```

---

## 7. Live snapshot (2026-09-30 — it is moving, re-check before relying on it)

`media_assets` **43** (34 attached, 9 library-only) · `product_media` **34**,
0 without `asset_id` · objects in bucket not indexed: **4** · dead refs in
`products.images`: **0** · `variants` **183** across 50 products (max 20 on one) ·
duplicate variant names: **18** groups.

---

## 8. Open work, in priority order

**P0 — the storefront ignores variants (revenue bug, not a UI gap).**
`components/business/honey/product-details.tsx` (the live tenant) calls
`addItem({id, name, price: product.price, image})` with **no variant**, so every
honey product sells at its base price. Concrete: *Miel de Jujubier (Sidr)* has one
variant, 500g = 6500 + 6000 = **12 500 DA**; customers are charged **6 500**. The
order API **already** persists `variant_id` / `variant_name`, so only the honey
path is missing. The generic (non-honey) template does render variants but with:
a hardcoded fallback ladder (`250g −2000 / 500g 0 / 1kg +4000`), auto-selecting
the **middle** variant ("usually 500g"), and a `DA/g` price parsed out of the
variant **name** (`name.match(/\d+/)`).

**P1 — variant management in central** (see decisions in §9). Today central models
only `name` + `priceMod` + `sku`/`barcode`, creates one variant at a time, and
only when `type = variable`. The schema already supports far more — and 0 rows use
it: `attribute_values`, `color`, `size`, `color_hex`, `image`, `is_available`,
`track_stock`, `weight`/`weight_unit`, plus the empty
`product_attributes` / `product_attribute_values` tables (the option model).

*Proposed phases:* **V0** storefront renders variants (fixes P0, no schema change)
→ **V1** central full variant editing (name per language via `variant_translations`
— the storefront already reads it — sku/barcode, image, availability, final price
shown, duplicate guard, "variable product with no variants" warning) → **V2**
option model + matrix generator → **V3** variant images/stock/reporting.

**P2 — `/media` has no bulk operations.** Organising is per-asset; `MediaGrid`
already supports `selectedIds`, so a multi-select + move-to-folder / add-tag bar is
a small addition.

**P3 — inline pickers have no filters.** The library page and the gallery attach
dialog do; the markdown/category pickers browse unfiltered.

**P4 — long-description image hygiene.** Removing a photo does not rewrite
markdown that embeds its URL, so a dead `<img>` can remain inside a description.
Needs a usage check before delete.

---

## 9. Open decisions (blocking P1)

1. **Who owns variants — central or the POS?** `variants` is POS-synced. Options:
   (a) central owns names/prices, sync must not clobber; (b) central edits only
   storefront-facing extras (translations, image, availability); (c) both, with an
   explicit ownership marker.
2. **Priority: V0 (revenue bug) or V1 (manager) first?** Recommendation: **V0**.
3. **V1 scope** — is per-variant translation + image + availability + final-price
   display the right first slice?
4. **Is V2 needed?** Honey's variants are single-dimension (weight). A Size ×
   Colour matrix only pays off for multi-dimension products (e.g. the hardware
   tenant).

---

## 10. Known limitations (flagged, not hidden)

- **No signed-in runtime pass has ever been done.** Every claim rests on live SQL,
  the REST API with the anon key, and `tsc`/`eslint`/`build` — never a clicked UI.
  Nothing has exercised an authenticated upload end to end.
- `product_media` public SELECT (`USING true`); 4 unindexable orphan objects;
  `product-images` bucket is dead (0 objects); deleting a product cascades rows but
  leaves its storage objects.
- Category-tile images upload to `<tenant>/categories/…` with no row anywhere, so
  they do not appear in the library picker afterwards.
- Variant price semantics confuse merchants: `products.price` is a base and each
  variant **adds** a modifier, so the list price is never the purchasable price.
