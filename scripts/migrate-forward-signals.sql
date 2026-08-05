-- Run in Supabase SQL Editor. Purely additive, idempotent, safe to re-run.
-- Adds forward-looking signals, filing-narrative analysis, and position context.

-- Forward-looking signals (lib/forward-signals.ts)
ALTER TABLE "Ticker" ADD COLUMN IF NOT EXISTS "rpoUsd"                      DOUBLE PRECISION;
ALTER TABLE "Ticker" ADD COLUMN IF NOT EXISTS "rpoToRevenueYears"           DOUBLE PRECISION;
ALTER TABLE "Ticker" ADD COLUMN IF NOT EXISTS "rpoGrowthYoyPct"             DOUBLE PRECISION;
ALTER TABLE "Ticker" ADD COLUMN IF NOT EXISTS "rndIntensityPct"             DOUBLE PRECISION;
ALTER TABLE "Ticker" ADD COLUMN IF NOT EXISTS "capexIntensityPct"           DOUBLE PRECISION;
ALTER TABLE "Ticker" ADD COLUMN IF NOT EXISTS "capexGrowthYoyPct"           DOUBLE PRECISION;
ALTER TABLE "Ticker" ADD COLUMN IF NOT EXISTS "deferredRevenueGrowthYoyPct" DOUBLE PRECISION;
ALTER TABLE "Ticker" ADD COLUMN IF NOT EXISTS "revenueAccelerationPct"      DOUBLE PRECISION;
ALTER TABLE "Ticker" ADD COLUMN IF NOT EXISTS "forwardScore"                INTEGER;
ALTER TABLE "Ticker" ADD COLUMN IF NOT EXISTS "forwardReasons"              JSONB;

-- Filing narrative (lib/edgar-narrative.ts)
ALTER TABLE "Ticker" ADD COLUMN IF NOT EXISTS "narrativeSummary"       TEXT;
ALTER TABLE "Ticker" ADD COLUMN IF NOT EXISTS "narrativeStrategy"      JSONB;
ALTER TABLE "Ticker" ADD COLUMN IF NOT EXISTS "narrativeGrowthDrivers" JSONB;
ALTER TABLE "Ticker" ADD COLUMN IF NOT EXISTS "narrativeHeadwinds"     JSONB;
ALTER TABLE "Ticker" ADD COLUMN IF NOT EXISTS "narrativeCapitalPlans"  JSONB;
ALTER TABLE "Ticker" ADD COLUMN IF NOT EXISTS "narrativeOutlookTone"   TEXT;
ALTER TABLE "Ticker" ADD COLUMN IF NOT EXISTS "narrativeSourceUrl"     TEXT;
ALTER TABLE "Ticker" ADD COLUMN IF NOT EXISTS "narrativeFilingDate"    TEXT;

-- Position context (lib/position-context.ts)
ALTER TABLE "Ticker" ADD COLUMN IF NOT EXISTS "pricePercentile1y" INTEGER;
ALTER TABLE "Ticker" ADD COLUMN IF NOT EXISTS "trendState"        TEXT;
ALTER TABLE "Ticker" ADD COLUMN IF NOT EXISTS "ma50"              DOUBLE PRECISION;
ALTER TABLE "Ticker" ADD COLUMN IF NOT EXISTS "ma200"             DOUBLE PRECISION;
ALTER TABLE "Ticker" ADD COLUMN IF NOT EXISTS "situationSummary"  TEXT;

CREATE INDEX IF NOT EXISTS "Ticker_forwardScore_idx"      ON "Ticker"("forwardScore");
CREATE INDEX IF NOT EXISTS "Ticker_pricePercentile1y_idx" ON "Ticker"("pricePercentile1y");
