-- Run this in your Supabase SQL Editor:
-- Dashboard → SQL Editor → New Query → paste this → Run

-- ConnectedAccount table (OAuth tokens + API credentials per user per provider)
CREATE TABLE IF NOT EXISTS "ConnectedAccount" (
  "id"           TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "userId"       TEXT NOT NULL,
  "provider"     TEXT NOT NULL,
  "accountName"  TEXT,
  "accountEmail" TEXT,
  "accessToken"  TEXT,
  "refreshToken" TEXT,
  "expiresAt"    TIMESTAMP(3),
  "scopes"       TEXT[] DEFAULT ARRAY[]::TEXT[],
  "metadata"     JSONB NOT NULL DEFAULT '{}',
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ConnectedAccount_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ConnectedAccount_userId_provider_key" UNIQUE ("userId", "provider"),
  CONSTRAINT "ConnectedAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "ConnectedAccount_userId_idx" ON "ConnectedAccount"("userId");

-- AgentRun table (activity log — every time an agent runs)
CREATE TYPE IF NOT EXISTS "RunStatus" AS ENUM ('RUNNING', 'COMPLETED', 'FAILED');

CREATE TABLE IF NOT EXISTS "AgentRun" (
  "id"          TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "userId"      TEXT NOT NULL,
  "agentSlug"   TEXT NOT NULL,
  "agentName"   TEXT NOT NULL,
  "status"      "RunStatus" NOT NULL DEFAULT 'RUNNING',
  "input"       JSONB NOT NULL DEFAULT '{}',
  "output"      JSONB,
  "errorMsg"    TEXT,
  "durationMs"  INTEGER,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  CONSTRAINT "AgentRun_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AgentRun_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "AgentRun_userId_idx"    ON "AgentRun"("userId");
CREATE INDEX IF NOT EXISTS "AgentRun_agentSlug_idx" ON "AgentRun"("agentSlug");
CREATE INDEX IF NOT EXISTS "AgentRun_createdAt_idx" ON "AgentRun"("createdAt" DESC);
