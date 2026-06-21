-- =============================================================================
-- Seed: realistic Indonesian toko-bangunan inventory (for UI/UX testing)
-- -----------------------------------------------------------------------------
-- ~70 common building-material items across 9 categories, with units, rough
-- 2026 IDR prices, a derived cost (~85% of price), a spread of stock levels
-- (some below min_stock, some pre-order/zero), and a category on every item so
-- the POS command-palette picker groups them out of the box.
--
-- IDEMPOTENT: units are inserted only if missing; items are inserted only if an
-- item with the same name doesn't already exist. Safe to re-run.
--
-- HOW TO APPLY: Supabase Dashboard -> SQL Editor -> paste -> Run.
--   (Requires db/business_features.sql + db/atomic_pos.sql already applied —
--    they add inventory.cost and inventory.category.)
-- =============================================================================

-- 1) Units (metrics) — lowercase to match the app's convention.
insert into metrics (unit_name)
select u from unnest(array[
  'sak','batang','lembar','kg','roll','dus','pcs','galon','kaleng','pail',
  'botol','meter','m3','set','unit'
]) as u
where not exists (select 1 from metrics m where m.unit_name = u);

-- 2) Items. (item_name, unit, price, qty, min_stock, allow_preorder, category)
--    cost is derived as ~85% of price in the SELECT below.
insert into inventory (item_name, metric_id, price, quantity, min_stock, allow_preorder, cost, category)
select i.item_name, m.id, i.price, i.qty, i.min_stock, i.allow_preorder, round(i.price * 0.85), i.category
from (values
  -- SEMEN & PEREKAT
  ('Semen Tiga Roda 50kg',      'sak',    68000,  120,  20, false, 'Semen & Perekat'),
  ('Semen Gresik 50kg',         'sak',    66000,   80,  20, false, 'Semen & Perekat'),
  ('Semen Padang 50kg',         'sak',    67000,   60,  20, false, 'Semen & Perekat'),
  ('Semen Putih 40kg',          'sak',   110000,   15,   5, false, 'Semen & Perekat'),
  ('Mortar Instan MU-301 40kg', 'sak',    95000,   30,  10, false, 'Semen & Perekat'),
  ('Semen Warna / Nat 1kg',     'pcs',    12000,   40,  10, false, 'Semen & Perekat'),

  -- BESI & BAJA
  ('Besi Beton Polos 8mm',      'batang', 46500,  200,  50, false, 'Besi & Baja'),
  ('Besi Beton Polos 10mm',     'batang', 72000,  150,  40, false, 'Besi & Baja'),
  ('Besi Beton Ulir 10mm',      'batang', 78000,  100,  30, false, 'Besi & Baja'),
  ('Besi Beton 12mm',           'batang',105000,   18,  20, false, 'Besi & Baja'),  -- low stock
  ('Besi Hollow 4x4',           'batang', 95000,   60,  15, false, 'Besi & Baja'),
  ('Besi Hollow 2x4',           'batang', 62000,   70,  15, false, 'Besi & Baja'),
  ('Baja Ringan Kanal C75',     'batang', 78000,   50,  10, false, 'Besi & Baja'),
  ('Reng Baja Ringan',          'batang', 42000,   80,  20, false, 'Besi & Baja'),
  ('Kawat Bendrat 1kg',         'kg',     22000,   30,  10, false, 'Besi & Baja'),
  ('Kawat Ayam 1 Roll',         'roll',  185000,   10,   3, false, 'Besi & Baja'),
  ('Paku 5cm 1kg',              'kg',     21000,   25,  10, false, 'Besi & Baja'),
  ('Paku 7cm 1kg',              'kg',     20000,   25,  10, false, 'Besi & Baja'),

  -- KAYU, TRIPLEK & PLAFON
  ('Triplek 9mm 122x244',       'lembar',165000,   30,   8, false, 'Kayu & Plafon'),
  ('Triplek 12mm 122x244',      'lembar',210000,   20,   5, false, 'Kayu & Plafon'),
  ('Triplek 4mm 122x244',       'lembar', 95000,   25,   8, false, 'Kayu & Plafon'),
  ('Kayu Kaso 5x7 4m',          'batang', 75000,   40,  10, false, 'Kayu & Plafon'),
  ('Kayu Reng 2x3 4m',          'batang', 28000,   60,  15, false, 'Kayu & Plafon'),
  ('Gypsum 9mm 120x240',        'lembar', 72000,   25,   5, false, 'Kayu & Plafon'),
  ('GRC Board 4mm',             'lembar', 78000,   20,   5, false, 'Kayu & Plafon'),
  ('Hollow Plafon 4x4',         'batang', 18000,  100,  20, false, 'Kayu & Plafon'),

  -- ATAP
  ('Genteng Beton Flat',        'pcs',     9500,  500, 100, false, 'Atap'),
  ('Asbes Gelombang 150cm',     'lembar', 62000,   40,  10, false, 'Atap'),
  ('Spandek 0.3mm',             'meter',  65000,  100,  20, false, 'Atap'),
  ('Seng Gelombang BJLS 0.20',  'lembar', 58000,   50,  10, false, 'Atap'),
  ('Nok Genteng Beton',         'pcs',    12000,   80,  20, false, 'Atap'),

  -- CAT & FINISHING
  ('Cat Tembok Avitex 5kg',     'galon',  92000,   30,   8, false, 'Cat & Finishing'),
  ('Cat Tembok Dulux 2.5L',     'galon', 165000,    3,   5, false, 'Cat & Finishing'),  -- low stock
  ('Cat Tembok Catylac 25kg',   'pail',  410000,   10,   3, false, 'Cat & Finishing'),
  ('Cat Kayu/Besi Avian 1kg',   'kaleng', 68000,   25,   8, false, 'Cat & Finishing'),
  ('Cat Semprot Pylox',         'pcs',    32000,   40,  10, false, 'Cat & Finishing'),
  ('Thinner A 1L',              'botol',  22000,   30,  10, false, 'Cat & Finishing'),
  ('Plamir Tembok 5kg',         'kaleng', 45000,   20,   5, false, 'Cat & Finishing'),
  ('Waterproof Aquaproof 4kg',  'kaleng',175000,   12,   4, false, 'Cat & Finishing'),
  ('Lem Kayu Fox 1kg',          'kaleng', 35000,   25,   8, false, 'Cat & Finishing'),
  ('Lem Pipa PVC Isarplas',     'pcs',     9000,   50,  15, false, 'Cat & Finishing'),

  -- KERAMIK & GRANIT
  ('Keramik Lantai 40x40',      'dus',    58000,   60,  15, false, 'Keramik'),
  ('Keramik Lantai 50x50',      'dus',    72000,   40,  10, false, 'Keramik'),
  ('Keramik Dinding 25x40',     'dus',    62000,   35,  10, false, 'Keramik'),
  ('Granit 60x60',              'dus',   125000,    4,   6, false, 'Keramik'),  -- low stock
  ('Nat Keramik 1kg',           'pcs',    15000,   30,  10, false, 'Keramik'),

  -- PIPA & SANITASI
  ('Pipa PVC Rucika 3/4 inch',  'batang', 35000,   80,  15, false, 'Pipa & Sanitasi'),
  ('Pipa PVC 4 inch',           'batang', 95000,   40,  10, false, 'Pipa & Sanitasi'),
  ('Pipa PVC 1/2 inch',         'batang', 22000,  100,  20, false, 'Pipa & Sanitasi'),
  ('Knee/Elbow PVC 1/2 inch',   'pcs',     3500,  200,  50, false, 'Pipa & Sanitasi'),
  ('Tee PVC 3/4 inch',          'pcs',     5000,  150,  40, false, 'Pipa & Sanitasi'),
  ('Kran Air 1/2 inch',         'pcs',    35000,   40,  10, false, 'Pipa & Sanitasi'),
  ('Closet Jongkok',            'pcs',   185000,    2,   3, false, 'Pipa & Sanitasi'),  -- low stock
  ('Floor Drain Stainless',     'pcs',    28000,   30,  10, false, 'Pipa & Sanitasi'),
  ('Selang Air 1/2 inch',       'meter',   9000,  100,  20, false, 'Pipa & Sanitasi'),
  ('Pompa Air Shimizu PC-260',  'unit', 1250000,    1,   2, true,  'Pipa & Sanitasi'),  -- low + preorder
  ('Tandon Air 550L',           'unit',  950000,    0,   1, true,  'Pipa & Sanitasi'),  -- preorder / out

  -- LISTRIK
  ('Kabel NYM 2x1.5 (1 Roll)',  'roll',  425000,    8,   2, false, 'Listrik'),
  ('Saklar Broco',              'pcs',    18000,   60,  15, false, 'Listrik'),
  ('Stop Kontak Broco',         'pcs',    22000,   50,  15, false, 'Listrik'),
  ('Lampu LED 12W Philips',     'pcs',    38000,   40,  10, false, 'Listrik'),
  ('MCB 6A Schneider',          'pcs',    45000,   20,   5, false, 'Listrik'),

  -- PERKAKAS & AGREGAT
  ('Cetok / Sendok Semen',      'pcs',    25000,   30,   8, false, 'Perkakas & Agregat'),
  ('Meteran 5m',                'pcs',    28000,   25,   8, false, 'Perkakas & Agregat'),
  ('Ember Cor 25L',             'pcs',    18000,   40,  10, false, 'Perkakas & Agregat'),
  ('Mata Bor Set',              'set',    55000,   15,   5, false, 'Perkakas & Agregat'),
  ('Pasir Pasang',              'm3',    280000,   20,   5, false, 'Perkakas & Agregat'),
  ('Pasir Beton',               'm3',    320000,   15,   5, false, 'Perkakas & Agregat'),
  ('Batu Split 1/2',            'm3',    350000,   12,   4, false, 'Perkakas & Agregat'),
  ('Batu Bata Merah',           'pcs',      800, 5000, 1000, false, 'Perkakas & Agregat'),
  ('Batako Press',              'pcs',     3500, 1000,  300, false, 'Perkakas & Agregat'),
  ('Bata Ringan / Hebel',       'm3',    650000,    0,   3, true,  'Perkakas & Agregat')   -- preorder
) as i(item_name, unit, price, qty, min_stock, allow_preorder, category)
join metrics m on m.unit_name = i.unit
where not exists (select 1 from inventory inv where inv.item_name = i.item_name);

