// Admin-authenticated foreclosure proxy.
// Validates x-admin-password header — no Supabase session required.
//
// Data source priority:
//  1. ATTOM Data API      (ATTOM_API_KEY) — deepest, paid
//  2. Tavily web search   (TAVILY_API_KEY) — free 1k/month
//  3. Zero-key engine     (Groq only)     — works with ZERO extra setup

import { NextRequest } from "next/server"
import { prisma } from "@/lib/prisma"
import {
  searchForeclosuresByZip,
  searchForeclosuresByCity,
  searchForeclosuresByCounty,
  batchFullEnrichment,
} from "@/lib/attom"
import {
  buildForeclosureLead,
  computeScore,
  computeDealCalc,
  type ForeclosureLead,
} from "@/lib/agents/foreclosure-agent"
import { batchDiscoverContacts } from "@/lib/foreclosure-enrichment"
import { searchFreeForeclosures } from "@/lib/free-foreclosure-scraper"
import { searchZeroKey, type ZeroKeyLead } from "@/lib/zero-key-foreclosure-scraper"

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "ap2026admin"

function auth(req: NextRequest) {
  return req.headers.get("x-admin-password") === ADMIN_PASSWORD
}

function hashStr(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0
  return h
}

function zeroKeyLeadToForeclosureLead(fl: ZeroKeyLead): ForeclosureLead {
  const partial = {
    attomId: Math.abs(hashStr(fl.address + fl.city + fl.zip)),
    address: fl.address,
    city: fl.city,
    state: fl.state,
    zip: fl.zip,
    ownerName: fl.ownerName || "Owner Unknown",
    ownerName2: null,
    ownerType: "individual" as const,
    isAbsentee: false,
    mailingAddress: null,
    yearsOwned: null,
    phone: null,
    email: null,
    linkedInUrl: null,
    contactConfidence: null,
    foreclosureType: fl.foreclosureStage,
    foreclosureStage: fl.foreclosureStage,
    recordingDate: fl.recordingDate,
    daysOnFile: fl.recordingDate
      ? Math.floor((Date.now() - new Date(fl.recordingDate).getTime()) / 86400000)
      : 0,
    defaultAmount: fl.defaultAmount,
    lender: fl.lender,
    auctionDate: fl.auctionDate,
    estimatedValue: fl.estimatedValue,
    avmValue: null,
    avmConfidence: null,
    purchasePrice: null,
    purchaseDate: null,
    totalLiens: fl.defaultAmount ?? 0,
    lienCount: fl.defaultAmount ? 1 : 0,
    estimatedEquity:
      fl.estimatedValue && fl.defaultAmount
        ? fl.estimatedValue - fl.defaultAmount
        : null,
    equityPercent:
      fl.estimatedValue && fl.defaultAmount
        ? Math.round(((fl.estimatedValue - fl.defaultAmount) / fl.estimatedValue) * 100)
        : null,
    taxDelinquent: false,
    propertyType: "SFR",
    beds: null,
    baths: null,
    sqft: null,
    yearBuilt: null,
    lotSize: null,
    dealCalc: null,
    outreach: null,
  }
  const { score, priority, breakdown, signals } = computeScore(partial)
  const dealCalc =
    fl.estimatedValue
      ? computeDealCalc({
          ...partial,
          score,
          priority,
          scoreBreakdown: breakdown,
          scoreReason: "",
          distressSignals: signals,
        })
      : null
  return {
    ...partial,
    score,
    priority,
    scoreBreakdown: breakdown,
    scoreReason: signals[0] ?? fl.rawSignals[0] ?? "Pre-foreclosure public record",
    distressSignals: [...signals.slice(0, 4), ...fl.rawSignals.slice(0, 2)],
    dealCalc,
  }
}

// GET — return first business id for the admin
export async function GET(request: NextRequest) {
  if (!auth(request)) return Response.json({ error: "Unauthorized" }, { status: 401 })
  const business = await prisma.business.findFirst({ orderBy: { createdAt: "asc" } })
  return Response.json({ businessId: business?.id ?? null, businessName: business?.name ?? null })
}

