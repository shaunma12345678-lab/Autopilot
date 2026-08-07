-- Run in Supabase SQL Editor. Additive + idempotent.
ALTER TABLE "Ticker" ADD COLUMN IF NOT EXISTS "federalContractValueUsd"  DOUBLE PRECISION;
ALTER TABLE "Ticker" ADD COLUMN IF NOT EXISTS "federalContractChangePct" DOUBLE PRECISION;
ALTER TABLE "Ticker" ADD COLUMN IF NOT EXISTS "federalAwardCount"        INTEGER;
