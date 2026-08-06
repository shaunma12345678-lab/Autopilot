-- Run in Supabase SQL Editor. Additive + idempotent.
-- Score history: the baseline that makes deterioration (and a sell signal)
-- detectable, and the data behind the trajectory chart.
CREATE TABLE IF NOT EXISTS "ScoreSnapshot" (
  "id"           TEXT NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "subjectType"  TEXT NOT NULL,
  "subjectId"    TEXT NOT NULL,
  "symbol"       TEXT NOT NULL,
  "qualityScore" INTEGER,
  "riskScore"    INTEGER,
  "forwardScore" INTEGER,
  "actionSignal" TEXT,
  "priceUsd"     DOUBLE PRECISION,
  "capturedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "ScoreSnapshot_subject_idx" ON "ScoreSnapshot"("subjectType","symbol","capturedAt");
CREATE INDEX IF NOT EXISTS "ScoreSnapshot_subjectId_idx" ON "ScoreSnapshot"("subjectId");
