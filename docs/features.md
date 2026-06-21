# Features

What each screen does and the business rules behind it. Screens live in `app/(tabs)/`. Manager =
OWNER or SUPERADMIN.

## Dashboard — `index.tsx` (all roles)

Landing screen after login: greeting, live clock, today's sales overview, and the user's role/credential
status. Read-only.

## POS / Kasir — `pos.tsx` (all roles) — the core screen

Two tabs: **KASIR** (new sale) and **RIWAYAT** (recent sales).

- **Cart:** per-row server-side item search (`inventory.ilike`, debounced), quantity steppers, and a
  per-line **discount**; a fresh row auto-appends. Stock is shown and over-sell is blocked unless the
  item is `allow_preorder`.
- **Payment:** pick a `payment_method`. **Cash** → enter cash received, see change. **Tempo**
  (method name contains `tempo`) → enter a **down payment**, see remaining; a Tempo sale **requires a
  linked customer** (pick or quick-create) so the debt lands in *piutang*.
- **Customer picker:** debounced search over `customers`, an "Umum" (none) option, and inline
  quick-create. Sets `customer_id` on the sale.
- **Checkout:** `create_sale` RPC (atomic stock decrement). Status is PAID for cash, PARTIAL/UNPAID
  for Tempo based on the down payment.
- **Print:** after a sale (and from RIWAYAT reprint) a modal offers **Struk / Faktur / Surat Jalan**,
  each with an **eye → preview** (renders the real print HTML in an iframe on web). Routed through
  `printDocument` — see [printing.md](printing.md).
- **History edit/delete** (manager) go through `update_sale` / `delete_sale` (atomic, restock-correct).
- Checkout is disabled offline.

## Inventory — `inventory.tsx`

Stock list with search; add/edit items (name, price, `min_stock`, unit/`metric`, `allow_preorder`).
Manual stock **adjust** (stepper) writes an adjustment log; a stock **transfer/split** between items
exists. `cost` (HPP) is maintained automatically by purchasing, not edited here.

## Pembelian / Stok Masuk — `pembelian.tsx` (manager)

Record goods received from a supplier.

- Supplier picker (client-side filter over loaded suppliers; free-text name allowed → auto-created on
  submit).
- POS-style item table with **buy cost** per unit (prefilled from `inventory.cost`).
- Fields: invoice no., amount **paid**, note → live total, **sisa hutang** (outstanding), and a
  PAID/PARTIAL/UNPAID status.
- Submit → `create_purchase`: raises stock, rolls the **moving-average `inventory.cost`**, records the
  supplier payable. A recent-purchases list shows supplier debt.

## Pelanggan + Buku Piutang — `pelanggan.tsx` (manager)

Customer master + receivables ledger (master–detail: split panes on desktop, modal on mobile).

- Customer list with search and a total-piutang summary bar; add/edit customers.
- Per-customer **ledger**: net outstanding hero, unpaid notas with per-nota *sisa*, and payment
  history. Math = the piutang model in [database.md](database.md), computed in one pass.
- **Catat Pembayaran** → `record_customer_payment` (amount, method, optional allocation to a specific
  nota, note). Updates that nota's status.
- **Cetak Statement** → prints a customer statement (shared `printHtmlViaIframe` on web, expo-print
  on native).
- Writes disabled offline.

## Retur — `retur.tsx` (manager)

Returns against an existing sale.

- Pick/search a nota → load its `sale_items`; choose items + quantities (clamped to sold).
- Live refund total. Submit → `create_return`: **restocks**, guards against over-returning across
  repeated returns, bumps `amount_returned`, and refunds **smartly** — cash sale → **cash refund**;
  credit sale → **reduces the customer's bon** (via `amount_returned`, not a payment row). The result
  message states which happened. A recent-returns list is shown.

## Tutup Kasir — `kasir.tsx` (all cashiers)

Per-cashier daily cash reconciliation (`employee_name` = `profile.full_name`).

- No open session → **Buka Kasir** (opening float) → `open_cash_session`.
- Open session → live "perkiraan kas" (float + this shift's cash sales) and **Tutup Kasir** (counted
  cash) → `close_cash_session` computes expected vs counted and the **variance/selisih** (red/green).
  Expected counts only **this cashier's** cash sales + cash piutang payments − cash refunds in the
  shift window.
- Lists recent closed shifts with variance.

## Laporan — `laporan.tsx` (manager)

Reports: sales (OMZET hero), receivables (piutang), top items, cashier breakdown, total discount.
Read-only aggregation over `sales`/`sale_items`/`customer_payments`.

## Setup — `setup.tsx` (manager)

Sub-tabs:
- **Toko & Footer:** shop name/address/phone and the thermal/faktur/DO footers (`print_settings`).
- **Printer (Hardware):** per-document **method** (transport), printer/pairing, paper size — the
  printing control panel. See [printing.md](printing.md). Only polls the local print agent when a
  document is mapped to `AGENT`.
- **Satuan (Unit):** manage `metrics`.
- **Metode Bayar:** manage `payment_methods` — **mind the naming rules** (`tunai`/`cash`, `tempo`).

## Pengguna — `users.tsx` (manager)

List users and change roles (backed by the `profiles` manager RLS policies). The first-ever account
is auto-SUPERADMIN; everyone else starts STAFF and is promoted here.

## Auth — `login.tsx` / `signup.tsx`

Responsive split-screen (brand panel + form on desktop, centered card on mobile), red theme.
Signup creates an `auth.users` row; the `handle_new_user` trigger creates the matching `profiles`
row with the bootstrapped role.
