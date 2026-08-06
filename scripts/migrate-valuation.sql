-- Run in Supabase SQL Editor. Additive + idempotent.
-- Valuation axis: cheapness versus each company's OWN history.
-- Kept separate from qualityScore — the backtest showed quality does not rank
-- forward returns and valuation does, so collapsing them would hide the only
-- axis with measured signal.
ALTER TABLE "Ticker" ADD COLUMN IF NOT EXISTS "valuationScore"      INTEGER;
ALTER TABLE "Ticker" ADD COLUMN IF NOT EXISTS "earningsYieldPct"    DOUBLE PRECISION;
ALTER TABLE "Ticker" ADD COLUMN IF NOT EXISTS "fcfYieldPct"         DOUBLE PRECISION;
ALTER TABLE "Ticker" ADD COLUMN IF NOT EXISTS "valuationPercentile" DOUBLE PRECISION;
ALTER TABLE "Ticker" ADD COLUMN IF NOT EXISTS "valueTier"           TEXT;
ALTER TABLE "Ticker" ADD COLUMN IF NOT EXISTS "valuationReasons"    JSONB;
CREATE INDEX IF NOT EXISTS "Ticker_valuationScore_idx" ON "Ticker"("valuationScore");
