-- =====================================================================
-- ApexMoto POS — Supabase Schema Setup for Sync Compatibility
-- 
-- Run this in: Supabase Dashboard → SQL Editor → New Query
-- This ensures all tables exist with proper RLS policies.
-- If you already have the schema from supabase_schema.sql, 
-- this script is safe to re-run (uses IF NOT EXISTS).
-- =====================================================================

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─── TABLES ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS parts (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sku          TEXT NOT NULL UNIQUE,
  name         TEXT NOT NULL,
  category     TEXT NOT NULL,
  cost         NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
  price        NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
  stock        INTEGER NOT NULL DEFAULT 0,
  min_stock    INTEGER NOT NULL DEFAULT 2,
  alt_barcodes TEXT[] DEFAULT '{}',
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS customers (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name             TEXT NOT NULL,
  phone            TEXT NOT NULL,
  email            TEXT,
  outstanding_debt NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

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

CREATE TABLE IF NOT EXISTS mechanics (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  role        TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS service_jobs (
  id            TEXT PRIMARY KEY,
  customer_id   UUID REFERENCES customers(id) ON DELETE SET NULL,
  customer_name TEXT NOT NULL,
  vehicle       TEXT NOT NULL,
  description   TEXT NOT NULL,
  mechanic      TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'Draft',
  labor_cost    NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS service_job_parts (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id     TEXT NOT NULL REFERENCES service_jobs(id) ON DELETE CASCADE,
  part_id    UUID REFERENCES parts(id) ON DELETE SET NULL,
  name       TEXT NOT NULL,
  quantity   INTEGER NOT NULL DEFAULT 1,
  price      NUMERIC(10, 2) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS transactions (
  id             TEXT PRIMARY KEY,
  type           TEXT NOT NULL DEFAULT 'Retail',
  customer_id    UUID REFERENCES customers(id) ON DELETE SET NULL,
  customer_name  TEXT NOT NULL DEFAULT 'Walk-in Customer',
  vehicle        TEXT,
  subtotal       NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
  tax            NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
  discount       NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
  total          NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
  payment_method TEXT NOT NULL DEFAULT 'Cash',
  date           TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS transaction_items (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id TEXT NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  part_id        TEXT,
  name           TEXT NOT NULL,
  quantity       INTEGER NOT NULL DEFAULT 1,
  price          NUMERIC(10, 2) NOT NULL
);

CREATE TABLE IF NOT EXISTS labor_records (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mechanic_id UUID NOT NULL REFERENCES mechanics(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  amount      NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
  date        DATE DEFAULT CURRENT_DATE,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS cash_outs (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  amount     NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
  reason     TEXT NOT NULL,
  notes      TEXT,
  date       TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS entry_capitals (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  amount     NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
  date       TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─── INDEXES ─────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_parts_category        ON parts(category);
CREATE INDEX IF NOT EXISTS idx_parts_sku             ON parts(sku);
CREATE INDEX IF NOT EXISTS idx_vehicles_customer     ON vehicles(customer_id);
CREATE INDEX IF NOT EXISTS idx_service_jobs_customer ON service_jobs(customer_id);
CREATE INDEX IF NOT EXISTS idx_service_jobs_status   ON service_jobs(status);
CREATE INDEX IF NOT EXISTS idx_sj_parts_job          ON service_job_parts(job_id);
CREATE INDEX IF NOT EXISTS idx_transactions_customer ON transactions(customer_id);
CREATE INDEX IF NOT EXISTS idx_tx_items_transaction  ON transaction_items(transaction_id);
CREATE INDEX IF NOT EXISTS idx_transactions_date     ON transactions(date DESC);
CREATE INDEX IF NOT EXISTS idx_cash_outs_date        ON cash_outs(date DESC);
CREATE INDEX IF NOT EXISTS idx_entry_capitals_date   ON entry_capitals(date DESC);
CREATE INDEX IF NOT EXISTS idx_labor_records_mechanic ON labor_records(mechanic_id);

-- ─── ROW LEVEL SECURITY (allow full access via anon key) ─────────────

DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOR tbl IN SELECT unnest(ARRAY[
    'parts','customers','vehicles','mechanics',
    'service_jobs','service_job_parts',
    'transactions','transaction_items',
    'labor_records','cash_outs','entry_capitals'
  ])
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', tbl);
    
    -- Drop existing policy if it exists, then recreate
    BEGIN
      EXECUTE format('DROP POLICY IF EXISTS "anon_full_access" ON %I', tbl);
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
    
    EXECUTE format(
      'CREATE POLICY "anon_full_access" ON %I FOR ALL TO anon USING (true) WITH CHECK (true)',
      tbl
    );
  END LOOP;
END $$;

-- ─── All done! Ready for sync. ───────────────────────────────────────
