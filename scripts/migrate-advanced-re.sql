-- Run this in your Supabase SQL Editor (supabase.com -> your project -> SQL Editor)
-- Adds: 1031 exchange matching, portfolio owner graph (entity resolution),
-- and the AI underwriter track record.

-- Lead.estimatedValue: the persisted Lead row (written by signal-processor.ts)
-- never carried a price field before now — needed for 1031 exchange price-range
-- matching. Nullable; existing/new ingestion can populate it opportunistically.
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "estimatedValue" DOUBLE PRECISION;

CREATE TABLE IF NOT EXISTS "ExchangeRequest" (
  "id"                     TEXT NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "businessId"             TEXT NOT NULL REFERENCES "Business"("id") ON DELETE CASCADE,
  "sellingPropertyAddress" TEXT NOT NULL,
  "saleClosingDate"        TIMESTAMP(3) NOT NULL,
  "identificationDeadline" TIMESTAMP(3) NOT NULL,
  "closingDeadline"        TIMESTAMP(3) NOT NULL,
  "targetPriceMin"         DOUBLE PRECISION,
  "targetPriceMax"         DOUBLE PRECISION,
  "targetPropertyType"     TEXT NOT NULL DEFAULT 'any',
  "targetCounties"         TEXT[] NOT NULL DEFAULT '{}',
  "status"                 TEXT NOT NULL DEFAULT 'active',
  "notes"                  TEXT,
  "createdAt"              TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"              TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "ExchangeRequest_businessId_idx" ON "ExchangeRequest"("businessId");
CREATE INDEX IF NOT EXISTS "ExchangeRequest_status_idx" ON "ExchangeRequest"("status");

CREATE TABLE IF NOT EXISTS "Entity" (
  "id"            TEXT NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "canonicalName" TEXT NOT NULL,
  "entityType"    TEXT,
  "state"         TEXT,
  "propertyCount" INTEGER NOT NULL DEFAULT 0,
  "updatedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "Entity_canonicalName_idx" ON "Entity"("canonicalName");

CREATE TABLE IF NOT EXISTS "EntityAlias" (
  "id"         TEXT NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "entityId"   TEXT NOT NULL REFERENCES "Entity"("id") ON DELETE CASCADE,
  "alias"      TEXT NOT NULL,
  "source"     TEXT NOT NULL,
  "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "EntityAlias_entityId_idx" ON "EntityAlias"("entityId");
CREATE INDEX IF NOT EXISTS "EntityAlias_alias_idx" ON "EntityAlias"("alias");

CREATE TABLE IF NOT EXISTS "EntityProperty" (
  "id"         TEXT NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "entityId"   TEXT NOT NULL REFERENCES "Entity"("id") ON DELETE CASCADE,
  "leadId"     TEXT NOT NULL,
  "address"    TEXT NOT NULL,
  "assetClass" TEXT NOT NULL DEFAULT 'residential',
  "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "EntityProperty_entityId_idx" ON "EntityProperty"("entityId");
CREATE INDEX IF NOT EXISTS "EntityProperty_leadId_idx" ON "EntityProperty"("leadId");

CREATE TABLE IF NOT EXISTS "UnderwriteCall" (
  "id"               TEXT NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "subjectType"      TEXT NOT NULL,
  "subjectId"        TEXT NOT NULL,
  "subjectLabel"     TEXT NOT NULL,
  "verdict"          TEXT NOT NULL,
  "predictedScore"   INTEGER NOT NULL,
  "rationale"        JSONB NOT NULL,
  "confidenceAtCall" INTEGER NOT NULL,
  "predictedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reviewAt"         TIMESTAMP(3) NOT NULL,
  "actualOutcome"    TEXT,
  "actualOutcomeAt"  TIMESTAMP(3),
  "correct"          BOOLEAN,
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "UnderwriteCall_subjectType_subjectId_idx" ON "UnderwriteCall"("subjectType", "subjectId");
CREATE INDEX IF NOT EXISTS "UnderwriteCall_reviewAt_idx" ON "UnderwriteCall"("reviewAt");
CREATE INDEX IF NOT EXISTS "UnderwriteCall_correct_idx" ON "UnderwriteCall"("correct");
