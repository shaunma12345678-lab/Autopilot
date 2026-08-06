-- Run in Supabase SQL Editor. Additive + idempotent.
ALTER TABLE "Ticker" ADD COLUMN IF NOT EXISTS "benfordMad"          DOUBLE PRECISION;
ALTER TABLE "Ticker" ADD COLUMN IF NOT EXISTS "benfordConformity"   TEXT;
ALTER TABLE "Ticker" ADD COLUMN IF NOT EXISTS "benfordSampleSize"   INTEGER;
ALTER TABLE "Ticker" ADD COLUMN IF NOT EXISTS "shortSharesCurrent"  DOUBLE PRECISION;
ALTER TABLE "Ticker" ADD COLUMN IF NOT EXISTS "shortChangePct"      DOUBLE PRECISION;
ALTER TABLE "Ticker" ADD COLUMN IF NOT EXISTS "shortDaysToCover"    DOUBLE PRECISION;
ALTER TABLE "Ticker" ADD COLUMN IF NOT EXISTS "shortTrend"          TEXT;
ALTER TABLE "Ticker" ADD COLUMN IF NOT EXISTS "shortSettlementDate" TEXT;
