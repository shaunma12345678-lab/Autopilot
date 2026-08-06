-- Run in Supabase SQL Editor. Additive + idempotent.
-- Accounting quality: is reported profit actually backed by cash?
ALTER TABLE "Ticker" ADD COLUMN IF NOT EXISTS "cashConversionRatio"    DOUBLE PRECISION;
ALTER TABLE "Ticker" ADD COLUMN IF NOT EXISTS "avgCashConversion"      DOUBLE PRECISION;
ALTER TABLE "Ticker" ADD COLUMN IF NOT EXISTS "dsoDays"                DOUBLE PRECISION;
ALTER TABLE "Ticker" ADD COLUMN IF NOT EXISTS "dsoTrendDays"           DOUBLE PRECISION;
ALTER TABLE "Ticker" ADD COLUMN IF NOT EXISTS "inventoryTurns"         DOUBLE PRECISION;
ALTER TABLE "Ticker" ADD COLUMN IF NOT EXISTS "inventoryTurnsTrend"    DOUBLE PRECISION;
ALTER TABLE "Ticker" ADD COLUMN IF NOT EXISTS "accountingQualityScore" INTEGER;
ALTER TABLE "Ticker" ADD COLUMN IF NOT EXISTS "accountingFlags"        JSONB;
CREATE INDEX IF NOT EXISTS "Ticker_accountingQualityScore_idx" ON "Ticker"("accountingQualityScore");
