# ESTINAD Central

Production-grade admin / control-plane for ESTINAD businesses — rebuilt from
scratch in the `estinad-central` Next.js project. It replaces the legacy
`cloud-admin` implementation with a cleaner architecture, consistent UX, and
the established ESTINAD product language.

## Stack

- **Next.js 16** (App Router) · **React 19** · **TypeScript** (strict)
- **Tailwind CSS v4**, CSS-first theme — no config file
- `lucide-react` icons · `recharts` charts · `clsx` + `tailwind-merge`
- `@supabase/ssr` + `@supabase/supabase-js` for Google OAuth session only
- No UI kit, no state library

## Design language

Ported from `estinad_os/packages/sahara_ui` (Flutter) — *"Professional, Dense,
Invisible"* (Linear-style). Brand lockup (`Monogram`, `logo-pos.jpg`,
`logo-lockup-image` treatment, `ESTINAD` wordmark + product eyebrow, app
icons) is shared verbatim with `control/`:

- Flat surfaces + 1px borders carry hierarchy (no shadows)
- Monochrome primary actions (black in light mode, white in dark)
- Indigo (`#5E6AD2`) reserved for active navigation / links
- Color reserved for status semantics (success / warning / danger / info)
- 4px spacing grid, radii 6 / 8 / 12 / 16, 150ms micro-interactions,
  `scale(0.98)` press feedback
- Dense 13–14px desktop-first type (Inter), tabular numbers for money
- Light + dark mode via class strategy (`dark:` variant = `.dark` class),
  persisted, OS-aware `system` option

## Architecture

```
app/
  page.tsx                    → redirect to /dashboard
  login | register | forgot-password | onboarding   (public)
  auth/callback               Google OAuth callback (code exchange + access gate)
  (app)/                      (shell: sidebar + topbar + ⌘K palette)
    dashboard | orders | orders/online | products (+new, +[id])
    categories | reports | settings | settings/business
components/
  ui/         primitives: button, badge, card, fields, dialog, skeleton, states
  patterns/   page-header, stat-card, data-table, status badges
  layout/     sidebar, topbar (tenant/language/theme), command-palette
  products/   product-form (shared create/edit)
  providers/  theme, language (fr/ar/en + RTL), tenant, toast
lib/
  domain.ts     typed models (mirrors the ESTINAD Core contract)
  services.ts   THE backend boundary — Supabase reads/writes (project `rms`), stable signatures
  format.ts     DZD + date formatting
  auth-gate.ts  console-access gate (demo: any authenticated user; prod: tenant_owners check)
  supabase/     browser + server + cached client (auth/session only, as in control)
proxy.ts        Supabase cookie refresh + session gate (steps aside without env)
.env.example    Supabase URL/anon key + Google redirect notes
```

**Backend:** `lib/services.ts` queries Supabase (project `rms`) through the
RLS-enforced browser client — catalog, orders, fulfillment updates, settings,
reporting views (`v_daily_sales`, `v_hourly_sales`, `v_payment_breakdown`,
`v_product_performance`), and trilingual content tables. Tenants resolve from
`tenant_owners` for the signed-in user; fulfillment writes are covered by the
tenant-scoped `online_orders` UPDATE policy. No demo dataset remains.

**Google sign-in** (same flow as `control/`): the login page offers
"Continue with Google" → Supabase `signInWithOAuth` → `/auth/callback`
exchanges the PKCE code server-side, enforces `lib/auth-gate.ts`, and
redirects to `/dashboard`. OAuth failures surface as `?error=` codes mapped
to localized messages. The e-mail form signs in via Supabase
`signInWithPassword` when configured, and falls back to the demo pass-through
(plus "Continuer en démo" shortcut) when it is not — so the gate can never
brick the app. Setup: copy `.env.example` to `.env.local`, set the
Supabase URL/anon key, and enable Google in the Supabase dashboard
(redirect: `<project>/auth/v1/callback`). Without env, the app runs in demo
mode: the Google button reports "provider not configured" (same message as
control) and `proxy.ts` steps aside.

## Routes & use cases (ported from cloud-admin, improved)

| Route | Use case |
|---|---|
| `/dashboard` | Revenue / orders / ticket / completion KPIs, hourly revenue chart, top products, recent orders |
| `/orders` | POS orders: search, status filter, CSV export, line-level detail dialog |
| `/orders/online` | Storefront orders: customer + wilaya/commune search, shipping filter, fulfillment dialog (tracking, mark shipped/delivered), CSV |
| `/products` | Catalog: search, category + availability filters, pagination, translation-coverage hint |
| `/products/new`, `/products/[id]` | Shared form: details/pricing/inventory, margin calculator, variable-product variants tab, dirty-form save bar, delete confirm |
| `/categories` | Hierarchy tree (expand/collapse), create/edit/delete dialogs, delete protection when products exist |
| `/reports` | 7/30-day range, KPI totals, daily revenue bars, payment-method donut, daily table, CSV export |
| `/settings` | Business identity, trial status, content languages, channel overview |
| `/settings/business` | 5-tab editor (general, ordering, storefront, branding, location) with dirty-form save bar |
| `/login`, `/register`, `/forgot-password`, `/onboarding` | Auth + 3-step setup wizard (fixed: legacy app had a `/` route conflict and a reset page that didn't exist) |

Cross-cutting: tenant switcher (persisted), FR/AR/EN UI with RTL, ⌘K
command palette (↑↓/Enter/Esc), keyboard-focusable everything, loading /
empty / no-results / error states on every data page.

## Develop

```bash
npm install
npm run dev      # http://localhost:3000
npm run build    # production build (also runs type check)
npx tsc --noEmit # type check
npx eslint       # lint
```

## Legacy issues fixed (vs cloud-admin)

- `/` route conflict (root page vs onboarding group) → single `/onboarding` route
- `/forgot-password` pointed at a non-existent `/reset-password` → coherent sent-state
- POS orders had a dead detail button → real line-level dialog
- `deleteProduct` had no UI → delete with confirm on the edit page
- Storage bucket mismatch (`product-images` vs `product-media`) → media deferred to Core
- Demo fallback loaded *all* tenants on empty membership → strict tenant scoping
- Hardcoded-French login, mixed-locale dates → full FR/AR/EN + RTL + DZD formatting
