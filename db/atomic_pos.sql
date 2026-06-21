-- =============================================================================
-- Atomic / transactional POS operations
-- =============================================================================
-- The app currently performs checkout / edit / delete as several separate
-- supabase calls (insert sale -> insert items -> update stock). That is NOT
-- transactional: a mid-way failure leaves orphaned rows or wrong stock, and
-- two cashiers selling the same item concurrently can oversell (lost update),
-- because the client writes an *absolute* quantity computed from stale state.
--
-- These Postgres functions do each operation in a SINGLE transaction and
-- decrement stock with `quantity = quantity - x` guarded by `quantity >= x`,
-- which is atomic and overdraft-safe.
--
-- HOW TO APPLY:
--   Supabase Dashboard -> SQL Editor -> paste this file -> Run.
--   (Or: supabase db execute < db/atomic_pos.sql)
--
-- HOW TO USE FROM THE CLIENT (replace the manual multi-step blocks in
-- app/(tabs)/pos.tsx once this is applied):
--
--   // checkout
--   const { data: sale, error } = await supabase.rpc('create_sale', {
--     p_sale: salePayload,        // total_amount, payment_method, customer_name,
--                                 // status, down_payment, employee_name
--     p_items: itemsToSave,       // [{ inventory_id, item_name, quantity, price_at_sale }]
--   });
--
--   // edit
--   const { error } = await supabase.rpc('update_sale', {
--     p_sale_id: editingSale.id, p_sale: salePayload, p_items: newItems,
--   });
--
--   // delete (restocks atomically)
--   const { error } = await supabase.rpc('delete_sale', { p_sale_id: sale.id });
--
-- Adjust column types below if your schema differs (this matches the columns
-- the app reads/writes today).
-- =============================================================================

-- Per-item preorder flag: when true the item can be sold even if stock is
-- insufficient (stock simply goes negative), so an out-of-stock item the owner
-- actually has — but forgot to restock in the app — never blocks a sale.
alter table inventory add column if not exists allow_preorder boolean not null default false;

-- Rupiah discounts: a per-line discount on each item, and a transaction-level
-- discount on the whole sale. total_amount is always stored as the NET payable.
alter table sales      add column if not exists discount numeric not null default 0;
alter table sale_items add column if not exists discount numeric not null default 0;

-- Create a sale + its items and decrement stock, all-or-nothing.
create or replace function create_sale(p_sale jsonb, p_items jsonb)
returns sales
language plpgsql
as $$
declare
  v_sale  sales;
  v_item  jsonb;
begin
  insert into sales (total_amount, payment_method, customer_name, status, down_payment, employee_name, discount, customer_id)
  values (
    (p_sale->>'total_amount')::numeric,
    p_sale->>'payment_method',
    p_sale->>'customer_name',
    p_sale->>'status',
    coalesce((p_sale->>'down_payment')::numeric, 0),
    p_sale->>'employee_name',
    coalesce((p_sale->>'discount')::numeric, 0),
    nullif(p_sale->>'customer_id', '')::bigint
  )
  returning * into v_sale;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    insert into sale_items (sale_id, inventory_id, item_name, quantity, price_at_sale, discount)
    values (
      v_sale.id,
      (v_item->>'inventory_id')::bigint,
      v_item->>'item_name',
      (v_item->>'quantity')::numeric,
      (v_item->>'price_at_sale')::numeric,
      coalesce((v_item->>'discount')::numeric, 0)
    );

    update inventory
       set quantity = quantity - (v_item->>'quantity')::numeric
     where id = (v_item->>'inventory_id')::bigint
       and (quantity >= (v_item->>'quantity')::numeric or allow_preorder);

    if not found then
      raise exception 'Stok tidak cukup untuk %', v_item->>'item_name';
    end if;
  end loop;

  return v_sale;
end;
$$;

-- Restore the old items' stock, swap in the new items, re-decrement stock.
create or replace function update_sale(p_sale_id bigint, p_sale jsonb, p_items jsonb)
returns sales
language plpgsql
as $$
declare
  v_sale  sales;
  v_item  jsonb;
begin
  -- Give back stock taken by the existing line items.
  update inventory inv
     set quantity = inv.quantity + si.quantity
    from sale_items si
   where si.sale_id = p_sale_id
     and si.inventory_id = inv.id;

  delete from sale_items where sale_id = p_sale_id;

  update sales
     set total_amount   = (p_sale->>'total_amount')::numeric,
         payment_method = p_sale->>'payment_method',
         customer_name  = p_sale->>'customer_name',
         status         = p_sale->>'status',
         down_payment   = coalesce((p_sale->>'down_payment')::numeric, 0),
         discount       = coalesce((p_sale->>'discount')::numeric, 0),
         customer_id    = nullif(p_sale->>'customer_id', '')::bigint
   where id = p_sale_id
   returning * into v_sale;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    insert into sale_items (sale_id, inventory_id, item_name, quantity, price_at_sale, discount)
    values (
      p_sale_id,
      (v_item->>'inventory_id')::bigint,
      v_item->>'item_name',
      (v_item->>'quantity')::numeric,
      (v_item->>'price_at_sale')::numeric,
      coalesce((v_item->>'discount')::numeric, 0)
    );

    update inventory
       set quantity = quantity - (v_item->>'quantity')::numeric
     where id = (v_item->>'inventory_id')::bigint
       and (quantity >= (v_item->>'quantity')::numeric or allow_preorder);

    if not found then
      raise exception 'Stok tidak cukup untuk %', v_item->>'item_name';
    end if;
  end loop;

  return v_sale;
end;
$$;

-- Delete a sale and restock its items, atomically.
create or replace function delete_sale(p_sale_id bigint)
returns void
language plpgsql
as $$
begin
  update inventory inv
     set quantity = inv.quantity + si.quantity
    from sale_items si
   where si.sale_id = p_sale_id
     and si.inventory_id = inv.id;

  delete from sale_items where sale_id = p_sale_id;
  delete from sales      where id = p_sale_id;
end;
$$;
