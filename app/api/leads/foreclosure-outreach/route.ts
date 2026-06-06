import { NextRequest } from "next/server"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import {
  generateOutreach,
  type ForeclosureLead,
} from "@/lib/agents/foreclosure-agent"

// POST /api/leads/foreclosure-outreach
// Generate personalized yellow letter, phone script, and SMS for a lead.
export async function POST(request: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 })

    const body = await request.json()
    const { lead, style = "empathetic" }: { lead: ForeclosureLead; style?: "empathetic" | "direct" | "professional" } = body

    if (!lead?.attomId) {
      return Response.json({ error: "lead is required" }, { status: 400 })
    }

    const outreach = await generateOutreach(lead, style)
    return Response.json({ outreach })
  } catch (err) {
    console.error("[foreclosure-outreach POST]", err)
    return Response.json(
      { error: err instanceof Error ? err.message : "Outreach generation failed" },
      { status: 500 }
    )
  }
}
