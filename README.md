# POSMATERIAL

Point-of-sale + back-office for an Indonesian building-material shop (*toko bangunan*).
It runs **primarily as a web app** on a Windows + Chrome/Edge counter PC, and builds for
iOS/Android from the same codebase. All UI copy is in **Bahasa Indonesia**.

## Stack

- **Expo SDK 56** (React Native 0.85 + `react-native-web`), **expo-router** (file-based, typed routes)
- **Supabase** (Postgres + Auth) — the anon key is shipped in the client; **RLS** is the security boundary
- **TypeScript** (strict). State is local React (`useState`/`useMemo`); no global store. React Compiler is on.
- **Biome** for lint + format (Prettier replacement)

## Quick start

```bash
npm install
npm run web        # primary target; localhost is a secure context (needed for WebUSB printing)
# npm run android | npm run ios   # native builds from the same code
```

No environment setup is required — the Supabase URL and anon key live in `lib/supabase.ts`
(the anon key is safe to commit; data is protected by RLS).

## Scripts

| Command | What |
|---|---|
| `npm run web` / `start` / `android` / `ios` | Run the app (Expo) |
| `npm run lint` | Biome check (lint + format diff) |
| `npm run lint:fix` | Biome safe fixes + format + organize imports |
| `npm run format` | Biome format only |
| `npx tsc --noEmit` | Typecheck — **must be clean** (strict mode) |

A **pre-commit hook** (`.githooks/pre-commit`) runs `biome check` on staged files and blocks
commits on errors (warnings are allowed). It's wired via the `prepare` script
(`git config core.hooksPath .githooks`); bypass once with `git commit --no-verify`.

## Database

There is **no migration framework**. The schema lives as **idempotent** SQL in `db/*.sql`
(`create table if not exists`, `add column if not exists`, `create or replace function`,
`drop policy … / create policy`). Apply changes by pasting a file into
**Supabase Dashboard → SQL Editor → Run**. After editing any `db/*.sql`, re-run that file.
Multi-row writes go through atomic Postgres RPCs (`create_sale`, `create_purchase`,
`record_customer_payment`, `close_cash_session`, `create_return`). See `docs/database.md`.

## Printing

Configurable per-document transports: the struk (receipt) prints raw **ESC/POS** over
**WebUSB/WebSerial** (Chromium + secure context); full-page faktur/DO use the browser's
kiosk printing. Current hardware: **Bixolon SRP-275III** (impact, 76 mm / 40 col) for the
struk and **Epson LX-310** (dot-matrix) for faktur/DO — both swappable from Setup → Printer.
See `docs/printing.md`.

## Project layout & docs

Routes live in `app/` (`(tabs)/pos.tsx` is the cashier screen); shared code in `lib/`;
reusable UI in `components/`; hand-applied SQL in `db/`.

- **`AGENTS.md`** — the canonical guide for working in this repo (read first)
- **`docs/`** — `architecture`, `database`, `features`, `conventions`, `printing`
