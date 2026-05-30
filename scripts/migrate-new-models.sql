-- Run this in your Supabase SQL Editor (supabase.com → your project → SQL Editor)
-- Adds: Conversations, Messages, AgentMemory, FewShotExamples, CustomTools, ScheduledRuns

-- Enum: MessageRole
DO $$ BEGIN
  CREATE TYPE "MessageRole" AS ENUM ('USER', 'ASSISTANT', 'SYSTEM');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- Conversations
CREATE TABLE IF NOT EXISTS "Conversation" (
  "id"         TEXT NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "userId"     TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "businessId" TEXT REFERENCES "Business"("id") ON DELETE SET NULL,
  "agentSlug"  TEXT NOT NULL,
  "agentName"  TEXT NOT NULL,
  "title"      TEXT NOT NULL DEFAULT 'New Chat',
  "pinned"     BOOLEAN NOT NULL DEFAULT false,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "Conversation_userId_agentSlug_idx" ON "Conversation"("userId", "agentSlug");
CREATE INDEX IF NOT EXISTS "Conversation_businessId_idx" ON "Conversation"("businessId");

-- Messages
CREATE TABLE IF NOT EXISTS "Message" (
  "id"             TEXT NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "conversationId" TEXT NOT NULL REFERENCES "Conversation"("id") ON DELETE CASCADE,
  "role"           "MessageRole" NOT NULL,
  "content"        TEXT NOT NULL,
  "metadata"       JSONB NOT NULL DEFAULT '{}',
  "qualityScore"   INT,
  "iterations"     INT,
  "searchUsed"     BOOLEAN NOT NULL DEFAULT false,
  "toolsUsed"      TEXT[] NOT NULL DEFAULT '{}',
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "Message_conversationId_idx" ON "Message"("conversationId");

-- AgentMemory
CREATE TABLE IF NOT EXISTS "AgentMemory" (
  "id"         TEXT NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "businessId" TEXT NOT NULL REFERENCES "Business"("id") ON DELETE CASCADE,
  "agentSlug"  TEXT NOT NULL,
  "key"        TEXT NOT NULL,
  "value"      TEXT NOT NULL,
  "updatedAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE ("businessId", "agentSlug", "key")
);
CREATE INDEX IF NOT EXISTS "AgentMemory_businessId_agentSlug_idx" ON "AgentMemory"("businessId", "agentSlug");

-- FewShotExample
CREATE TABLE IF NOT EXISTS "FewShotExample" (
  "id"          TEXT NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "businessId"  TEXT NOT NULL REFERENCES "Business"("id") ON DELETE CASCADE,
  "agentSlug"   TEXT NOT NULL,
  "userInput"   TEXT NOT NULL,
  "agentOutput" TEXT NOT NULL,
  "quality"     INT NOT NULL DEFAULT 8,
  "approved"    BOOLEAN NOT NULL DEFAULT false,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "FewShotExample_businessId_agentSlug_idx" ON "FewShotExample"("businessId", "agentSlug");

-- CustomTool
CREATE TABLE IF NOT EXISTS "CustomTool" (
  "id"          TEXT NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "userId"      TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "name"        TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "toolType"    TEXT NOT NULL DEFAULT 'webhook',
  "config"      JSONB NOT NULL DEFAULT '{}',
  "inputSchema" JSONB NOT NULL DEFAULT '{}',
  "enabled"     BOOLEAN NOT NULL DEFAULT true,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "CustomTool_userId_idx" ON "CustomTool"("userId");

-- ScheduledRun
CREATE TABLE IF NOT EXISTS "ScheduledRun" (
  "id"              TEXT NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "businessId"      TEXT NOT NULL REFERENCES "Business"("id") ON DELETE CASCADE,
  "agentSlug"       TEXT NOT NULL,
  "agentName"       TEXT NOT NULL,
  "enabled"         BOOLEAN NOT NULL DEFAULT true,
  "cronExpression"  TEXT NOT NULL,
  "lastOutput"      TEXT,
  "lastRunAt"       TIMESTAMP(3),
  "nextRunAt"       TIMESTAMP(3),
  "lastChangePct"   DOUBLE PRECISION,
  "notifyOnChange"  BOOLEAN NOT NULL DEFAULT true,
  "changeThreshold" DOUBLE PRECISION NOT NULL DEFAULT 25.0,
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE ("businessId", "agentSlug")
);
CREATE INDEX IF NOT EXISTS "ScheduledRun_businessId_idx" ON "ScheduledRun"("businessId");

-- Prisma migration marker (so Prisma knows this was applied)
INSERT INTO "_prisma_migrations" ("id", "checksum", "finished_at", "migration_name", "logs", "rolled_back_at", "started_at", "applied_steps_count")
VALUES (
  gen_random_uuid()::text,
  'manual_migration_new_models',
  CURRENT_TIMESTAMP,
  'add_conversations_memory_tools_scheduled',
  NULL, NULL,
  CURRENT_TIMESTAMP,
  1
) ON CONFLICT DO NOTHING;
