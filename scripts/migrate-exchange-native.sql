-- Run in Supabase SQL Editor. Additive + idempotent.
-- Our own exchange-native market data, replacing aggregator dependence for
-- everything that actually drives scoring.
ALTER TABLE "CryptoAsset" ADD COLUMN IF NOT EXISTS "consensusPriceUsd"     DOUBLE PRECISION;
ALTER TABLE "CryptoAsset" ADD COLUMN IF NOT EXISTS "venueCount"            INTEGER;
ALTER TABLE "CryptoAsset" ADD COLUMN IF NOT EXISTS "venueDivergencePct"    DOUBLE PRECISION;
ALTER TABLE "CryptoAsset" ADD COLUMN IF NOT EXISTS "bidAskSpreadPct"       DOUBLE PRECISION;
ALTER TABLE "CryptoAsset" ADD COLUMN IF NOT EXISTS "regulatedVolume24hUsd" DOUBLE PRECISION;
ALTER TABLE "CryptoAsset" ADD COLUMN IF NOT EXISTS "liquidityGrade"        TEXT;
ALTER TABLE "CryptoAsset" ADD COLUMN IF NOT EXISTS "listingQualityScore"   INTEGER;
ALTER TABLE "CryptoAsset" ADD COLUMN IF NOT EXISTS "exchangeNotes"         JSONB;
CREATE INDEX IF NOT EXISTS "CryptoAsset_venueCount_idx"     ON "CryptoAsset"("venueCount");
CREATE INDEX IF NOT EXISTS "CryptoAsset_liquidityGrade_idx" ON "CryptoAsset"("liquidityGrade");
