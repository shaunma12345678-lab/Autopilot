// Deep Search API — high-volume parallel lead discovery.
// Returns up to 500 leads from 7 simultaneous sources across multiple counties.
// Uses Server-Sent Events (SSE) so the UI receives live progress as each
// batch completes — users see leads count climbing in real time.
//
// POST body:
//   { searchType, zipCode?, city?, state?, county?,
//     countyIds?, maxLeads, daysBack?, existingAddresses?, businessId? }

export const maxDuration = 300

import { NextRequest } from "next/server"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import { deepSearch, type DeepSearchParams } from "@/lib/deep-search-engine"
import { freeLeadToForeclosureLead } from "@/lib/foreclosure-lead-adapter"
import type { FreeLead } from "@/lib/free-foreclosure-scraper"

function sseEvent(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
}

// POST — streams SSE events as batches complete, then sends final "done" event
export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response("Unauthorized", { status: 401 })

  const body = await request.json() as {
    searchType:        string
    zipCode?:          string
    city?:             string
    state?:            string
    county?:           string
    countyIds?:        string[]
    maxLeads?:         number
    daysBack?:         number
    existingAddresses?: string[]
    businessId?:       string
  }

  const maxLeads = Math.min(Math.max(body.maxLeads ?? 100, 50), 500)

  const existingSet = new Set<string>(
    (body.existingAddresses ?? []).map(a => a.toLowerCase().replace(/[\s,#.-]/g, ""))
  )

  const params: DeepSearchParams = {
    searchType:        body.searchType as "zip" | "city" | "county",
    zipCode:           body.zipCode,
    city:              body.city,
    state:             body.state,
    county:            body.county,
    countyIds:         body.countyIds,
    maxLeads,
    daysBack:          body.daysBack,
    existingAddresses: existingSet,
  }

  const encoder  = new TextEncoder()
  let   isClosed = false

  const stream = new ReadableStream({
    async start(controller) {
      function send(event: string, data: unknown) {
        if (!isClosed) {
          try {
            controller.enqueue(encoder.encode(sseEvent(event, data)))
          } catch { /* controller may have closed */ }
        }
      }

      params.onProgress = (msg, count) => {
        send("progress", { msg, count })
      }

      try {
        const result = await deepSearch(params)

        const leads = result.leads.map(fl => {
          try { return freeLeadToForeclosureLead(fl) } catch { return null }
        }).filter(Boolean)

        const newLeads = result.newLeads.map(fl => {
          try { return freeLeadToForeclosureLead(fl) } catch { return null }
        }).filter(Boolean)

        send("done", {
          leads,
          newLeads,
          sourceCounts: result.sourceCounts,
          total:        result.total,
          newTotal:     result.newTotal,
        })
      } catch (err) {
        send("error", { message: err instanceof Error ? err.message : "Search failed" })
      } finally {
        isClosed = true
        try { controller.close() } catch { /* already closed */ }
      }
    },
    cancel() {
      isClosed = true
    },
  })

  return new Response(stream, {
    headers: {
      "Content-Type":  "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Connection":    "keep-alive",
      "X-Accel-Buffering": "no",
    },
  })
}

// GET — quick status check, returns count of leads saved for this user
export async function GET(request: NextRequest) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const since = searchParams.get("since")

  try {
    const { prisma } = await import("@/lib/prisma")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const business = await (prisma.business as any).findFirst({ where: { userId: user.id } })
    if (!business) return Response.json({ count: 0 })

    const where: Record<string, unknown> = { businessId: (business as { id: string }).id }
    if (since) where.createdAt = { gte: new Date(since) }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const count = await (prisma.lead as any).count({ where })
    return Response.json({ count })
  } catch {
    return Response.json({ count: 0 })
  }
}
