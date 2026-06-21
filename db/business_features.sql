-- =============================================================================
-- Business features — suppliers, purchasing, customers/piutang, cash sessions,
-- returns, and the atomic operations that tie them to inventory & sales.
-- -----------------------------------------------------------------------------
-- New tables. (Created before the column adds below, because sales.customer_id
-- references customers(id).)
-- -----------------------------------------------------------------------------
create table if not exists suppliers (
  id         bigint generated always as identity primary key,
  name       text not null,
  phone      text,
  address    text,
  created_at timestamptz default now()
);

create table if not exists purchases (
  id            bigint generated always as identity primary key,
  supplier_id   bigint references suppliers(id),
  supplier_name text,
  invoice_no    text,
  total_amount  numeric not null default 0,
  paid_amount   numeric not null default 0,
  status        text not null default 'UNPAID',
  note          text,
  employee_name text,
  created_at    timestamptz default now()
);

create table if not exists purchase_items (
  id           bigint generated always as identity primary key,
  purchase_id  bigint references purchases(id) on delete cascade,
  inventory_id bigint references inventory(id),
  item_name    text,
  quantity     numeric not null,
  cost         numeric not null default 0,
  created_at   timestamptz default now()
);

create table if not exists customers (
  id         bigint generated always as identity primary key,
  name       text not null,
  phone      text,
  address    text,
  created_at timestamptz default now()
);

create table if not exists customer_payments (
  id            bigint generated always as identity primary key,
  customer_id   bigint references customers(id),
  sale_id       bigint references sales(id),
  amount        numeric not null,
  method        text,
  note          text,
  employee_name text,
  created_at    timestamptz default now()
);

create table if not exists cash_sessions (
  id            bigint generated always as identity primary key,
  employee_name text,
  opening_float numeric not null default 0,
  opened_at     timestamptz default now(),
  closed_at     timestamptz,
  expected_cash numeric,
  counted_cash  numeric,
  variance      numeric,
  status        text not null default 'OPEN',
  note          text
);

create table if not exists returns (
  id            bigint generated always as identity primary key,
  sale_id       bigint references sales(id),
  customer_id   bigint references customers(id),
  refund_amount numeric not null default 0,
  refund_method text,
  employee_name text,
  note          text,
  created_at    timestamptz default now()
);

create table if not exists return_items (
  id            bigint generated always as identity primary key,
  return_id     bigint references returns(id) on delete cascade,
  inventory_id  bigint references inventory(id),
  item_name     text,
  quantity      numeric not null,
  price_at_sale numeric not null,
  created_at    timestamptz default now()
);

-- -----------------------------------------------------------------------------
-- New columns on existing tables (after the tables above so the FK resolves).
-- -----------------------------------------------------------------------------
-- Link a sale to a customer (piutang tracking) + remember how much of it was
-- later returned, and carry a moving-average buy cost on each inventory item.
alter table sales     add column if not exists customer_id     bigint references customers(id);
alter table sales     add column if not exists amount_returned numeric not null default 0;
alter table inventory add column if not exists cost            numeric not null default 0;
-- "Where it's from": the most recent supplier this item was purchased from,
-- maintained by create_purchase. Name is denormalised for cheap display.
alter table inventory add column if not exists last_supplier_id   bigint references suppliers(id);
alter table inventory add column if not exists last_supplier_name text;

-- -----------------------------------------------------------------------------
-- Row level security — every new table is gated like sales/inventory: RLS on,
-- with a single permissive policy giving any signed-in (authenticated) user
-- full access. Policies are dropped-then-created so this stays idempotent.
-- -----------------------------------------------------------------------------
alter table suppliers         enable row level security;
alter table purchases         enable row level security;
alter table purchase_items    enable row level security;
alter table customers         enable row level security;
alter table customer_payments enable row level security;
alter table cash_sessions     enable row level security;
alter table returns           enable row level security;
alter table return_items      enable row level security;

drop policy if exists suppliers_authenticated_all on suppliers;
create policy suppliers_authenticated_all on suppliers
  for all to authenticated using (true) with check (true);

