-- Run in Supabase SQL Editor. Purely additive, idempotent, safe to re-run.
-- Adds live 8-K corporate events and recent-news scan to the deep-dive layer.

ALTER TABLE "Ticker" ADD COLUMN IF NOT EXISTS "liveEvents"           JSONB;
ALTER TABLE "Ticker" ADD COLUMN IF NOT EXISTS "liveEventFlags"       JSONB;
ALTER TABLE "Ticker" ADD COLUMN IF NOT EXISTS "hasRestatement"       BOOLEAN;
ALTER TABLE "Ticker" ADD COLUMN IF NOT EXISTS "hasAuditorChange"     BOOLEAN;
ALTER TABLE "Ticker" ADD COLUMN IF NOT EXISTS "execChangeCount"      INTEGER;

ALTER TABLE "Ticker" ADD COLUMN IF NOT EXISTS "newsSummary"          TEXT;
ALTER TABLE "Ticker" ADD COLUMN IF NOT EXISTS "newsTone"             TEXT;
ALTER TABLE "Ticker" ADD COLUMN IF NOT EXISTS "newsHeadlines"        JSONB;
ALTER TABLE "Ticker" ADD COLUMN IF NOT EXISTS "newsMaterialConcerns" JSONB;

CREATE INDEX IF NOT EXISTS "Ticker_hasRestatement_idx" ON "Ticker"("hasRestatement");
