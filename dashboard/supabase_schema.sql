-- ============================================================
--  WalletScanner — Supabase schema
--  Ejecuta esto en: Supabase Dashboard → SQL Editor
-- ============================================================

-- Tabla: wallets encontradas con saldo
CREATE TABLE IF NOT EXISTS wallet_results (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phrase      TEXT NOT NULL,
  eth_address TEXT,
  eth_balance NUMERIC(30, 10) DEFAULT 0,
  bsc_address TEXT,
  bsc_balance NUMERIC(30, 10) DEFAULT 0,
  btc_address TEXT,
  btc_balance NUMERIC(30, 10) DEFAULT 0,
  sol_address TEXT,
  sol_balance NUMERIC(30, 10) DEFAULT 0,
  found_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Si la tabla ya existía, añadir las nuevas columnas sin borrar datos:
ALTER TABLE wallet_results ADD COLUMN IF NOT EXISTS bsc_address TEXT;
ALTER TABLE wallet_results ADD COLUMN IF NOT EXISTS bsc_balance NUMERIC(30, 10) DEFAULT 0;
ALTER TABLE wallet_results ADD COLUMN IF NOT EXISTS btc_address TEXT;
ALTER TABLE wallet_results ADD COLUMN IF NOT EXISTS btc_balance NUMERIC(30, 10) DEFAULT 0;

-- Índice para búsquedas por fecha
CREATE INDEX IF NOT EXISTS idx_wallet_results_found_at ON wallet_results (found_at DESC);

-- ─────────────────────────────────────────────────────────────

-- Tabla: estadísticas del escaneo (una sola fila: id = 'main')
CREATE TABLE IF NOT EXISTS scan_stats (
  id             TEXT PRIMARY KEY DEFAULT 'main',
  total_phrases  BIGINT DEFAULT 0,
  processed      BIGINT DEFAULT 0,
  found_wallets  BIGINT DEFAULT 0,
  is_running     BOOLEAN DEFAULT FALSE,
  started_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW()
);

-- Inserta la fila inicial de estadísticas
INSERT INTO scan_stats (id) VALUES ('main')
ON CONFLICT (id) DO NOTHING;

-- ─────────────────────────────────────────────────────────────
-- Seguridad: RLS (Row Level Security)
-- La API del backend usa la service_role key que ignora RLS.
-- El frontend usa la anon key. Permitimos solo lectura pública.
-- ─────────────────────────────────────────────────────────────

ALTER TABLE wallet_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE scan_stats ENABLE ROW LEVEL SECURITY;

-- Leer resultados (solo el backend con service_role puede escribir)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'read_wallet_results') THEN
    CREATE POLICY "read_wallet_results" ON wallet_results FOR SELECT USING (TRUE);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'read_scan_stats') THEN
    CREATE POLICY "read_scan_stats" ON scan_stats FOR SELECT USING (TRUE);
  END IF;
END $$;