drop policy if exists purchases_authenticated_all on purchases;
create policy purchases_authenticated_all on purchases
  for all to authenticated using (true) with check (true);

drop policy if exists purchase_items_authenticated_all on purchase_items;
create policy purchase_items_authenticated_all on purchase_items
  for all to authenticated using (true) with check (true);

drop policy if exists customers_authenticated_all on customers;
create policy customers_authenticated_all on customers
  for all to authenticated using (true) with check (true);

drop policy if exists customer_payments_authenticated_all on customer_payments;
create policy customer_payments_authenticated_all on customer_payments
  for all to authenticated using (true) with check (true);

drop policy if exists cash_sessions_authenticated_all on cash_sessions;
create policy cash_sessions_authenticated_all on cash_sessions
  for all to authenticated using (true) with check (true);

drop policy if exists returns_authenticated_all on returns;
create policy returns_authenticated_all on returns
  for all to authenticated using (true) with check (true);

drop policy if exists return_items_authenticated_all on return_items;
create policy return_items_authenticated_all on return_items
  for all to authenticated using (true) with check (true);

-- -----------------------------------------------------------------------------
-- create_purchase — record a stock purchase + its line items, restock
-- inventory, and roll the buy cost forward as a moving average, all-or-nothing.
-- -----------------------------------------------------------------------------
create or replace function create_purchase(p_purchase jsonb, p_items jsonb)
returns purchases
language plpgsql
as $$
declare
  v_purchase purchases;
  v_item     jsonb;
  v_inv_id   bigint;
  v_in_qty   numeric;
  v_in_cost  numeric;
  v_old_qty  numeric;
  v_old_cost numeric;
begin
  insert into purchases (supplier_id, supplier_name, invoice_no, total_amount,
                         paid_amount, status, note, employee_name)
  values (
    nullif(p_purchase->>'supplier_id', '')::bigint,
    p_purchase->>'supplier_name',
    p_purchase->>'invoice_no',
    coalesce((p_purchase->>'total_amount')::numeric, 0),
    coalesce((p_purchase->>'paid_amount')::numeric, 0),
    coalesce(p_purchase->>'status', 'UNPAID'),
    p_purchase->>'note',
    p_purchase->>'employee_name'
  )
  returning * into v_purchase;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_inv_id  := nullif(v_item->>'inventory_id', '')::bigint;
    v_in_qty  := coalesce((v_item->>'quantity')::numeric, 0);
    v_in_cost := coalesce((v_item->>'cost')::numeric, 0);

    insert into purchase_items (purchase_id, inventory_id, item_name, quantity, cost)
    values (
      v_purchase.id,
      v_inv_id,
      v_item->>'item_name',
      v_in_qty,
      v_in_cost
    );

    if v_inv_id is not null then
      -- read the OLD qty/cost before incrementing so the average is correct
      select coalesce(quantity, 0), coalesce(cost, 0)
        into v_old_qty, v_old_cost
        from inventory
       where id = v_inv_id;

      update inventory
         set quantity = quantity + v_in_qty,
             cost = case
                      when (v_old_qty + v_in_qty) > 0
                      then ((v_old_qty * v_old_cost) + (v_in_qty * v_in_cost))
                           / (v_old_qty + v_in_qty)
                      else v_old_cost
                    end,
             last_supplier_id   = v_purchase.supplier_id,
             last_supplier_name = v_purchase.supplier_name
       where id = v_inv_id;
    end if;
  end loop;

  return v_purchase;
end;
$$;

-- -----------------------------------------------------------------------------
-- record_customer_payment — log a payment against a customer's outstanding,
-- then (if it targets a specific sale) recompute that sale's PAID/PARTIAL state.
-- -----------------------------------------------------------------------------
create or replace function record_customer_payment(p_payment jsonb)
returns customer_payments
language plpgsql
as $$
declare
  v_payment customer_payments;
  v_sale_id bigint;
  v_sale    sales;
  v_settled numeric;
