-- Run in Supabase SQL Editor. Additive + idempotent.
-- Adds event-driven company discovery, Form 4 insider activity, and
-- multi-year consistency scoring.

CREATE TABLE IF NOT EXISTS "DiscoveryEvent" (
  "id"              TEXT NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "cik"             TEXT NOT NULL,
  "symbol"          TEXT,
  "companyName"     TEXT NOT NULL,
  "eventType"       TEXT NOT NULL,
  "eventDate"       TIMESTAMP(3) NOT NULL,
  "formType"        TEXT NOT NULL,
  "accessionNumber" TEXT,
  "sourceUrl"       TEXT,
  "priority"        INTEGER NOT NULL DEFAULT 50,
  "rationale"       TEXT,
  "processed"       BOOLEAN NOT NULL DEFAULT false,
  "processedAt"     TIMESTAMP(3),
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "DiscoveryEvent_cik_eventType_eventDate_key"
  ON "DiscoveryEvent"("cik", "eventType", "eventDate");
CREATE INDEX IF NOT EXISTS "DiscoveryEvent_processed_priority_idx" ON "DiscoveryEvent"("processed", "priority");
CREATE INDEX IF NOT EXISTS "DiscoveryEvent_eventType_idx" ON "DiscoveryEvent"("eventType");
CREATE INDEX IF NOT EXISTS "DiscoveryEvent_eventDate_idx" ON "DiscoveryEvent"("eventDate");

ALTER TABLE "Ticker" ADD COLUMN IF NOT EXISTS "insiderBuyCount90d"        INTEGER;
ALTER TABLE "Ticker" ADD COLUMN IF NOT EXISTS "insiderSellCount90d"       INTEGER;
ALTER TABLE "Ticker" ADD COLUMN IF NOT EXISTS "insiderNetSharesBought90d" DOUBLE PRECISION;
ALTER TABLE "Ticker" ADD COLUMN IF NOT EXISTS "insiderClusterBuy"         BOOLEAN;
ALTER TABLE "Ticker" ADD COLUMN IF NOT EXISTS "insiderSummary"            TEXT;

ALTER TABLE "Ticker" ADD COLUMN IF NOT EXISTS "consistencyScore"  INTEGER;
ALTER TABLE "Ticker" ADD COLUMN IF NOT EXISTS "consistencyDetail" JSONB;
ALTER TABLE "Ticker" ADD COLUMN IF NOT EXISTS "yearsOfData"       INTEGER;

CREATE INDEX IF NOT EXISTS "Ticker_insiderClusterBuy_idx" ON "Ticker"("insiderClusterBuy");
CREATE INDEX IF NOT EXISTS "Ticker_consistencyScore_idx"  ON "Ticker"("consistencyScore");
