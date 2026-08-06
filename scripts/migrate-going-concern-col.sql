-- Run in Supabase SQL Editor. Additive + idempotent.
-- goingConcernHits was computed and scored but never stored, so no screen
-- could gate on it — the most serious solvency warning a company can issue.
ALTER TABLE "Ticker" ADD COLUMN IF NOT EXISTS "goingConcernHits" INTEGER;
