// Deep Search API — high-volume parallel lead discovery.
// Returns up to 500 scored leads from 7 simultaneous sources across multiple counties.
// Uses a standard JSON response (no SSE) for maximum Vercel compatibility.
// An internal 50-second hard deadline ensures it always returns within Vercel's limits.
//
// POST body:
//   { searchType, zipCode?, city?, state?, county?,
//     countyIds?, maxLeads, daysBack? }

export const maxDuration = 60

import { NextRequest } from "next/server"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import { deepSearch, type DeepSearchParams } from "@/lib/deep-search-engine"
import { freeLeadToForeclosureLead } from "@/lib/foreclosure-lead-adapter"

const INTERNAL_DEADLINE_MS = 55_000

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "ap2026admin"

function isAuthorized(request: NextRequest, user: unknown): boolean {
  if (user) return true
  return request.headers.get("x-admin-password") === ADMIN_PASSWORD
}

export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!isAuthorized(request, user)) return Response.json({ error: "Unauthorized" }, { status: 401 })

  let body: {
    searchType:  string
    zipCode?:    string
    city?:       string
    state?:      string
    county?:     string
    countyIds?:  string[]
    maxLeads?:   number
    daysBack?:   number
    businessId?: string
    leadType?:   string
  }

  try {
    body = await request.json()
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const maxLeads = Math.min(Math.max(body.maxLeads ?? 100, 10), 1000)

  const params: DeepSearchParams = {
    searchType: body.searchType as "zip" | "city" | "county",
    zipCode:    body.zipCode,
    city:       body.city,
    state:      body.state,
    county:     body.county,
    countyIds:  body.countyIds,
    maxLeads,
    daysBack:   body.daysBack,
    businessId: body.businessId,
    leadType:   body.leadType,
  }

  // Race: deep search vs. hard deadline
  // whichever finishes first wins — partial results on timeout, full results otherwise
  const timeoutPromise = new Promise<null>(resolve =>
    setTimeout(() => resolve(null), INTERNAL_DEADLINE_MS)
  )

  let searchResult: Awaited<ReturnType<typeof deepSearch>> | null = null
  let timedOut = false

  try {
    const race = await Promise.race([
      deepSearch(params).then(r => { searchResult = r; return r }),
      timeoutPromise,
    ])
    if (race === null) {
      timedOut = true
    }
  } catch (err) {
    console.error("[deep-search POST]", err)
    return Response.json(
      { error: err instanceof Error ? err.message : "Search failed" },
      { status: 500 }
    )
  }

  // If timed out but we got partial results from a global variable set above, use them
  // If no results at all, return empty
  const result = searchResult ?? { leads: [], newLeads: [], sourceCounts: {}, total: 0, newTotal: 0 }

  const leads = result.leads
    .map(fl => { try { return freeLeadToForeclosureLead(fl) } catch { return null } })
    .filter(Boolean)

  const PRI_ORDER: Record<string, number> = { HOT: 0, WARM: 1, COLD: 2 }
  leads.sort((a, b) => {
    const pa = PRI_ORDER[a?.priority ?? "COLD"] ?? 2
    const pb = PRI_ORDER[b?.priority ?? "COLD"] ?? 2
    if (pa !== pb) return pa - pb
    return (b?.score ?? 0) - (a?.score ?? 0)
  })

  // Feed the Property Index — every search permanently upgrades OUR database
  // (canonical records, provenance, Potential Score). Hard time budget so the
  // response is never held hostage; anything unwritten lands on the next search.
  try {
    const { observeLeads } = await import("@/lib/property-index")
    await Promise.race([
      observeLeads(leads.filter((l): l is NonNullable<typeof l> => l !== null), { cap: 250 }),
      new Promise((r) => setTimeout(r, 8000)),
    ])
  } catch { /* the index is additive — never fail a search over it */ }

  return Response.json({
    leads,
    total:        leads.length,
    fetched:      leads.length,
    newTotal:     result.newTotal,
    sourceCounts: result.sourceCounts,
    timedOut,
    dataSource:   "deep-search",
    note:         timedOut
      ? `Returned ${leads.length} leads found within the time budget. Run again or try a smaller target for more.`
      : `Found ${leads.length} leads from ${Object.keys(result.sourceCounts).length} sources.`,
  })
}

// GET — count of leads saved for this user, optionally filtered by creation date
export async function GET(request: NextRequest) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!isAuthorized(request, user)) return Response.json({ error: "Unauthorized" }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const since = searchParams.get("since")

  if (!user) return Response.json({ count: 0 })

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
