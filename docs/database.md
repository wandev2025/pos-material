# Database

Supabase Postgres. The app talks to it via PostgREST (`supabase-js`) using the public **anon key**;
**RLS** is the security boundary.

## How schema is managed — IMPORTANT

There is **no migration framework** (no Prisma, no `supabase migration`, no numbered chain that runs
automatically). Schema is a small set of **idempotent SQL files** in `db/`, applied **by hand**:

> **Supabase Dashboard → SQL Editor → paste the file → Run.**
> (Or `psql "<connection-string>" -f db/<file>.sql` if you have the DB password.)

Every file is safe to re-run: `create table if not exists`, `alter table … add column if not exists`,
`create or replace function`, and `drop policy if exists` → `create policy`. **After you edit any
`db/*.sql`, the change is not live until the user re-runs that file** — always say so.

### The files

| File | Contents |
|---|---|
| `db/roles.sql` | `handle_new_user` trigger (first user = SUPERADMIN, rest STAFF), `current_user_role()` helper, and `profiles` RLS policies. |
| `db/atomic_pos.sql` | Core POS columns + the atomic sale RPCs: `create_sale`, `update_sale`, `delete_sale`. Also the `allow_preorder`, `discount`, and `customer_id` columns. |
| `db/business_features.sql` | Suppliers, purchasing, customers/piutang, cash sessions, returns — tables + RPCs (`create_purchase`, `record_customer_payment`, `open_cash_session`, `close_cash_session`, `create_return`). |

> A `db/migrations/` folder briefly existed for the printing `print_config` column; those files were
> applied and then deleted by the owner. The convention going forward is **one idempotent feature
> file**, not numbered migrations.

To verify a live function matches the repo without re-running, read its source from the catalog, e.g.
`select pg_get_functiondef('create_return'::regproc);` in the SQL Editor.

## Tables

Core (pre-existing):

- **`profiles`** — `id` (= `auth.users.id`), `full_name`, `role` (text: SUPERADMIN/OWNER/ADMIN/STAFF).
- **`inventory`** — `id`, `item_name`, `quantity`, `price`, `min_stock`, `allow_preorder` (bool),
  `cost` (moving-average buy cost), `metric_id?`.
- **`sales`** — `id`, `total_amount` (**net** payable), `payment_method`, `customer_name`,
  `customer_id?` (→ customers), `status` (PAID/PARTIAL/UNPAID), `down_payment`, `discount`,
  `amount_returned`, `employee_name`, `created_at`.
- **`sale_items`** — `id`, `sale_id`, `inventory_id`, `item_name`, `quantity`, `price_at_sale`,
  `discount`.
- **`payment_methods`** — `id`, `name`. **Name is load-bearing** (see below).
- **`metrics`** — `id`, `unit_name` (Pcs/Sak/Batang/…).
- **`print_settings`** — single row `id = 1`; shop profile, footers, and `print_config` (jsonb,
  per-document transport map). See [printing.md](printing.md).

Business features (`db/business_features.sql`):

- **`suppliers`** — `id`, `name`, `phone`, `address`.
- **`purchases`** — `id`, `supplier_id?`, `supplier_name`, `invoice_no`, `total_amount`,
  `paid_amount`, `status`, `note`, `employee_name`, `created_at`.
- **`purchase_items`** — `id`, `purchase_id` (cascade), `inventory_id`, `item_name`, `quantity`,
  `cost`.
- **`customers`** — `id`, `name`, `phone`, `address`.
- **`customer_payments`** — `id`, `customer_id`, `sale_id?` (null = general/account payment),
  `amount`, `method`, `note`, `employee_name`, `created_at`.
- **`cash_sessions`** — `id`, `employee_name`, `opening_float`, `opened_at`, `closed_at?`,
  `expected_cash?`, `counted_cash?`, `variance?`, `status` (OPEN/CLOSED), `note`.
- **`returns`** — `id`, `sale_id`, `customer_id?`, `refund_amount`, `refund_method`
  (CASH/CREDIT_REDUCTION), `employee_name`, `note`, `created_at`.