begin
  insert into customer_payments (customer_id, sale_id, amount, method, note, employee_name)
  values (
    nullif(p_payment->>'customer_id', '')::bigint,
    nullif(p_payment->>'sale_id', '')::bigint,
    coalesce((p_payment->>'amount')::numeric, 0),
    p_payment->>'method',
    p_payment->>'note',
    p_payment->>'employee_name'
  )
  returning * into v_payment;

  v_sale_id := nullif(p_payment->>'sale_id', '')::bigint;
  if v_sale_id is not null then
    select * into v_sale from sales where id = v_sale_id;
    if v_sale.id is not null then
      v_settled := coalesce(v_sale.down_payment, 0)
                 + coalesce((select sum(amount) from customer_payments
                              where sale_id = v_sale_id), 0);

      update sales
         set status = case
                        when v_settled >= (coalesce(total_amount, 0)
                                           - coalesce(amount_returned, 0)) then 'PAID'
                        else 'PARTIAL'
                      end
       where id = v_sale_id;
    end if;
  end if;

  return v_payment;
end;
$$;

-- -----------------------------------------------------------------------------
-- open_cash_session — start a cashier's shift with an opening float.
-- -----------------------------------------------------------------------------
create or replace function open_cash_session(p jsonb)
returns cash_sessions
language plpgsql
as $$
declare
  v_session cash_sessions;
begin
  insert into cash_sessions (employee_name, opening_float, status)
  values (
    p->>'employee_name',
    coalesce((p->>'opening_float')::numeric, 0),
    'OPEN'
  )
  returning * into v_session;

  return v_session;
end;
$$;

-- -----------------------------------------------------------------------------
-- close_cash_session — count the drawer and reconcile it. Expected cash is the
-- opening float plus cash sales and cash piutang payments taken during the
-- shift, minus cash refunds; variance = counted - expected.
-- -----------------------------------------------------------------------------
create or replace function close_cash_session(p jsonb)
returns cash_sessions
language plpgsql
as $$
declare
  v_session    cash_sessions;
  v_session_id bigint;
  v_counted    numeric;
  v_expected   numeric;
  v_sales_cash numeric;
  v_pay_cash   numeric;
  v_ret_cash   numeric;
begin
  v_session_id := (p->>'session_id')::bigint;
  v_counted    := coalesce((p->>'counted_cash')::numeric, 0);

  select * into v_session from cash_sessions where id = v_session_id;
  if v_session.id is null then
    raise exception 'Sesi kas tidak ditemukan';
  end if;

  -- cash sales rung up by this cashier during the shift
  select coalesce(sum(total_amount), 0) into v_sales_cash
    from sales
   where (payment_method ilike '%tunai%' or payment_method ilike '%cash%')
     and created_at >= v_session.opened_at
     and created_at <= now()
     and employee_name = v_session.employee_name;

  -- cash piutang payments collected by THIS cashier during the shift
  select coalesce(sum(amount), 0) into v_pay_cash
    from customer_payments
   where (method ilike '%tunai%' or method ilike '%cash%')
     and created_at >= v_session.opened_at
     and created_at <= now()
     and employee_name = v_session.employee_name;

  -- cash refunds paid out by THIS cashier during the shift
  select coalesce(sum(refund_amount), 0) into v_ret_cash
    from returns
   where refund_method = 'CASH'
     and created_at >= v_session.opened_at
     and created_at <= now()
     and employee_name = v_session.employee_name;

  v_expected := coalesce(v_session.opening_float, 0)
              + v_sales_cash + v_pay_cash - v_ret_cash;

  update cash_sessions
     set counted_cash  = v_counted,
         expected_cash = v_expected,
         variance      = v_counted - v_expected,
         closed_at     = now(),
         status        = 'CLOSED'
   where id = v_session_id
   returning * into v_session;

  return v_session;
end;
$$;

