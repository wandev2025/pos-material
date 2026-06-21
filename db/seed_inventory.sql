-- =============================================================================
-- Seed: realistic Indonesian toko-bangunan inventory (for UI/UX testing)
-- -----------------------------------------------------------------------------
-- ~65 common building-material items across 9 categories, with units, rough
-- 2026 IDR prices, a derived cost (~85% of price), and a spread of stock levels
-- (some below min_stock, some pre-order/zero) so the inventory UI states are all
-- exercised. Prices are approximate — adjust to your real ones.
--
-- IDEMPOTENT: units are inserted only if missing; items are inserted only if an
-- item with the same name doesn't already exist. Safe to re-run.
--
-- HOW TO APPLY: Supabase Dashboard -> SQL Editor -> paste -> Run.
--   (Requires db/business_features.sql already applied — it adds inventory.cost.)
-- =============================================================================

-- 1) Units (metrics) — lowercase to match the app's convention.
insert into metrics (unit_name)
select u from unnest(array[
  'sak','batang','lembar','kg','roll','dus','pcs','galon','kaleng','pail',
  'botol','meter','m3','set','unit'
]) as u
where not exists (select 1 from metrics m where m.unit_name = u);

-- 2) Items. (item_name, unit, price, qty, min_stock, allow_preorder)
--    cost is derived as ~85% of price in the SELECT below.
insert into inventory (item_name, metric_id, price, quantity, min_stock, allow_preorder, cost)
select i.item_name, m.id, i.price, i.qty, i.min_stock, i.allow_preorder, round(i.price * 0.85)
from (values
  -- SEMEN & PEREKAT
  ('Semen Tiga Roda 50kg',      'sak',    68000,  120,  20, false),
  ('Semen Gresik 50kg',         'sak',    66000,   80,  20, false),
  ('Semen Padang 50kg',         'sak',    67000,   60,  20, false),
  ('Semen Putih 40kg',          'sak',   110000,   15,   5, false),
  ('Mortar Instan MU-301 40kg', 'sak',    95000,   30,  10, false),
  ('Semen Warna / Nat 1kg',     'pcs',    12000,   40,  10, false),

  -- BESI & BAJA
  ('Besi Beton Polos 8mm',      'batang', 46500,  200,  50, false),
  ('Besi Beton Polos 10mm',     'batang', 72000,  150,  40, false),
  ('Besi Beton Ulir 10mm',      'batang', 78000,  100,  30, false),
  ('Besi Beton 12mm',           'batang',105000,   18,  20, false),  -- low stock
  ('Besi Hollow 4x4',           'batang', 95000,   60,  15, false),
  ('Besi Hollow 2x4',           'batang', 62000,   70,  15, false),
  ('Baja Ringan Kanal C75',     'batang', 78000,   50,  10, false),
  ('Reng Baja Ringan',          'batang', 42000,   80,  20, false),
  ('Kawat Bendrat 1kg',         'kg',     22000,   30,  10, false),
  ('Kawat Ayam 1 Roll',         'roll',  185000,   10,   3, false),
  ('Paku 5cm 1kg',              'kg',     21000,   25,  10, false),
  ('Paku 7cm 1kg',              'kg',     20000,   25,  10, false),

  -- KAYU, TRIPLEK & PLAFON
  ('Triplek 9mm 122x244',       'lembar',165000,   30,   8, false),
  ('Triplek 12mm 122x244',      'lembar',210000,   20,   5, false),
  ('Triplek 4mm 122x244',       'lembar', 95000,   25,   8, false),
  ('Kayu Kaso 5x7 4m',          'batang', 75000,   40,  10, false),
  ('Kayu Reng 2x3 4m',          'batang', 28000,   60,  15, false),
  ('Gypsum 9mm 120x240',        'lembar', 72000,   25,   5, false),
  ('GRC Board 4mm',             'lembar', 78000,   20,   5, false),
  ('Hollow Plafon 4x4',         'batang', 18000,  100,  20, false),

  -- ATAP
  ('Genteng Beton Flat',        'pcs',     9500,  500, 100, false),
  ('Asbes Gelombang 150cm',     'lembar', 62000,   40,  10, false),
  ('Spandek 0.3mm',             'meter',  65000,  100,  20, false),
  ('Seng Gelombang BJLS 0.20',  'lembar', 58000,   50,  10, false),
  ('Nok Genteng Beton',         'pcs',    12000,   80,  20, false),

  -- CAT & FINISHING
  ('Cat Tembok Avitex 5kg',     'galon',  92000,   30,   8, false),
  ('Cat Tembok Dulux 2.5L',     'galon', 165000,    3,   5, false),  -- low stock
  ('Cat Tembok Catylac 25kg',   'pail',  410000,   10,   3, false),
  ('Cat Kayu/Besi Avian 1kg',   'kaleng', 68000,   25,   8, false),
  ('Cat Semprot Pylox',         'pcs',    32000,   40,  10, false),
  ('Thinner A 1L',              'botol',  22000,   30,  10, false),
  ('Plamir Tembok 5kg',         'kaleng', 45000,   20,   5, false),
  ('Waterproof Aquaproof 4kg',  'kaleng',175000,   12,   4, false),
  ('Lem Kayu Fox 1kg',          'kaleng', 35000,   25,   8, false),
  ('Lem Pipa PVC Isarplas',     'pcs',     9000,   50,  15, false),

  -- KERAMIK & GRANIT
  ('Keramik Lantai 40x40',      'dus',    58000,   60,  15, false),
  ('Keramik Lantai 50x50',      'dus',    72000,   40,  10, false),
  ('Keramik Dinding 25x40',     'dus',    62000,   35,  10, false),
  ('Granit 60x60',              'dus',   125000,    4,   6, false),  -- low stock
  ('Nat Keramik 1kg',           'pcs',    15000,   30,  10, false),

  -- PIPA & SANITASI
  ('Pipa PVC Rucika 3/4 inch',  'batang', 35000,   80,  15, false),
  ('Pipa PVC 4 inch',           'batang', 95000,   40,  10, false),
  ('Pipa PVC 1/2 inch',         'batang', 22000,  100,  20, false),
  ('Knee/Elbow PVC 1/2 inch',   'pcs',     3500,  200,  50, false),
  ('Tee PVC 3/4 inch',          'pcs',     5000,  150,  40, false),
  ('Kran Air 1/2 inch',         'pcs',    35000,   40,  10, false),
  ('Closet Jongkok',            'pcs',   185000,    2,   3, false),  -- low stock
  ('Floor Drain Stainless',     'pcs',    28000,   30,  10, false),
  ('Selang Air 1/2 inch',       'meter',   9000,  100,  20, false),
  ('Pompa Air Shimizu PC-260',  'unit', 1250000,    1,   2, true),   -- low + preorder
  ('Tandon Air 550L',           'unit',  950000,    0,   1, true),   -- preorder / out

  -- LISTRIK
  ('Kabel NYM 2x1.5 (1 Roll)',  'roll',  425000,    8,   2, false),
  ('Saklar Broco',              'pcs',    18000,   60,  15, false),
  ('Stop Kontak Broco',         'pcs',    22000,   50,  15, false),
  ('Lampu LED 12W Philips',     'pcs',    38000,   40,  10, false),
  ('MCB 6A Schneider',          'pcs',    45000,   20,   5, false),

  -- PERKAKAS & AGREGAT
  ('Cetok / Sendok Semen',      'pcs',    25000,   30,   8, false),
  ('Meteran 5m',                'pcs',    28000,   25,   8, false),
  ('Ember Cor 25L',             'pcs',    18000,   40,  10, false),
  ('Mata Bor Set',              'set',    55000,   15,   5, false),
  ('Pasir Pasang',              'm3',    280000,   20,   5, false),
  ('Pasir Beton',               'm3',    320000,   15,   5, false),
  ('Batu Split 1/2',            'm3',    350000,   12,   4, false),
  ('Batu Bata Merah',           'pcs',      800, 5000, 1000, false),
  ('Batako Press',              'pcs',     3500, 1000,  300, false),
  ('Bata Ringan / Hebel',       'm3',    650000,    0,   3, true)     -- preorder
) as i(item_name, unit, price, qty, min_stock, allow_preorder)
join metrics m on m.unit_name = i.unit
where not exists (select 1 from inventory inv where inv.item_name = i.item_name);