- **`return_items`** — `id`, `return_id` (cascade), `inventory_id`, `item_name`, `quantity`,
  `price_at_sale`.

## RPCs (atomic operations)

All are plpgsql, single-transaction, jsonb params. Call with `supabase.rpc('name', {...})`.

- **`create_sale(p_sale, p_items)`** — insert sale + items, decrement stock with
  `quantity = quantity - x` guarded by `quantity >= x OR allow_preorder` (atomic, overdraft-safe).
  Carries `customer_id`, `discount`, `down_payment`.
- **`update_sale(p_sale_id, p_sale, p_items)`** — restore old items' stock, swap items, re-decrement.
- **`delete_sale(p_sale_id)`** — restock + delete sale & items.
- **`create_purchase(p_purchase, p_items)`** — insert purchase + items, **raise** stock, and roll
  `inventory.cost` forward as a **moving average** (reads old qty/cost before incrementing,
  divide-by-zero safe), record supplier payable.
- **`record_customer_payment(p_payment)`** — insert a payment; if it targets a `sale_id`, recompute
  that sale's `status` (PAID when `down_payment + Σ payments ≥ total - amount_returned`).
- **`open_cash_session(p)` / `close_cash_session(p)`** — open with a float; close computes
  `expected = opening_float + cash sales + cash piutang payments − cash refunds`, **filtered to that
  cashier and the shift window**, then `variance = counted − expected`.
- **`create_return(p_return, p_items)`** — insert return + items, **restock**, compute
  `refund_amount = Σ qty × price_at_sale`, guard against returning more than sold (counting prior
  returns), bump `sales.amount_returned`, and choose `refund_method`: **cash** sale → `CASH`;
  **credit** sale (status PARTIAL/UNPAID or method `~ tempo`) → `CREDIT_REDUCTION`. It does **not**
  insert a payment row (see the money model).

## RLS & security posture

- **`profiles`** has real role-based RLS: `current_user_role()` (SECURITY DEFINER) lets a
  manager read all profiles and update roles; others see/edit only their own.
- **Business tables** (`suppliers`, `purchases`, `customers`, `customer_payments`, `cash_sessions`,
  `returns`, …) enable RLS with a **permissive `to authenticated using (true)`** policy — any
  signed-in user can read/write. **Role enforcement for manager-only screens is client-side only.**
  This matches the existing `sales`/`inventory` posture. If you need server-enforced manager gating,
  tighten these policies with `current_user_role()` — it's a deliberate future hardening, not done
  yet.
- The anon key in `lib/supabase.ts` is public by design; never put service-role keys in the client.

## Money & credit (piutang) model — read before touching sales/returns/payments

- `sales.total_amount` is the **net** amount payable (after discounts).
- **Tempo** = credit sale. It carries a `down_payment` and `status` PARTIAL/UNPAID, and **must** be
  linked to a `customer_id` (the POS enforces this) so the debt is tracked.
- **`amount_returned` is the single source of truth for returns.** A return lowers what's owed via
  `amount_returned` only — `create_return` deliberately does **not** also insert a `customer_payments`
  row (doing both would double-count the reduction).
- **Outstanding per nota** = `total_amount − down_payment − amount_returned − Σ(customer_payments for that sale_id)`.
- **Customer net piutang** = `Σ(per-nota outstanding) − Σ(general payments without a sale_id)`,
  clamped at ≥ 0. (`pelanggan.tsx` computes this in one pass; keep that formula in sync with the SQL
  if you change either.)

## Payment-method naming (load-bearing)

The app keys behavior off the **name** string of a `payment_methods` row:

- **Cash** detection (cash closing expected total; "cash refund" branch) matches `/tunai|cash/i`.
  Name your cash method e.g. `Tunai`.
- **Tempo/credit** flow (down-payment fields, require-customer, PARTIAL/UNPAID status, credit refund)
  triggers when the selected method's name contains `tempo`. Name the credit method e.g. `Tempo`.

If these names don't match, the cash drawer won't reconcile and credit debts won't be tracked.
