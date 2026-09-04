ALTER TABLE "Ticker"
  ADD COLUMN IF NOT EXISTS "falsificationConditions" JSONB,
  ADD COLUMN IF NOT EXISTS "falsificationFragility" TEXT,
  ADD COLUMN IF NOT EXISTS "falsificationSummary" TEXT,
  ADD COLUMN IF NOT EXISTS "falsificationTriggered" JSONB,
  ADD COLUMN IF NOT EXISTS "lastSignificantEventAccession" TEXT,
  ADD COLUMN IF NOT EXISTS "eventSignificanceHeadline" TEXT,
  ADD COLUMN IF NOT EXISTS "eventSignificanceLevel" TEXT,
  ADD COLUMN IF NOT EXISTS "eventSignificanceDirection" TEXT,
  ADD COLUMN IF NOT EXISTS "eventSignificanceReasoning" TEXT,
  ADD COLUMN IF NOT EXISTS "eventSignificanceDate" TEXT,
  ADD COLUMN IF NOT EXISTS "eventSignificanceSourceUrl" TEXT,
  ADD COLUMN IF NOT EXISTS "ceoName" TEXT,
  ADD COLUMN IF NOT EXISTS "ceoTenureYears" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "ceoIsFounder" BOOLEAN,
  ADD COLUMN IF NOT EXISTS "insiderOwnershipPct" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "boardSize" INTEGER,
  ADD COLUMN IF NOT EXISTS "independentDirectors" INTEGER,
  ADD COLUMN IF NOT EXISTS "leadershipScore" INTEGER,
  ADD COLUMN IF NOT EXISTS "leadershipSummary" TEXT,
  ADD COLUMN IF NOT EXISTS "leadershipStrengths" JSONB,
  ADD COLUMN IF NOT EXISTS "leadershipConcerns" JSONB,
  ADD COLUMN IF NOT EXISTS "executives" JSONB,
  ADD COLUMN IF NOT EXISTS "verdictSummary" TEXT,
  ADD COLUMN IF NOT EXISTS "verdictManagementQuality" TEXT,
  ADD COLUMN IF NOT EXISTS "verdictLeadQuality" TEXT,
  ADD COLUMN IF NOT EXISTS "verdictKeyStrengths" JSONB,
  ADD COLUMN IF NOT EXISTS "verdictKeyConcerns" JSONB,
  ADD COLUMN IF NOT EXISTS "verdictConflicts" JSONB,
  ADD COLUMN IF NOT EXISTS "verdictConfidenceCaveat" TEXT;

ALTER TABLE "CryptoAsset"
  ADD COLUMN IF NOT EXISTS "tvlUsd" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "pricePercentile1y" INTEGER,
  ADD COLUMN IF NOT EXISTS "onchainTransactions24h" INTEGER,
  ADD COLUMN IF NOT EXISTS "onchainMarketCapPerTx" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "onchainPercentile" DOUBLE PRECISION;

CREATE TABLE IF NOT EXISTS "SiteBuild" (
  "id" TEXT PRIMARY KEY,
  "slug" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "businessType" TEXT,
  "heuristicScore" DOUBLE PRECISION,
  "verifiedScore" DOUBLE PRECISION,
  "passed" BOOLEAN,
  "fatalCount" INTEGER NOT NULL DEFAULT 0,
  "majorCount" INTEGER NOT NULL DEFAULT 0,
  "minorCount" INTEGER NOT NULL DEFAULT 0,
  "issues" JSONB,
  "repairAttempted" BOOLEAN NOT NULL DEFAULT false,
  "repairSucceeded" BOOLEAN,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "SiteBuild_slug_idx" ON "SiteBuild"("slug");
CREATE INDEX IF NOT EXISTS "SiteBuild_createdAt_idx" ON "SiteBuild"("createdAt");
