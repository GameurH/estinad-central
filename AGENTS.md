<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

<!-- Everything below is hand-maintained. `next dev` only rewrites the managed
     block above (upsertAgentRulesBlock in
     node_modules/next/dist/server/lib/generate-agent-files.js), so this
     survives dev-server restarts. Keep it accurate; delete what goes stale. -->

# ESTINAD Central

Admin / control-plane for ESTINAD businesses — catalog, orders, reporting,
settings. Rebuilt from scratch to replace the legacy `cloud-admin`. The
customer-facing storefront is a **separate repo** (see Boundaries).

## Stack

- Next.js 16 (App Router) · React 19 · TypeScript **strict**
- Tailwind CSS v4, CSS-first — there is **no** `tailwind.config.*`; design
  tokens live in `app/globals.css`
- `lucide-react` icons · `recharts` charts · `clsx` + `tailwind-merge` (`cn`)
- `@supabase/ssr` + `@supabase/supabase-js`
- No UI kit, no state library — deliberately

## Commands

```bash
npm run dev          # next dev
npm run build        # must pass before shipping
npm run lint         # eslint
npx tsc --noEmit     # type check (there is no `typecheck` script)
```

**There is no test runner in this project.** Verification means
`npx tsc --noEmit` + `npx eslint .` + `npm run build`. Never claim a change
works without at least those three.

## Layout

```
app/
  (app)/            authenticated shell: sidebar + topbar + ⌘K palette
    dashboard | products (+new, +[id]) | categories
    orders (+online) | reports | settings (+business)
  login | register | forgot-password | onboarding | auth/callback
  globals.css       design tokens
components/
  ui/               badge, button, card, dialog, fields, markdown-editor,
                    skeleton, states
  patterns/         data-table, page-header, stat-card, status
  products/         product-form (+ draftFromProduct / EMPTY_DRAFT)
  providers/        language (i18n), tenant, theme, toast
  layout/           sidebar, topbar, command-palette
lib/
  domain.ts         typed domain models — the shared contract
  services.ts       the ONLY data boundary (see Invariants)
  supabase/         client (browser) · server · browser
  markdown.ts       Markdown subset used by storefront long copy
  format.ts · utils.ts (cn) · auth-gate.ts
proxy.ts            session gate
```

## Invariants — do not break these

1. **`lib/services.ts` is the only place that touches the backend.** UI code
   must never import a Supabase client directly. New data needs go through a
   service function.
2. **Types first.** Extend `lib/domain.ts` before wiring UI, and keep the
   service mappers (`mapProduct`, `mapVariant`, …) in sync with it.
3. **Everything is tenant-scoped.** Queries filter on `tenant_id`; the current
   tenant comes from `useTenant()`, backed by `tenant_owners`.
4. **`pb_id` is NOT NULL** on `products` / `categories` (POS sync owns it).
   Admin-created rows get a local `central-*` id via `localPbId()`.
5. **Trilingual + RTL.** UI strings live in
   `components/providers/language-provider.tsx` under `fr` / `ar` / `en`.
   Add a key to **all three** blocks — `t()` falls back to `fr`, then returns
   the raw key. Keep layout RTL-safe with logical properties (`ps-` `pe-`
   `ms-` `me-` `start-` `end-`), never `left` / `right`.
6. **Reuse before inventing.** Prefer existing `ui/` primitives and `patterns/`
   over new components. No new dependency without a stated justification.
7. **Never weaken verification to make something pass** — don't skip, disable,
   or silence a failing check.

## Data — Supabase project `rms`

Project ref `zhfietudqhbjuqjqfvpa` (`eu-central-1`). Credentials come from
`.env` (gitignored) and are read through `lib/supabase/*` — never hardcode.

Tables in play: `products`, `categories`, `variants`, `product_translations`,
`category_translations`, `variant_translations`, `orders` + `order_lines`,
`online_orders` + `online_order_items`, `tenants`, `tenant_owners`,
`languages`, `product_media`, `customers` + `customer_addresses`.

Things that have bitten before:

- `products.tenant_id` is **text**; `tenant_owners.tenant_id` is **uuid**.
  They compare fine as strings — just don't assume uuid.
- Translation rows are unique on `(product_id, language_code)`: upsert on that
  key. `product_translations.name` is **NOT NULL**.
- Storefront-facing columns on `products`: `slug`, `is_online`,
  `is_available`, `visibility`, `short_description`,
  `long_description` (Markdown), `images[]`, `seo_title`, `seo_description`,
  `custom_data` (jsonb).
- **RLS is inconsistent.** `products` carries a permissive
  `"Allow all for products"` policy (`FOR ALL`, `roles=public`, `USING true`)
  next to the tenant-owner policies, and `product_translations` is writable by
  any `authenticated` user. Treat RLS as a guard rail, not a security
  boundary — flag what you find instead of assuming it is safe.
- **Check the schema before assuming a column.** The live schema is the source
  of truth for this file; verify with the Supabase MCP tools (`list_tables`
  with `verbose`, or `information_schema`) rather than trusting memory.
- Storage buckets: `branding`, `product-images`, `product-media`,
  `app-releases`.

## Boundaries

- **The storefront is a separate repo** (`suqya-new-store`, and the older
  `estinad-landing` hardware store). Changes here do **not** affect how
  customers see products. If the task is about the customer-facing product
  page, the work belongs in that repo.
- Siblings under `../` (`control`, `ecosystem_admin`, `estinad_os`,
  `altis_web`, `sahara_loyalty_portal`) are independent — don't reach into
  them from here.

## Traps

- **`.env` is gitignored — and so is `.env.example`** (the root `.gitignore`
  has a bare `.env*` rule). A fresh clone has no env template; don't assume
  one exists.
- `next dev` regenerates the managed block at the top of this file. Leave it
  in place; committing it with your work keeps the tree clean.
- This checkout lives on Windows/WSL and files can arrive with CRLF while the
  git index holds LF, which surfaces as whole-file diffs. Check `git status`
  and `git diff` before staging, and never commit line-ending churn as if it
  were a real change.
