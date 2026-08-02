-- Run this in your Supabase SQL Editor (supabase.com -> your project -> SQL Editor)
-- Adds the Stocks vertical: Ticker (SEC EDGAR fundamentals + proprietary quality
-- score) and TickerSignal (going-concern / insider-activity signal log).

CREATE TABLE IF NOT EXISTS "Ticker" (
  "id"                        TEXT NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "cik"                       TEXT NOT NULL UNIQUE,
  "symbol"                    TEXT NOT NULL UNIQUE,
  "name"                      TEXT NOT NULL,
  "sector"                    TEXT,
  "exchange"                  TEXT,

  "revenueTtm"                DOUBLE PRECISION,
  "revenueGrowthYoyPct"       DOUBLE PRECISION,
  "grossMarginPct"            DOUBLE PRECISION,
  "operatingMarginPct"        DOUBLE PRECISION,
  "netMarginPct"              DOUBLE PRECISION,
  "roePct"                    DOUBLE PRECISION,
  "roicPct"                   DOUBLE PRECISION,

  "debtToEquity"              DOUBLE PRECISION,
  "interestCoveragePct"       DOUBLE PRECISION,
  "currentRatio"              DOUBLE PRECISION,

  "freeCashFlowTtm"           DOUBLE PRECISION,
  "fcfMarginPct"              DOUBLE PRECISION,
  "accrualsRatioPct"          DOUBLE PRECISION,

  "dividendYieldPct"          DOUBLE PRECISION,
  "payoutRatioEarningsPct"    DOUBLE PRECISION,
  "payoutRatioFcfPct"         DOUBLE PRECISION,
  "dividendGrowthStreakYears" INTEGER,

  "priceUsd"                  DOUBLE PRECISION,
  "peRatio"                   DOUBLE PRECISION,
  "pfcfRatio"                 DOUBLE PRECISION,
  "evEbitda"                  DOUBLE PRECISION,
  "pegRatio"                  DOUBLE PRECISION,

  "insiderNetSharesTtm"       INTEGER,

  "qualityScore"              INTEGER,
  "qualityReasons"            JSONB,
  "dataCompletenessPct"       INTEGER,
  "dataConfidence"            TEXT NOT NULL DEFAULT 'insufficient',
  "earlyWarning"              BOOLEAN NOT NULL DEFAULT false,

  "lastScoredAt"              TIMESTAMP(3),
  "updatedAt"                 TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt"                 TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "Ticker_dataConfidence_idx" ON "Ticker"("dataConfidence");
CREATE INDEX IF NOT EXISTS "Ticker_qualityScore_idx" ON "Ticker"("qualityScore");
CREATE INDEX IF NOT EXISTS "Ticker_lastScoredAt_idx" ON "Ticker"("lastScoredAt");

CREATE TABLE IF NOT EXISTS "TickerSignal" (
  "id"         TEXT NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "tickerId"   TEXT NOT NULL REFERENCES "Ticker"("id") ON DELETE CASCADE,
  "signalType" TEXT NOT NULL,
  "signalDate" TIMESTAMP(3) NOT NULL,
  "rawData"    JSONB NOT NULL,
  "source"     TEXT NOT NULL,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "TickerSignal_tickerId_idx" ON "TickerSignal"("tickerId");
CREATE INDEX IF NOT EXISTS "TickerSignal_signalType_idx" ON "TickerSignal"("signalType");

-- Crypto vertical: CryptoAsset (market data + proprietary quality score) and
-- CryptoSignal (unlock / liquidity / dev-activity signal log).

CREATE TABLE IF NOT EXISTS "CryptoAsset" (
  "id"                     TEXT NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "coingeckoId"            TEXT NOT NULL UNIQUE,
  "symbol"                 TEXT NOT NULL,
  "name"                   TEXT NOT NULL,

  "marketCapRank"          INTEGER,
  "priceUsd"               DOUBLE PRECISION,
  "volume24hUsd"           DOUBLE PRECISION,
  "marketCapUsd"           DOUBLE PRECISION,
  "priceChange24hPct"      DOUBLE PRECISION,
  "priceChange7dPct"       DOUBLE PRECISION,
  "circulatingSupplyPct"   DOUBLE PRECISION,

  "protocolRevenue30dUsd"  DOUBLE PRECISION,
  "stakingYieldPct"        DOUBLE PRECISION,
  "nextUnlockDate"         TIMESTAMP(3),
  "nextUnlockPctSupply"    DOUBLE PRECISION,

  "devActivityScore"       INTEGER,

  "qualityScore"           INTEGER,
  "qualityReasons"         JSONB,
  "dataCompletenessPct"    INTEGER,
  "dataConfidence"         TEXT NOT NULL DEFAULT 'insufficient',

  "lastScoredAt"           TIMESTAMP(3),
  "updatedAt"              TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt"               TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "CryptoAsset_dataConfidence_idx" ON "CryptoAsset"("dataConfidence");
CREATE INDEX IF NOT EXISTS "CryptoAsset_qualityScore_idx" ON "CryptoAsset"("qualityScore");
CREATE INDEX IF NOT EXISTS "CryptoAsset_lastScoredAt_idx" ON "CryptoAsset"("lastScoredAt");

CREATE TABLE IF NOT EXISTS "CryptoSignal" (
  "id"         TEXT NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "assetId"    TEXT NOT NULL REFERENCES "CryptoAsset"("id") ON DELETE CASCADE,
  "signalType" TEXT NOT NULL,
  "signalDate" TIMESTAMP(3) NOT NULL,
  "rawData"    JSONB NOT NULL,
  "source"     TEXT NOT NULL,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "CryptoSignal_assetId_idx" ON "CryptoSignal"("assetId");
CREATE INDEX IF NOT EXISTS "CryptoSignal_signalType_idx" ON "CryptoSignal"("signalType");
