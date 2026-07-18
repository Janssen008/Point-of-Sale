-- =====================================================================
-- ApexMoto POS — Supabase Database Schema
-- Run this entire file in: Supabase Dashboard → SQL Editor → New Query
-- =====================================================================

-- Enable UUID generation extension
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =====================================================================
-- TABLE: parts
-- Stores all motorcycle parts / products in inventory
-- =====================================================================
CREATE TABLE IF NOT EXISTS parts (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sku          TEXT NOT NULL UNIQUE,
  name         TEXT NOT NULL,
  category     TEXT NOT NULL,
  cost         NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
  price        NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
  stock        INTEGER NOT NULL DEFAULT 0,
  min_stock    INTEGER NOT NULL DEFAULT 2,
  alt_barcodes TEXT[] DEFAULT '{}',          -- Alternate barcodes/SKUs that resolve to this item
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

-- MIGRATION: If table already exists, add the alt_barcodes column:
-- ALTER TABLE parts ADD COLUMN IF NOT EXISTS alt_barcodes TEXT[] DEFAULT '{}';

-- =====================================================================
-- TABLE: customers
-- Customer CRM profiles
-- =====================================================================
CREATE TABLE IF NOT EXISTS customers (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name             TEXT NOT NULL,
  phone            TEXT NOT NULL,
  email            TEXT,
  outstanding_debt NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================================
-- TABLE: vehicles
-- Motorcycles linked to customers (one customer, many vehicles)
-- =====================================================================
CREATE TABLE IF NOT EXISTS vehicles (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  year        TEXT,
  make        TEXT NOT NULL,
  model       TEXT NOT NULL,
  plate       TEXT,
  vin         TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================================
-- TABLE: service_jobs (Work Orders)
-- Kanban-style repair tracking per vehicle
-- =====================================================================
CREATE TABLE IF NOT EXISTS service_jobs (
  id            TEXT PRIMARY KEY,
  customer_id   UUID REFERENCES customers(id) ON DELETE SET NULL,
  customer_name TEXT NOT NULL,
  vehicle       TEXT NOT NULL,
  description   TEXT NOT NULL,
  mechanic      TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'Draft'
                CHECK (status IN ('Draft', 'Pending Parts', 'In Progress', 'Testing', 'Ready', 'Completed')),
  labor_cost    NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================================
-- TABLE: service_job_parts
-- Parts allocated to a specific work order
-- =====================================================================
CREATE TABLE IF NOT EXISTS service_job_parts (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id     TEXT NOT NULL REFERENCES service_jobs(id) ON DELETE CASCADE,
  part_id    UUID REFERENCES parts(id) ON DELETE SET NULL,
  name       TEXT NOT NULL,
  quantity   INTEGER NOT NULL DEFAULT 1,
  price      NUMERIC(10, 2) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================================
-- TABLE: transactions
-- Completed sales (Retail POS + Service invoices)
-- =====================================================================
CREATE TABLE IF NOT EXISTS transactions (
  id             TEXT PRIMARY KEY,
  type           TEXT NOT NULL DEFAULT 'Retail'
                 CHECK (type IN ('Retail', 'Service')),
  customer_id    UUID REFERENCES customers(id) ON DELETE SET NULL,
  customer_name  TEXT NOT NULL DEFAULT 'Walk-in Customer',
  vehicle        TEXT,
  subtotal       NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
  tax            NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
  discount       NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
  total          NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
  payment_method TEXT NOT NULL DEFAULT 'Cash'
                 CHECK (payment_method IN ('Cash', 'Card', 'Wallet', 'Debt')),
  date           TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================================
-- TABLE: transaction_items
-- Line items for each completed transaction
-- =====================================================================
CREATE TABLE IF NOT EXISTS transaction_items (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id TEXT NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  part_id        TEXT,
  name           TEXT NOT NULL,
  quantity       INTEGER NOT NULL DEFAULT 1,
  price          NUMERIC(10, 2) NOT NULL
);

-- =====================================================================
-- INDEXES for performance
-- =====================================================================
CREATE INDEX IF NOT EXISTS idx_parts_category        ON parts(category);
CREATE INDEX IF NOT EXISTS idx_parts_sku             ON parts(sku);
CREATE INDEX IF NOT EXISTS idx_vehicles_customer     ON vehicles(customer_id);
CREATE INDEX IF NOT EXISTS idx_service_jobs_customer ON service_jobs(customer_id);
CREATE INDEX IF NOT EXISTS idx_service_jobs_status   ON service_jobs(status);
CREATE INDEX IF NOT EXISTS idx_sj_parts_job          ON service_job_parts(job_id);
CREATE INDEX IF NOT EXISTS idx_transactions_customer ON transactions(customer_id);
CREATE INDEX IF NOT EXISTS idx_tx_items_transaction  ON transaction_items(transaction_id);
CREATE INDEX IF NOT EXISTS idx_transactions_date     ON transactions(date DESC);

-- =====================================================================
-- AUTO-UPDATE updated_at trigger
-- =====================================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_parts_updated_at
  BEFORE UPDATE ON parts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_customers_updated_at
  BEFORE UPDATE ON customers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_service_jobs_updated_at
  BEFORE UPDATE ON service_jobs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =====================================================================
-- ROW LEVEL SECURITY
-- Full access via anon key for internal POS app
-- =====================================================================
ALTER TABLE parts              ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers          ENABLE ROW LEVEL SECURITY;
ALTER TABLE vehicles           ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_jobs       ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_job_parts  ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions       ENABLE ROW LEVEL SECURITY;
ALTER TABLE transaction_items  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon_all_parts"             ON parts             FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_all_customers"         ON customers         FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_all_vehicles"          ON vehicles          FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_all_service_jobs"      ON service_jobs      FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_all_sj_parts"          ON service_job_parts FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_all_transactions"      ON transactions      FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_all_transaction_items" ON transaction_items FOR ALL TO anon USING (true) WITH CHECK (true);

-- =====================================================================
-- SEED DATA - Parts Inventory
-- =====================================================================
INSERT INTO parts (sku, name, category, cost, price, stock, min_stock) VALUES
  ('TYR-PIR-DR4-190', 'Pirelli Diablo Rosso IV Rear Tire (190/55 ZR17)',   'Tires',       145.00, 199.99,  8,  3),
  ('TYR-PIR-DR4-120', 'Pirelli Diablo Rosso IV Front Tire (120/70 ZR17)',  'Tires',        95.00, 139.99, 10,  3),
  ('BRK-BRM-CC-078',  'Brembo Carbon Ceramic Brake Pads (Front)',          'Brakes',       28.00,  49.99, 15,  5),
  ('BRK-BRM-SP-095',  'Brembo Sintered Street Brake Pads (Rear)',          'Brakes',       22.00,  39.99,  2,  4),
  ('FLD-MOT-7100-4T', 'Motul 7100 4T 10W-40 Synthetic Oil (1L)',           'Fluids',        9.50,  16.99, 45, 10),
  ('FLD-MOT-IN-COOL', 'Motul Inugel Optimal Coolant (1L)',                 'Fluids',        6.00,  11.49, 18,  6),
  ('FLT-KN-204',      'K&N Premium Oil Filter (KN-204)',                   'Filters',       7.50,  14.99, 24,  8),
  ('CHN-DID-525VX3',  'D.I.D 525VX3 Gold X-Ring Chain (120 Links)',        'Drivetrain',   65.00, 109.99,  5,  2),
  ('SPK-NGK-CR9EIX',  'NGK Iridium IX Spark Plug (CR9EIX)',                'Electrical',    4.50,   9.99, 32, 10),
  ('BAT-YUA-YTZ10S',  'Yuasa YTZ10S AGM Sealed Battery',                  'Electrical',   60.00,  99.99,  4,  2),
  ('ACC-PRO-TAPER-C', 'ProTaper Contour 1-1/8" Handlebars (Black)',        'Accessories',  45.00,  79.99,  6,  2),
  ('ACC-RAM-MOUNT-X', 'RAM Mounts X-Grip Phone Holder',                    'Accessories',  20.00,  34.99, 12,  4),
  ('TYR-MIC-PR6-180', 'Michelin Road 6 Rear Tire (180/55 ZR17)',           'Tires',       160.00, 224.99,  1,  3),
  ('FLD-MAX-CHNLUB',  'Maxima Chain Wax Aerosol (13.5 oz)',                'Fluids',        6.50,  12.99, 20,  5),
  ('BRK-EBC-HH-244',  'EBC Double-H Sintered Pads (Front FA244HH)',        'Brakes',       24.00,  44.99,  0,  3)
ON CONFLICT (sku) DO NOTHING;

-- =====================================================================
-- SEED DATA - Customers & Vehicles
-- =====================================================================
DO $$
DECLARE
  c1 UUID; c2 UUID; c3 UUID; c4 UUID;
BEGIN
  INSERT INTO customers (name, phone, email)
    VALUES ('Alex Mercer', '+1 (555) 234-5678', 'alex.mercer@gmail.com')
    RETURNING id INTO c1;

  INSERT INTO customers (name, phone, email)
    VALUES ('Sarah Jenkins', '+1 (555) 876-5432', 'sarah.j@outlook.com')
    RETURNING id INTO c2;

  INSERT INTO customers (name, phone, email)
    VALUES ('Marcus Aurelius', '+1 (555) 432-1098', 'emperor.marcus@rome.net')
    RETURNING id INTO c3;

  INSERT INTO customers (name, phone, email)
    VALUES ('Carlos Santana', '+1 (555) 901-2345', 'carlos.smooth@yahoo.com')
    RETURNING id INTO c4;

  INSERT INTO vehicles (customer_id, year, make, model, plate, vin) VALUES
    (c1, '2021', 'Yamaha',   'MT-07',          'MOTO-777', 'JYAR123456789012'),
    (c2, '2019', 'Honda',    'Rebel 500',      'CRUISR-9', 'JH2PC123456789034'),
    (c2, '2023', 'Kawasaki', 'Ninja ZX-6R',    'KRAZY-6',  'JKADX123456789056'),
    (c3, '2018', 'Ducati',   'Monster 821',    'BEAST-8',  'ZDM1234567890789'),
    (c4, '2020', 'Suzuki',   'V-Strom 650 XT', 'ADV-999',  'JS1VT123456789012');
END $$;

-- =====================================================================
-- TABLE: mechanics
-- Store mechanics and their roles
-- =====================================================================
CREATE TABLE IF NOT EXISTS mechanics (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  role        TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================================
-- TABLE: labor_records
-- Store individual labor items completed by a mechanic
-- =====================================================================
CREATE TABLE IF NOT EXISTS labor_records (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mechanic_id UUID NOT NULL REFERENCES mechanics(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  amount      NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
  date        DATE DEFAULT CURRENT_DATE,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================================
-- ROW LEVEL SECURITY FOR MECHANICS
-- =====================================================================
ALTER TABLE mechanics         ENABLE ROW LEVEL SECURITY;
ALTER TABLE labor_records     ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon_all_mechanics"         ON mechanics         FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_all_labor_records"     ON labor_records     FOR ALL TO anon USING (true) WITH CHECK (true);

-- =====================================================================
-- TABLE: cash_outs
-- Records of cash withdrawals made by the owner from daily sales
-- =====================================================================
CREATE TABLE IF NOT EXISTS cash_outs (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  amount     NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
  reason     TEXT NOT NULL,
  notes      TEXT,
  date       TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cash_outs_date ON cash_outs(date DESC);

ALTER TABLE cash_outs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon_all_cash_outs" ON cash_outs FOR ALL TO anon USING (true) WITH CHECK (true);

-- =====================================================================
-- TABLE: entry_capitals
-- Records of starting cash for the day
-- =====================================================================
CREATE TABLE IF NOT EXISTS entry_capitals (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  amount     NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
  date       TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_entry_capitals_date ON entry_capitals(date DESC);

ALTER TABLE entry_capitals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon_all_entry_capitals" ON entry_capitals FOR ALL TO anon USING (true) WITH CHECK (true);

-- =====================================================================
-- All done!
-- Tables: parts, customers, vehicles, service_jobs,
--         service_job_parts, transactions, transaction_items,
--         mechanics, labor_records, cash_outs, entry_capitals
-- =====================================================================
