-- Run in Supabase SQL Editor. Additive + idempotent.
-- Balance-sheet landmines, capital-allocation track record, DEF 14A governance.

ALTER TABLE "Ticker" ADD COLUMN IF NOT EXISTS "debtDueNext12MoUsd"    DOUBLE PRECISION;
ALTER TABLE "Ticker" ADD COLUMN IF NOT EXISTS "debtWallToFcfYears"    DOUBLE PRECISION;
ALTER TABLE "Ticker" ADD COLUMN IF NOT EXISTS "sbcToRevenuePct"       DOUBLE PRECISION;
ALTER TABLE "Ticker" ADD COLUMN IF NOT EXISTS "goodwillToAssetsPct"   DOUBLE PRECISION;
ALTER TABLE "Ticker" ADD COLUMN IF NOT EXISTS "hadGoodwillImpairment" BOOLEAN;
ALTER TABLE "Ticker" ADD COLUMN IF NOT EXISTS "effectiveTaxRatePct"   DOUBLE PRECISION;
ALTER TABLE "Ticker" ADD COLUMN IF NOT EXISTS "balanceSheetFlags"     JSONB;

ALTER TABLE "Ticker" ADD COLUMN IF NOT EXISTS "capitalAllocationScore"    INTEGER;
ALTER TABLE "Ticker" ADD COLUMN IF NOT EXISTS "avgBuybackPricePercentile" DOUBLE PRECISION;
ALTER TABLE "Ticker" ADD COLUMN IF NOT EXISTS "capitalAllocationReasons"  JSONB;

ALTER TABLE "Ticker" ADD COLUMN IF NOT EXISTS "governanceScore"     INTEGER;
ALTER TABLE "Ticker" ADD COLUMN IF NOT EXISTS "payAlignment"        TEXT;
ALTER TABLE "Ticker" ADD COLUMN IF NOT EXISTS "dualClass"           BOOLEAN;
ALTER TABLE "Ticker" ADD COLUMN IF NOT EXISTS "governanceSummary"   TEXT;
ALTER TABLE "Ticker" ADD COLUMN IF NOT EXISTS "governanceFlags"     JSONB;
ALTER TABLE "Ticker" ADD COLUMN IF NOT EXISTS "governanceSourceUrl" TEXT;

CREATE INDEX IF NOT EXISTS "Ticker_governanceScore_idx"        ON "Ticker"("governanceScore");
CREATE INDEX IF NOT EXISTS "Ticker_capitalAllocationScore_idx" ON "Ticker"("capitalAllocationScore");