-- Re-runs after the first seed: backfill category onto rows that pre-date it.
update inventory set category = 'Semen & Perekat'    where category is null and (item_name ilike 'Semen%' or item_name ilike 'Mortar%');
update inventory set category = 'Besi & Baja'         where category is null and (item_name ilike 'Besi%' or item_name ilike 'Baja%' or item_name ilike 'Reng%' or item_name ilike 'Kawat%' or item_name ilike 'Paku%');
update inventory set category = 'Atap'                where category is null and (item_name ilike 'Genteng%' or item_name ilike 'Asbes%' or item_name ilike 'Spandek%' or item_name ilike 'Seng%' or item_name ilike 'Nok%');
update inventory set category = 'Cat & Finishing'     where category is null and (item_name ilike 'Cat %' or item_name ilike 'Thinner%' or item_name ilike 'Plamir%' or item_name ilike 'Waterproof%' or item_name ilike 'Lem %');
update inventory set category = 'Keramik'             where category is null and (item_name ilike 'Keramik%' or item_name ilike 'Granit%' or item_name ilike 'Nat %');
update inventory set category = 'Pipa & Sanitasi'     where category is null and (item_name ilike 'Pipa%' or item_name ilike '%PVC%' or item_name ilike 'Kran%' or item_name ilike 'Closet%' or item_name ilike 'Floor Drain%' or item_name ilike 'Selang%' or item_name ilike 'Pompa%' or item_name ilike 'Tandon%');
update inventory set category = 'Listrik'             where category is null and (item_name ilike 'Kabel%' or item_name ilike 'Saklar%' or item_name ilike 'Stop Kontak%' or item_name ilike 'Lampu%' or item_name ilike 'MCB%');

