import { NextRequest } from "next/server"
import { getAdminClient } from "@/lib/supabase/admin"

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "ap2026admin"

async function checkTable(name: string, results: string[]) {
  const sb = getAdminClient()
  const { error } = await sb.from(name).select("*", { head: true, count: "exact" }).limit(0)
  if (!error || !error.message?.includes("does not exist")) {
    results.push(`${name}: OK`)
  } else {
    results.push(`${name}: MISSING — run scripts/migrate-new-models.sql in Supabase SQL editor`)
  }
}

export async function POST(request: NextRequest) {
  const { password } = await request.json()
  if (password !== ADMIN_PASSWORD) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }

  const results: string[] = []

  const tables = [
    "User", "Business", "ConnectedAccount", "AgentRun", "Site",
    "Content", "Review", "Lead", "Report",
    "Conversation", "Message", "AgentMemory",
    "FewShotExample", "CustomTool", "ScheduledRun",
  ]

  for (const t of tables) {
    await checkTable(t, results)
  }

  const allOk = results.every(r => r.includes(": OK"))
  return Response.json({ success: allOk, results })
}