// POST — run foreclosure search
export async function POST(request: NextRequest) {
  if (!auth(request)) return Response.json({ error: "Unauthorized" }, { status: 401 })

  const body = await request.json()
  const {
    searchType,
    zipCode,
    city,
    state,
    county,
    maxLeads = 100,
    daysBack = 90,
    enrichContacts = false,
  } = body

  if (!searchType)
    return Response.json({ error: "searchType required" }, { status: 400 })
  if (searchType === "zip" && !zipCode)
    return Response.json({ error: "Enter a ZIP code" }, { status: 400 })
  if (searchType === "city" && (!city || !state))
    return Response.json({ error: "Enter city and state" }, { status: 400 })
  if (searchType === "county" && (!county || !state))
    return Response.json({ error: "Enter county and state" }, { status: 400 })

  const safeMax = Math.min(Math.max(maxLeads, 1), 200)
  const safeDays = Math.min(Math.max(daysBack, 7), 365)

  // ── Tier 1: ATTOM (deep, paid) ─────────────────────────────────────────────
  if (process.env.ATTOM_API_KEY) {
    const endDate = new Date().toISOString().split("T")[0]
    const startDate = new Date(Date.now() - safeDays * 86400000).toISOString().split("T")[0]
    const allRecords: Awaited<ReturnType<typeof searchForeclosuresByZip>>["records"] = []
    let page = 1, totalAvailable = Infinity

    while (allRecords.length < safeMax && allRecords.length < totalAvailable) {
      const pageSize = Math.min(safeMax - allRecords.length, 100)
      const result =
        searchType === "zip"
          ? await searchForeclosuresByZip(zipCode, startDate, endDate, page, pageSize)
          : searchType === "city"
          ? await searchForeclosuresByCity(city, state, startDate, endDate, page, pageSize)
          : await searchForeclosuresByCounty(county, state, startDate, endDate, page, pageSize)
      totalAvailable = result.total
      allRecords.push(...result.records)
      if (result.records.length < pageSize) break
      page++
    }

    if (allRecords.length > 0) {
      const records = allRecords.slice(0, safeMax)
      const bundleMap = await batchFullEnrichment(records.map(r => r.attomId), 3)
      let contactMap = new Map()
      if (enrichContacts && process.env.TAVILY_API_KEY) {
        const inputs = records.map(r => ({
          attomId: r.attomId,
          ownerName: bundleMap.get(r.attomId)?.detail?.ownerName ?? "Unknown",
          address: r.address, city: r.city, state: r.state, zip: r.zip,
        }))
        contactMap = await batchDiscoverContacts(inputs, 2)
      }
      const leads = records.map(r =>
        buildForeclosureLead(
          r,
          bundleMap.get(r.attomId) ?? { detail: null, avm: null, saleHistory: null, liens: null },
          contactMap.get(r.attomId)
        )
      )
      leads.sort((a, b) => b.score - a.score)
      return Response.json({ leads, total: totalAvailable, fetched: leads.length, dataSource: "attom" })
    }
  }

  // ── Tier 2: Tavily web search (free, 1k/month) ─────────────────────────────
  if (process.env.TAVILY_API_KEY) {
    const { leads: freeLeads, total } = await searchFreeForeclosures({
      searchType, zipCode, city, state, county, daysBack: safeDays, maxLeads: safeMax,
    })
    if (freeLeads.length > 0) {
      const leads = freeLeads.map(fl => zeroKeyLeadToForeclosureLead({ ...fl, dataMode: "live" as const, sourceLabel: "Tavily Web Search" }))
      leads.sort((a, b) => b.score - a.score)
      return Response.json({ leads, total, fetched: leads.length, dataSource: "tavily-public-records" })
    }
  }

  // ── Tier 3: Zero-key engine (DuckDuckGo + Groq — works with NO extra setup) ─
  const { leads: zkLeads, mode } = await searchZeroKey({
    searchType, zipCode, city, state, county, maxLeads: safeMax, daysBack: safeDays,
  })

  if (zkLeads.length === 0) {
    return Response.json({
      leads: [],
      total: 0,
      fetched: 0,
      message: "No results found for this area. Try a different ZIP code, city, or wider date range.",
    })
  }

  const leads = zkLeads.map(zeroKeyLeadToForeclosureLead)
  leads.sort((a, b) => b.score - a.score)

  return Response.json({
    leads,
    total: leads.length,
    fetched: leads.length,
    dataSource: mode === "ai-research" ? "ai-research-mode" : "duckduckgo-live",
    dataNote:
      mode === "ai-research"
        ? "AI Research Mode: leads generated from Groq market knowledge for this area. Add TAVILY_API_KEY (free) or ATTOM_API_KEY for live public record data."
        : "Live public records found via web search.",
  })
}

// PUT — save selected leads to the first business
export async function PUT(request: NextRequest) {
  if (!auth(request)) return Response.json({ error: "Unauthorized" }, { status: 401 })

  const { leads }: { leads: ForeclosureLead[] } = await request.json()
  const business = await prisma.business.findFirst({ orderBy: { createdAt: "asc" } })
  if (!business) return Response.json({ error: "No business found" }, { status: 404 })

  const created = await Promise.all(
    leads.map(lead =>
      prisma.lead.create({
        data: {
          businessId: business.id,
          name: `${lead.ownerName} — ${lead.address}, ${lead.city} ${lead.state}`,
          email: lead.email ?? null,
          phone: lead.phone ?? null,
          source: `Pre-Foreclosure · ${lead.foreclosureStage.replace(/_/g, " ")}`,
          score: lead.score,
          notes: [
            `Stage: ${lead.foreclosureStage.replace(/_/g, " ")}`,
            `Filed: ${lead.recordingDate}`,
            `Est. Value: ${lead.estimatedValue ? `$${lead.estimatedValue.toLocaleString()}` : "unknown"}`,
            `Equity: ${lead.equityPercent ?? "?"}%`,
            `Score: ${lead.score}/100 — ${lead.scoreReason}`,
            lead.distressSignals.join(" · "),
          ].join("\n"),
          status: lead.priority === "HOT" ? "QUALIFIED" : "NEW",
        },
      })
    )
  )
  return Response.json({ saved: created.length })
}
