# AGENTS.md — POSMATERIAL

Guide for any AI/developer working in this repo. Read this first, then `docs/` for depth.

## What this is

**POSMATERIAL** — a point-of-sale + back-office app for an Indonesian building-material shop
(*toko bangunan*). It runs **primarily as a web app on a Windows + Chrome/Edge counter PC**, and
also builds for iOS/Android from the same code. All UI copy is **Bahasa Indonesia**.

Stack: **Expo SDK 56** (React Native 0.85 + `react-native-web`), **expo-router** (file-based,
typed routes), **Supabase** (Postgres + Auth), **TypeScript** (strict). State is local React
(`useState`/`useMemo`) — there is no global store. `reactCompiler` is enabled, so manual
memoization is a nicety, not a requirement.

## Critical rules (do not skip)

1. **Expo has changed.** Before writing code that touches an Expo/RN API, check the exact
   versioned docs: https://docs.expo.dev/versions/v56.0.0/. Don't rely on memory of older SDKs.
2. **The database is migrated by hand.** There is **no migration framework**. Schema lives in
   `db/*.sql` as **idempotent** files (`create table if not exists`, `add column if not exists`,
   `create or replace function`, `drop policy if exists` → `create policy`). To apply changes you
   (or the user) paste the file into **Supabase Dashboard → SQL Editor → Run**. After editing any
   `db/*.sql`, tell the user to re-run that file. See `docs/database.md`.
3. **Keep `tsc` clean.** `npx tsc --noEmit` (or `./node_modules/.bin/tsc --noEmit`) must pass with
   zero errors before you consider work done. Strict mode is on.
4. **Don't commit or push unless asked.** When asked, commit only the relevant change set — the
   working tree often contains the user's parallel WIP (animations, etc.); never sweep it in with
   `git add -A`. Branch is usually `fixes`, not `main`.
5. **Prefer ripgrep (`rg`)** over grep/find.

## Commands

```bash
npm run web        # expo start --web  (the primary target; localhost = secure context)
npm start          # expo start (dev menu / QR)
npm run android | npm run ios
npm run lint       # expo lint
./node_modules/.bin/tsc --noEmit   # typecheck
```
No test suite exists. "Done" = `tsc` clean + (when possible) a manual click-through.

## Project map

```
app/                       expo-router routes
  _layout.tsx              root: ProfileProvider + OfflineProvider + auth-gated Stack
  login.tsx, signup.tsx    auth (responsive split screen; red theme)
  index.tsx                redirects to /login
  (tabs)/
    _layout.tsx            web sidebar + mobile tab bar, role-gated nav
    index.tsx              dashboard
    pos.tsx                cashier (the core screen): cart, discount, tempo/DP, customer, print
    inventory.tsx          stock
    pembelian.tsx          purchasing / goods-in (manager)
    pelanggan.tsx          customers + receivables ledger (manager)
    retur.tsx              returns (manager)
    kasir.tsx              daily cash closing (all cashiers)
    laporan.tsx            reports (manager)
    setup.tsx              shop profile, printer config, units, payment methods (manager)
    users.tsx             user/role management (manager)
lib/
  supabase.ts              Supabase client (anon key; RLS protects data)
  ProfileContext.tsx       session + profile{role}; useProfile()
  number.ts                parseNum() — always parse user numeric input with this
  format.ts                formatRupiah() — the ONE currency formatter; never re-roll it
  printerStore.ts          machine-local paired-printer + default-printer storage
  printing/                configurable per-document print transports (see docs/printing.md)
  offline/                 OfflineProvider/useOnline + cachedFetch
components/
  PrintPreviews.tsx        on-screen receipt/faktur/DO previews (native)
  OfflineBanner.tsx        app-wide offline banner
db/                        hand-applied SQL (atomic_pos.sql, business_features.sql, roles.sql)
docs/                      architecture / database / features / conventions / printing
agent/                     optional local print helper (localhost:3001)
```

## How things work (essentials)

- **Routing/nav:** a new screen is just `app/(tabs)/<name>.tsx`. Visibility/labels live in
  `app/(tabs)/_layout.tsx` (web sidebar + mobile `<Tabs.Screen>`). Manager-only screens gate with
  `href: isManager ? undefined : null`.
- **Auth/roles:** `app/_layout.tsx` redirects to `/login` when no session. Roles are
  `SUPERADMIN > OWNER > ADMIN > STAFF`; `isManager = role === 'OWNER' || 'SUPERADMIN'`. The **first
  account ever** becomes SUPERADMIN, everyone else STAFF (`db/roles.sql` trigger). Screens guard
  with `if (!isManager) return <AccessDenied/>` at the top.
- **Data:** read/write with `supabase.from(...)`; **multi-step writes go through an atomic Postgres
  RPC** (`supabase.rpc(...)`), never several client calls — see `create_sale`, `create_purchase`,
  `create_return`, `record_customer_payment`, `close_cash_session`. RLS is on; the anon key is safe
  to ship.
- **Money/credit:** `total_amount` is the **net** payable. Tempo (credit) sales carry a
  `down_payment` and `status` PARTIAL/UNPAID; `amount_returned` is the **single source of truth**
  for returns (don't also subtract a return as a payment). Outstanding piutang =
  `total - down_payment - amount_returned - Σ payments`. Details in `docs/database.md`.

## UI conventions

- Theme: primary **red `#DC2626`**, dark `#0F172A`, slate grays (`#64748B/#94A3B8/#E2E8F0/#F8FAFC`),
  white rounded cards, **Feather** icons.
- Responsive: `const { width } = useWindowDimensions(); const isDesktop = width > 900` (POS uses
  1100). Desktop = multi-column / sidebar; mobile = stacked / tab bar.
- Money: `import { formatRupiah } from '../../lib/format'`. Numeric input: `parseNum`.
- Offline: disable every write/submit button with `useOnline()` from `lib/offline/OfflineContext`
  **and** early-return in the handler. The `OfflineBanner` is mounted once at root.
- Match the existing screens (`inventory.tsx`, `setup.tsx`) for structure before adding new ones.
  See `docs/conventions.md`.

## Gotchas that will bite you

- **Payment-method names are load-bearing.** Cash logic matches `/tunai|cash/i`; the credit/Tempo
  flow triggers only when the method name contains `tempo`. Configure them in Setup accordingly.
- **Silent printing** needs setup: the struk uses raw ESC/POS over WebUSB/WebSerial (Chromium +
  secure context), full-page faktur/DO use the browser's `--kiosk-printing`. Full guide:
  `docs/printing.md`.
- **Hardware (current deployment):** struk = **Bixolon SRP-275III** (impact, ESC/POS, 76 mm = 40
  columns — *not* Epson, *not* thermal); faktur/DO = **Epson LX-310** (dot-matrix). Both are
  swappable from Setup → Printer (no code change).
- **Offline today** = banner + writes blocked; cached reads (`cachedFetch`) are wired only where
  used. Native offline detection is web-only (no NetInfo yet).
- `outlineStyle: 'none' as any` on web `TextInput`s removes the focus ring — keep that pattern.

## Read next

- `docs/README.md` — doc index & overview
- `docs/architecture.md` — stack, routing, auth, data, offline, build approach
- `docs/database.md` — every table, RPC, RLS, the money/credit model, how to apply SQL
- `docs/features.md` — what each screen does and the business rules
- `docs/conventions.md` — coding patterns to follow (and anti-patterns to avoid)
- `docs/printing.md` — the printing system end-to-end + `--kiosk-printing`
