import { NextRequest } from "next/server"
import { analyzeReceivables } from "@/lib/agents/invoicing-agent"

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { action, invoices, businessName } = body

    if (action === "analyze") {
      if (!Array.isArray(invoices) || invoices.length === 0) {
        return Response.json({ error: "invoices array is required" }, { status: 400 })
      }
      const result = await analyzeReceivables(invoices, String(businessName ?? "My Business"))
      return Response.json(result)
    }

    return Response.json({ error: "Unknown action" }, { status: 400 })
  } catch (err) {
    console.error("Invoicing agent error:", err)
    return Response.json({ error: "Agent failed" }, { status: 500 })
  }
}
