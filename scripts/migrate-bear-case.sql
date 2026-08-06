-- Run in Supabase SQL Editor. Additive + idempotent.
-- Adversarial pass: a second read whose only job is to attack the investment.
-- Kept separate from qualityReasons so the case against is never blended into
-- the case for.
ALTER TABLE "Ticker" ADD COLUMN IF NOT EXISTS "bearSummary"         TEXT;
ALTER TABLE "Ticker" ADD COLUMN IF NOT EXISTS "bearThesisRisks"     JSONB;
ALTER TABLE "Ticker" ADD COLUMN IF NOT EXISTS "bearKillShot"        TEXT;
ALTER TABLE "Ticker" ADD COLUMN IF NOT EXISTS "bearConviction"      TEXT;
ALTER TABLE "Ticker" ADD COLUMN IF NOT EXISTS "bearWhatMustGoRight" JSONB;
