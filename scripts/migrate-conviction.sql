-- Run in Supabase SQL Editor. Additive + idempotent.
-- Conviction tiering: independent quality gates rather than an averaged score.
ALTER TABLE "Ticker"      ADD COLUMN IF NOT EXISTS "convictionTier"    TEXT;
ALTER TABLE "Ticker"      ADD COLUMN IF NOT EXISTS "convictionGates"   JSONB;
ALTER TABLE "Ticker"      ADD COLUMN IF NOT EXISTS "convictionSummary" TEXT;
ALTER TABLE "CryptoAsset" ADD COLUMN IF NOT EXISTS "convictionTier"    TEXT;
ALTER TABLE "CryptoAsset" ADD COLUMN IF NOT EXISTS "convictionGates"   JSONB;
ALTER TABLE "CryptoAsset" ADD COLUMN IF NOT EXISTS "convictionSummary" TEXT;
CREATE INDEX IF NOT EXISTS "Ticker_convictionTier_idx"      ON "Ticker"("convictionTier");
CREATE INDEX IF NOT EXISTS "CryptoAsset_convictionTier_idx" ON "CryptoAsset"("convictionTier");

-- On-chain accumulation/distribution tracking.
ALTER TABLE "ScoreSnapshot" ADD COLUMN IF NOT EXISTS "top10HolderPct" DOUBLE PRECISION;
