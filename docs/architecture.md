# Architecture

## Stack

| Layer | Choice | Version (package.json) |
|---|---|---|
| App framework | Expo | SDK `~56.0.12` |
| Native runtime | React Native | `0.85.3` |
| Web runtime | react-native-web | `~0.21.0` |
| UI/React | React | `19.2.3` |
| Routing | expo-router | `~56.2.11` (typed routes) |
| Language | TypeScript (strict) | `~6.0.3` |
| Backend | Supabase JS | `@supabase/supabase-js ^2.108` |
| Animation | react-native-reanimated | `4.3.1` |
| Printing | `@point-of-sale/receipt-printer-encoder` | `^3.0` (+ in-house WebUSB/WebSerial) |
| Storage | `@react-native-async-storage/async-storage` | `2.2.0` (localStorage on web) |

`app.json` highlights: `web.output: "static"`, experiments `typedRoutes: true` and
`reactCompiler: true`. Because the React Compiler is on, components are auto-memoized — manual
`useMemo`/`useCallback` is optional (used where it also aids readability), not mandatory.

**Primary target is web** on a Windows + Chrome/Edge counter PC. Mobile builds work from the same
code but are secondary; some capabilities (WebUSB/WebSerial printing, `navigator.onLine` offline
detection) are web/Chromium-only by nature.

## Directory layout

See the project map in [`../AGENTS.md`](../AGENTS.md#project-map). The shape:

- `app/` — expo-router routes. `app/_layout.tsx` is the root; `app/(tabs)/` is the authenticated
  area with its own `_layout.tsx` (navigation chrome).
- `lib/` — non-UI logic: Supabase client, profile/auth context, formatting/number helpers, the
  printing transport layer, and the offline layer.
- `components/` — shared presentational pieces (`OfflineBanner`, `PrintPreviews`).
- `db/` — hand-applied SQL (see [database.md](database.md)).
- `docs/`, `agent/` — documentation and the optional local print helper.

## Routing & navigation

- **File-based routing** (expo-router). A file under `app/(tabs)/` *is* a route; `typedRoutes` makes
  `router.push('/(tabs)/pelanggan')` type-checked (you'll see `as any` casts in a few places where
  the typed-route generic is awkward — acceptable).
- **`app/(tabs)/_layout.tsx`** renders two different chromes from one file:
  - **Web** (`width > 768`): a custom collapsible **sidebar** (`SidebarItem`s) with a `MENU UTAMA`
    section (all roles) and an `ADMINISTRASI` section (managers only), then `<Tabs … tabBarStyle:{display:'none'}>`.
  - **Mobile**: a bottom **`<Tabs>`** bar; manager-only screens use `options={{ href: isManager ? undefined : null }}` to hide them.
  - Adding a screen = create the file **and** register it in both places.

## Auth, session & roles

- **`ProfileProvider`** (`lib/ProfileContext.tsx`) wraps the app: subscribes to Supabase auth,
  loads the `profiles` row, and exposes `useProfile() → { session, user, profile, isLoading }`.
- **`app/_layout.tsx` → `RootLayoutNav`** is the gate: while fonts/profile load it shows a spinner;
  with no session it redirects to `/login`; with a session it forces into `/(tabs)`.
- **Role hierarchy:** `SUPERADMIN > OWNER > ADMIN > STAFF`. Convenience: `isManager = OWNER || SUPERADMIN`.
- **Bootstrap:** public signup does **not** pick a role. A Postgres trigger (`db/roles.sql`
  `handle_new_user`) makes the **first** account `SUPERADMIN` and everyone after `STAFF`; managers
  promote others from the **Pengguna** (`users.tsx`) screen.
- **Per-screen guards** are client-side: `if (!isManager) return <AccessDenied/>`. Note RLS on the
  business tables is permissive for any authenticated user — see the security note in
  [database.md](database.md).

## Data layer

- **`lib/supabase.ts`** creates the client with the project URL + **anon key** (safe to ship; RLS is
  the real boundary). Uses a `SafeStorage` wrapper so SSR/static web export doesn't crash on
  `window`.
- **Reads:** `supabase.from('table').select(...)`. List screens load in `useEffect` and hold rows in
  local state.
- **Writes:** single-row writes use `insert/update/delete`. **Any operation that must change several
  rows atomically goes through a Postgres RPC** (`supabase.rpc('fn', args)`) — this is the project's
  core data rule, because the client cannot do a real transaction and naive multi-step writes can
  oversell stock or orphan rows. See `create_sale`, `update_sale`, `delete_sale`, `create_purchase`,
  `record_customer_payment`, `open_cash_session`, `close_cash_session`, `create_return`.
- **No global state library.** Screens own their state; cross-cutting concerns use React Context
  (`ProfileProvider`, `OfflineProvider`).

## Offline layer (`lib/offline/`)

Scope is a **resilient safeguard**, not full offline-first:

- `OfflineProvider` + `useOnline()` — connectivity from `navigator.onLine` + `online`/`offline`
  events (web; defaults to `true` on native — no NetInfo yet).
- `OfflineBanner` — mounted once at the app root; shows a bar when offline.
- Every write/submit button is disabled (and its handler early-returns) when offline.
- `cachedFetch(key, fetcher)` — caches the last successful read and serves it offline. (Wired where
  used; not every loader yet.) Live search boxes are not cached.

See the offline section in [conventions.md](conventions.md) for the exact usage pattern.

## Printing layer (`lib/printing/`)

A configurable per-document transport system with an automatic fallback chain so printing never
hard-fails. Fully documented in [printing.md](printing.md). Key idea: each document type
(`THERMAL`/`FAKTUR`/`DO`) maps to a transport (`WEBUSB`/`WEBSERIAL`/`AGENT`/`KIOSK`/`DIALOG`) chosen
in Setup; `printDocument()` tries it then falls back, with `DIALOG` (browser print) as the always-
available terminal.

## How this codebase was built (context)

Large feature sets here were built with **multi-agent workflows** (the Claude Code `Workflow` tool):
a shared contract → parallel agents create independent new files (one DB SQL file, one screen each,
offline infra) → a single sequential agent integrates shared files (`_layout`, `pos.tsx`) → `tsc`
verify → adversarial review. That's why features are vertically consistent (every screen mirrors the
same conventions) and why schema lives in self-contained idempotent SQL files rather than a
migration chain. When extending, keep that consistency.
