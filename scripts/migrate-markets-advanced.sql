-- Run this in your Supabase SQL Editor (supabase.com -> your project -> SQL Editor)
-- Advanced Stock & Crypto Analysis module: validated academic scores, price-derived
-- metrics, token security checks, separate risk axis, and per-field source attribution.
-- Safe to re-run: every statement is idempotent.

-- ── Ticker: validated academic composites ──
ALTER TABLE "Ticker" ADD COLUMN IF NOT EXISTS "piotroskiScore"      INTEGER;
ALTER TABLE "Ticker" ADD COLUMN IF NOT EXISTS "piotroskiDetail"     JSONB;
ALTER TABLE "Ticker" ADD COLUMN IF NOT EXISTS "altmanZScore"        DOUBLE PRECISION;
ALTER TABLE "Ticker" ADD COLUMN IF NOT EXISTS "altmanZone"          TEXT;
ALTER TABLE "Ticker" ADD COLUMN IF NOT EXISTS "beneishMScore"       DOUBLE PRECISION;
ALTER TABLE "Ticker" ADD COLUMN IF NOT EXISTS "beneishFlag"         BOOLEAN;

-- ── Ticker: price-derived metrics ──
ALTER TABLE "Ticker" ADD COLUMN IF NOT EXISTS "momentum12m1Pct"     DOUBLE PRECISION;
ALTER TABLE "Ticker" ADD COLUMN IF NOT EXISTS "pctFrom52WeekHigh"   DOUBLE PRECISION;
ALTER TABLE "Ticker" ADD COLUMN IF NOT EXISTS "volatility30dPct"    DOUBLE PRECISION;
ALTER TABLE "Ticker" ADD COLUMN IF NOT EXISTS "maxDrawdown1yPct"    DOUBLE PRECISION;
ALTER TABLE "Ticker" ADD COLUMN IF NOT EXISTS "betaVsSpy"           DOUBLE PRECISION;

-- ── Ticker: dilution + sector context ──
ALTER TABLE "Ticker" ADD COLUMN IF NOT EXISTS "sharesOutstanding"   DOUBLE PRECISION;
ALTER TABLE "Ticker" ADD COLUMN IF NOT EXISTS "buybackYieldPct"     DOUBLE PRECISION;
ALTER TABLE "Ticker" ADD COLUMN IF NOT EXISTS "sicCode"             TEXT;
ALTER TABLE "Ticker" ADD COLUMN IF NOT EXISTS "sectorRelativeScore" INTEGER;
ALTER TABLE "Ticker" ADD COLUMN IF NOT EXISTS "sectorPeerCount"     INTEGER;

-- ── Ticker: risk axis + integrity layer + compliance ──
ALTER TABLE "Ticker" ADD COLUMN IF NOT EXISTS "riskScore"           INTEGER;
ALTER TABLE "Ticker" ADD COLUMN IF NOT EXISTS "riskFlags"           JSONB;
ALTER TABLE "Ticker" ADD COLUMN IF NOT EXISTS "strengthTier"        TEXT;
ALTER TABLE "Ticker" ADD COLUMN IF NOT EXISTS "fieldSources"        JSONB;

CREATE INDEX IF NOT EXISTS "Ticker_riskScore_idx" ON "Ticker"("riskScore");
CREATE INDEX IF NOT EXISTS "Ticker_sicCode_idx"   ON "Ticker"("sicCode");

-- ── CryptoAsset: dilution overhang ──
ALTER TABLE "CryptoAsset" ADD COLUMN IF NOT EXISTS "fdvUsd"                DOUBLE PRECISION;
ALTER TABLE "CryptoAsset" ADD COLUMN IF NOT EXISTS "fdvToMcapRatio"        DOUBLE PRECISION;

-- ── CryptoAsset: contract identity ──
ALTER TABLE "CryptoAsset" ADD COLUMN IF NOT EXISTS "contractAddress"       TEXT;
ALTER TABLE "CryptoAsset" ADD COLUMN IF NOT EXISTS "chainId"               TEXT;
ALTER TABLE "CryptoAsset" ADD COLUMN IF NOT EXISTS "chainSlug"             TEXT;

-- ── CryptoAsset: token security / rug risk ──
ALTER TABLE "CryptoAsset" ADD COLUMN IF NOT EXISTS "isHoneypot"            BOOLEAN;
ALTER TABLE "CryptoAsset" ADD COLUMN IF NOT EXISTS "isMintable"            BOOLEAN;
ALTER TABLE "CryptoAsset" ADD COLUMN IF NOT EXISTS "ownershipRenounced"    BOOLEAN;
ALTER TABLE "CryptoAsset" ADD COLUMN IF NOT EXISTS "lpLocked"              BOOLEAN;
ALTER TABLE "CryptoAsset" ADD COLUMN IF NOT EXISTS "isProxy"               BOOLEAN;
ALTER TABLE "CryptoAsset" ADD COLUMN IF NOT EXISTS "buyTaxPct"             DOUBLE PRECISION;
ALTER TABLE "CryptoAsset" ADD COLUMN IF NOT EXISTS "sellTaxPct"            DOUBLE PRECISION;
ALTER TABLE "CryptoAsset" ADD COLUMN IF NOT EXISTS "holderCount"           INTEGER;
ALTER TABLE "CryptoAsset" ADD COLUMN IF NOT EXISTS "topHolderPct"          DOUBLE PRECISION;
ALTER TABLE "CryptoAsset" ADD COLUMN IF NOT EXISTS "top10HolderPct"        DOUBLE PRECISION;
ALTER TABLE "CryptoAsset" ADD COLUMN IF NOT EXISTS "creatorPct"            DOUBLE PRECISION;
ALTER TABLE "CryptoAsset" ADD COLUMN IF NOT EXISTS "securityScore"         INTEGER;
ALTER TABLE "CryptoAsset" ADD COLUMN IF NOT EXISTS "securityFlags"         JSONB;

-- ── CryptoAsset: microstructure + self-computed history metrics ──
ALTER TABLE "CryptoAsset" ADD COLUMN IF NOT EXISTS "orderbookDepth2PctUsd" DOUBLE PRECISION;
ALTER TABLE "CryptoAsset" ADD COLUMN IF NOT EXISTS "volatility30dPct"      DOUBLE PRECISION;
ALTER TABLE "CryptoAsset" ADD COLUMN IF NOT EXISTS "maxDrawdown1yPct"      DOUBLE PRECISION;
ALTER TABLE "CryptoAsset" ADD COLUMN IF NOT EXISTS "btcCorrelation"        DOUBLE PRECISION;

-- ── CryptoAsset: risk axis + integrity layer + compliance ──
ALTER TABLE "CryptoAsset" ADD COLUMN IF NOT EXISTS "riskScore"             INTEGER;
ALTER TABLE "CryptoAsset" ADD COLUMN IF NOT EXISTS "riskFlags"             JSONB;
ALTER TABLE "CryptoAsset" ADD COLUMN IF NOT EXISTS "strengthTier"          TEXT;
ALTER TABLE "CryptoAsset" ADD COLUMN IF NOT EXISTS "fieldSources"          JSONB;

CREATE INDEX IF NOT EXISTS "CryptoAsset_riskScore_idx" ON "CryptoAsset"("riskScore");