-- -----------------------------------------------------------------------------
-- create_return — accept returned goods: record the return + line items,
-- restock inventory, and refund smartly. For a credit sale the refund reduces
-- the customer's outstanding (a RETUR payment row) instead of paying out cash.
-- -----------------------------------------------------------------------------
create or replace function create_return(p_return jsonb, p_items jsonb)
returns returns
language plpgsql
as $$
declare
  v_return    returns;
  v_item      jsonb;
  v_sale_id   bigint;
  v_sale      sales;
  v_cust_id   bigint;
  v_refund    numeric := 0;
  v_method    text := 'CASH';
  v_is_credit boolean := false;
  v_inv_id    bigint;
  v_qty       numeric;
  v_sold      numeric;
  v_already   numeric;
  v_settled   numeric;
begin
  v_sale_id := nullif(p_return->>'sale_id', '')::bigint;
  v_cust_id := nullif(p_return->>'customer_id', '')::bigint;

  -- refund_amount = sum(quantity * price_at_sale) over the returned items
  select coalesce(sum(
           coalesce((it->>'quantity')::numeric, 0)
           * coalesce((it->>'price_at_sale')::numeric, 0)
         ), 0)
    into v_refund
    from jsonb_array_elements(p_items) as it;

  -- smart refund: a credit sale (unpaid/partial or paid "tempo") settles via
  -- the customer's ledger; anything else is a cash refund
  if v_sale_id is not null then
    select * into v_sale from sales where id = v_sale_id;
    if v_sale.id is not null then
      v_is_credit := (v_sale.status in ('PARTIAL', 'UNPAID'))
                     or (coalesce(v_sale.payment_method, '') ilike '%tempo%');
    end if;
  end if;

  if v_is_credit then
    v_method := 'CREDIT_REDUCTION';
  end if;

  insert into returns (sale_id, customer_id, refund_amount, refund_method, employee_name, note)
  values (
    v_sale_id,
    v_cust_id,
    v_refund,
    v_method,
    p_return->>'employee_name',
    p_return->>'note'
  )
  returning * into v_return;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_inv_id := nullif(v_item->>'inventory_id', '')::bigint;
    v_qty    := coalesce((v_item->>'quantity')::numeric, 0);

    -- guard: never return more of a line than was sold, counting prior returns
    if v_sale_id is not null and v_inv_id is not null then
      select coalesce(sum(quantity), 0) into v_sold
        from sale_items where sale_id = v_sale_id and inventory_id = v_inv_id;
      select coalesce(sum(ri.quantity), 0) into v_already
        from return_items ri join returns r on r.id = ri.return_id
       where r.sale_id = v_sale_id and ri.inventory_id = v_inv_id;
      if (v_already + v_qty) > v_sold then
        raise exception 'Retur melebihi jumlah terjual untuk %', v_item->>'item_name';
      end if;
    end if;

    insert into return_items (return_id, inventory_id, item_name, quantity, price_at_sale)
    values (
      v_return.id,
      v_inv_id,
      v_item->>'item_name',
      v_qty,
      coalesce((v_item->>'price_at_sale')::numeric, 0)
    );

    -- restock the returned units
    if v_inv_id is not null then
      update inventory
         set quantity = quantity + v_qty
       where id = v_inv_id;
    end if;
  end loop;

  -- Track what was returned on the sale. amount_returned is the SINGLE source of
  -- truth for how much a return lowers the bill (outstanding is computed as
  -- total_amount - amount_returned - down_payment - payments), so a credit return
  -- must NOT also insert a RETUR customer_payments row — that would double-count.
  if v_sale_id is not null and v_sale.id is not null then
    update sales
       set amount_returned = coalesce(amount_returned, 0) + v_refund
     where id = v_sale_id;

    v_settled := coalesce(v_sale.down_payment, 0)
               + coalesce((select sum(amount) from customer_payments
                            where sale_id = v_sale_id), 0);

    update sales
       set status = 'PAID'
     where id = v_sale_id
       and v_settled >= (coalesce(total_amount, 0) - coalesce(amount_returned, 0));
  end if;

  return v_return;
end;
$$;
