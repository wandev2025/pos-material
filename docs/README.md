# POSMATERIAL — Documentation

This folder is the durable knowledge base for **POSMATERIAL**, a point-of-sale + back-office app
for an Indonesian building-material shop (*toko bangunan*). It's written for future AI agents and
developers picking up the codebase cold.

> **Start with [`../AGENTS.md`](../AGENTS.md)** — the always-loaded quick guide (rules, project map,
> conventions). These docs go deeper.

## What POSMATERIAL is

- A cashier (POS) **and** the shop's operations: stock, purchasing, customer receivables (*piutang*),
  daily cash closing, returns, reports, and hardware printing.
- Runs **primarily as a web app** on a dedicated **Windows + Chrome/Edge** counter PC; the same
  Expo codebase also targets iOS/Android.
- All UI is **Bahasa Indonesia**.
- Backend is **Supabase** (Postgres + Auth). The app ships the public anon key; **RLS** protects data.

## Map of these docs

| Doc | What's in it |
|---|---|
| [architecture.md](architecture.md) | Stack & versions, directory layout, routing & navigation, auth/session/role flow, data layer, offline layer, and how the codebase was built (multi-agent workflows). |
| [database.md](database.md) | Every table & RPC, the RLS model, the money/credit (piutang) model, and **how to apply SQL** (hand-run, idempotent — no migration tool). |
| [features.md](features.md) | What each screen does and the business rules behind it (POS, inventory, purchasing, receivables, cash closing, returns, reports, setup, users). |
| [conventions.md](conventions.md) | Coding patterns to follow and anti-patterns to avoid (theme, helpers, responsive, role-guard, offline, atomic-RPC rule). |
| [printing.md](printing.md) | The configurable printing system end-to-end, the hardware, and `--kiosk-printing` setup. |

## The 60-second model

- **Sell** on `pos.tsx` → atomic `create_sale` RPC decrements stock safely. Cash, or **Tempo**
  (credit) with a down payment.
- **Tempo** sales attach a **customer** and become *piutang* tracked in `pelanggan.tsx`; payments
  are logged over time via `record_customer_payment`.
- **Restock** via `pembelian.tsx` → `create_purchase` raises stock, rolls a moving-average cost, and
  records supplier debt.
- **Returns** via `retur.tsx` → `create_return` restocks and refunds *smartly* (cash sale → cash;
  credit sale → lowers the bon).
- **Close the drawer** daily in `kasir.tsx` (expected vs counted cash, per cashier).
- **Print** struk/faktur/surat-jalan through a configurable transport layer (`lib/printing/`).

## Conventions in one breath

Red theme (`#DC2626`), Feather icons, `formatRupiah`/`parseNum` from `lib/`, `isDesktop = width > 900`,
manager-gated screens, multi-write operations always go through an **atomic Postgres RPC**, and SQL
is **hand-applied & idempotent**. Details in [conventions.md](conventions.md).
