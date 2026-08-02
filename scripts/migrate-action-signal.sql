-- Run this in your Supabase SQL Editor (supabase.com -> your project -> SQL Editor)
-- Adds the BUY / HOLD / PASS action signal to the markets module.
-- Purely additive — nothing existing is altered or dropped.
-- Safe to re-run.

ALTER TABLE "Ticker"      ADD COLUMN IF NOT EXISTS "actionSignal"    TEXT;
ALTER TABLE "Ticker"      ADD COLUMN IF NOT EXISTS "actionRationale" TEXT;

ALTER TABLE "CryptoAsset" ADD COLUMN IF NOT EXISTS "actionSignal"    TEXT;
ALTER TABLE "CryptoAsset" ADD COLUMN IF NOT EXISTS "actionRationale" TEXT;

CREATE INDEX IF NOT EXISTS "Ticker_actionSignal_idx"      ON "Ticker"("actionSignal");
CREATE INDEX IF NOT EXISTS "CryptoAsset_actionSignal_idx" ON "CryptoAsset"("actionSignal");
