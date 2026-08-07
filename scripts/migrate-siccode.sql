-- Run in Supabase SQL Editor. Additive + idempotent.
ALTER TABLE "Ticker" ADD COLUMN IF NOT EXISTS "sicCode" TEXT;
