-- Run in Supabase SQL Editor. Additive + idempotent.
-- Narrative-vs-numbers contradiction detection.
ALTER TABLE "Ticker" ADD COLUMN IF NOT EXISTS "credibilityScore"   INTEGER;
ALTER TABLE "Ticker" ADD COLUMN IF NOT EXISTS "contradictions"     JSONB;
ALTER TABLE "Ticker" ADD COLUMN IF NOT EXISTS "contradictionFlags" JSONB;
CREATE INDEX IF NOT EXISTS "Ticker_credibilityScore_idx" ON "Ticker"("credibilityScore");
