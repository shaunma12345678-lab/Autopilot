-- Run this in your Supabase SQL Editor (supabase.com -> your project -> SQL Editor)
-- Adds commercial-real-estate asset-class support to the existing distress-signal pipeline.
-- Safe to re-run: every statement is idempotent (IF NOT EXISTS / duplicate_column guard).

-- Lead: discriminate residential vs commercial, plus optional CRE property type
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "assetClass" TEXT NOT NULL DEFAULT 'residential';
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "propertyType" TEXT;
CREATE INDEX IF NOT EXISTS "Lead_assetClass_idx" ON "Lead"("assetClass");

-- RawSignal: same discriminator, plus a composite index so CRE signal queries
-- don't scan residential rows
ALTER TABLE "RawSignal" ADD COLUMN IF NOT EXISTS "assetClass" TEXT NOT NULL DEFAULT 'residential';
CREATE INDEX IF NOT EXISTS "RawSignal_assetClass_signalType_idx" ON "RawSignal"("assetClass", "signalType");

-- Source: nullable discriminator so the health dashboard can filter CRE sources
ALTER TABLE "Source" ADD COLUMN IF NOT EXISTS "assetClass" TEXT;
