import { NextRequest } from "next/server"
import { prisma } from "@/lib/prisma"

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "ap2026admin"

// $queryRawUnsafe reuses the existing Prisma singleton connection (same as all other routes).
// $executeRawUnsafe and new pg.Pool() both fail in serverless because they open fresh
// TCP connections — whereas $queryRawUnsafe goes through the established adapter pool.
async function run(label: string, sql: string, results: string[]) {
  try {
    await prisma.$queryRawUnsafe(sql)
    results.push(`${label}: OK`)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (msg.includes("already exists") || msg.includes("duplicate")) {
      results.push(`${label}: OK (already exists)`)
    } else {
      results.push(`${label}: ${msg.split("\n")[0].slice(0, 120)}`)
    }
  }
}

export async function POST(request: NextRequest) {
  const { password } = await request.json()
  if (password !== ADMIN_PASSWORD) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }

  const results: string[] = []

  // ── Enums ─────────────────────────────────────────────────────────────────

  await run("RunStatus enum", `
    DO $$ BEGIN
      CREATE TYPE "RunStatus" AS ENUM ('RUNNING', 'COMPLETED', 'FAILED');
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
  `, results)

  await run("MessageRole enum", `
    DO $$ BEGIN
      CREATE TYPE "MessageRole" AS ENUM ('USER', 'ASSISTANT', 'SYSTEM');
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
  `, results)

  // ── Core tables ───────────────────────────────────────────────────────────

  await run("ConnectedAccount", `
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
    )
  `, results)

  await run("ConnectedAccount index", `
    CREATE INDEX IF NOT EXISTS "ConnectedAccount_userId_idx" ON "ConnectedAccount"("userId")
  `, results)

  await run("AgentRun", `
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
    )
  `, results)

  await run("AgentRun indexes", `
    CREATE INDEX IF NOT EXISTS "AgentRun_userId_idx"    ON "AgentRun"("userId");
    CREATE INDEX IF NOT EXISTS "AgentRun_agentSlug_idx" ON "AgentRun"("agentSlug");
    CREATE INDEX IF NOT EXISTS "AgentRun_createdAt_idx" ON "AgentRun"("createdAt" DESC)
  `, results)

  await run("Site", `
    CREATE TABLE IF NOT EXISTS "Site" (
      "id"         TEXT NOT NULL DEFAULT gen_random_uuid()::text,
      "businessId" TEXT NOT NULL,
      "slug"       TEXT NOT NULL,
      "title"      TEXT NOT NULL,
      "html"       TEXT NOT NULL,
      "published"  BOOLEAN NOT NULL DEFAULT false,
      "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "Site_pkey" PRIMARY KEY ("id"),
      CONSTRAINT "Site_slug_key" UNIQUE ("slug"),
      CONSTRAINT "Site_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE
    )
  `, results)

  await run("Site index", `
    CREATE INDEX IF NOT EXISTS "Site_slug_idx" ON "Site"("slug")
  `, results)

  // ── Conversations & Messages ───────────────────────────────────────────────

  await run("Conversation", `
    CREATE TABLE IF NOT EXISTS "Conversation" (
      "id"         TEXT NOT NULL DEFAULT gen_random_uuid()::text,
      "userId"     TEXT NOT NULL,
      "businessId" TEXT,
      "agentSlug"  TEXT NOT NULL,
      "agentName"  TEXT NOT NULL,
      "title"      TEXT NOT NULL DEFAULT 'New Chat',
      "pinned"     BOOLEAN NOT NULL DEFAULT false,
      "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "Conversation_pkey" PRIMARY KEY ("id"),
      CONSTRAINT "Conversation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE,
      CONSTRAINT "Conversation_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE SET NULL
    )
  `, results)

  await run("Conversation indexes", `
    CREATE INDEX IF NOT EXISTS "Conversation_userId_agentSlug_idx" ON "Conversation"("userId", "agentSlug");
    CREATE INDEX IF NOT EXISTS "Conversation_businessId_idx" ON "Conversation"("businessId")
  `, results)

  await run("Message", `
    CREATE TABLE IF NOT EXISTS "Message" (
      "id"             TEXT NOT NULL DEFAULT gen_random_uuid()::text,
      "conversationId" TEXT NOT NULL,
      "role"           "MessageRole" NOT NULL,
      "content"        TEXT NOT NULL,
      "metadata"       JSONB NOT NULL DEFAULT '{}',
      "qualityScore"   INTEGER,
      "iterations"     INTEGER,
      "searchUsed"     BOOLEAN NOT NULL DEFAULT false,
      "toolsUsed"      TEXT[] NOT NULL DEFAULT '{}',
      "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "Message_pkey" PRIMARY KEY ("id"),
      CONSTRAINT "Message_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE
    )
  `, results)

  await run("Message index", `
    CREATE INDEX IF NOT EXISTS "Message_conversationId_idx" ON "Message"("conversationId")
  `, results)

  // ── Agent Memory ──────────────────────────────────────────────────────────

  await run("AgentMemory", `
    CREATE TABLE IF NOT EXISTS "AgentMemory" (
      "id"         TEXT NOT NULL DEFAULT gen_random_uuid()::text,
      "businessId" TEXT NOT NULL,
      "agentSlug"  TEXT NOT NULL,
      "key"        TEXT NOT NULL,
      "value"      TEXT NOT NULL,
      "updatedAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "AgentMemory_pkey" PRIMARY KEY ("id"),
      CONSTRAINT "AgentMemory_businessId_agentSlug_key_key" UNIQUE ("businessId", "agentSlug", "key"),
      CONSTRAINT "AgentMemory_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE
    )
  `, results)

  await run("AgentMemory index", `
    CREATE INDEX IF NOT EXISTS "AgentMemory_businessId_agentSlug_idx" ON "AgentMemory"("businessId", "agentSlug")
  `, results)

  // ── Few-Shot Examples ─────────────────────────────────────────────────────

  await run("FewShotExample", `
    CREATE TABLE IF NOT EXISTS "FewShotExample" (
      "id"          TEXT NOT NULL DEFAULT gen_random_uuid()::text,
      "businessId"  TEXT NOT NULL,
      "agentSlug"   TEXT NOT NULL,
      "userInput"   TEXT NOT NULL,
      "agentOutput" TEXT NOT NULL,
      "quality"     INTEGER NOT NULL DEFAULT 8,
      "approved"    BOOLEAN NOT NULL DEFAULT false,
      "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "FewShotExample_pkey" PRIMARY KEY ("id"),
      CONSTRAINT "FewShotExample_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE
    )
  `, results)

  await run("FewShotExample index", `
    CREATE INDEX IF NOT EXISTS "FewShotExample_businessId_agentSlug_idx" ON "FewShotExample"("businessId", "agentSlug")
  `, results)

  // ── Custom Tools ──────────────────────────────────────────────────────────

  await run("CustomTool", `
    CREATE TABLE IF NOT EXISTS "CustomTool" (
      "id"          TEXT NOT NULL DEFAULT gen_random_uuid()::text,
      "userId"      TEXT NOT NULL,
      "name"        TEXT NOT NULL,
      "description" TEXT NOT NULL,
      "toolType"    TEXT NOT NULL DEFAULT 'webhook',
      "config"      JSONB NOT NULL DEFAULT '{}',
      "inputSchema" JSONB NOT NULL DEFAULT '{}',
      "enabled"     BOOLEAN NOT NULL DEFAULT true,
      "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "CustomTool_pkey" PRIMARY KEY ("id"),
      CONSTRAINT "CustomTool_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE
    )
  `, results)

  await run("CustomTool index", `
    CREATE INDEX IF NOT EXISTS "CustomTool_userId_idx" ON "CustomTool"("userId")
  `, results)

  // ── Scheduled Runs ────────────────────────────────────────────────────────

  await run("ScheduledRun", `
    CREATE TABLE IF NOT EXISTS "ScheduledRun" (
      "id"              TEXT NOT NULL DEFAULT gen_random_uuid()::text,
      "businessId"      TEXT NOT NULL,
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
      CONSTRAINT "ScheduledRun_pkey" PRIMARY KEY ("id"),
      CONSTRAINT "ScheduledRun_businessId_agentSlug_key" UNIQUE ("businessId", "agentSlug"),
      CONSTRAINT "ScheduledRun_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE
    )
  `, results)

  await run("ScheduledRun index", `
    CREATE INDEX IF NOT EXISTS "ScheduledRun_businessId_idx" ON "ScheduledRun"("businessId")
  `, results)

  const allOk = results.every(r => r.includes(": OK"))
  return Response.json({ success: allOk, results })
}