-- 3) Suppliers — so the purchase (pembelian) supplier picker has data to pick from.
insert into suppliers (name, phone)
select s.name, s.phone from (values
  ('PT Semen Sejahtera',        '0811-2000-001'),
  ('UD Cahaya Baja',            '0811-2000-002'),
  ('CV Mitra Kayu Jaya',        '0811-2000-003'),
  ('Toko Atap Makmur',          '0811-2000-004'),
  ('Toko Cat Indah',            '0811-2000-005'),
  ('Gudang Keramik Nusantara',  '0811-2000-006'),
  ('Sumber Pipa Jaya',          '0811-2000-007'),
  ('Elektrik Makmur',           '0811-2000-008'),
  ('Toko Sumber Bangunan',      '0811-2000-009')
) as s(name, phone)
where not exists (select 1 from suppliers x where x.name = s.name);

-- 4) Tag each item with a likely "last supplier" (by category) for realistic display.
update inventory i set last_supplier_name = s.name, last_supplier_id = s.id
from suppliers s
where i.last_supplier_name is null and s.name = case i.category
  when 'Semen & Perekat'    then 'PT Semen Sejahtera'
  when 'Besi & Baja'        then 'UD Cahaya Baja'
  when 'Kayu & Plafon'      then 'CV Mitra Kayu Jaya'
  when 'Atap'               then 'Toko Atap Makmur'
  when 'Cat & Finishing'    then 'Toko Cat Indah'
  when 'Keramik'            then 'Gudang Keramik Nusantara'
  when 'Pipa & Sanitasi'    then 'Sumber Pipa Jaya'
  when 'Listrik'            then 'Elektrik Makmur'
  else 'Toko Sumber Bangunan'
end;
