-- Run in Supabase SQL Editor. Additive + idempotent.
-- Year-over-year risk-factor diffing: what a company NEWLY admits to.
ALTER TABLE "Ticker" ADD COLUMN IF NOT EXISTS "newRiskCount"      INTEGER;
ALTER TABLE "Ticker" ADD COLUMN IF NOT EXISTS "materialNewRisks"  JSONB;
ALTER TABLE "Ticker" ADD COLUMN IF NOT EXISTS "riskFactorSummary" TEXT;
