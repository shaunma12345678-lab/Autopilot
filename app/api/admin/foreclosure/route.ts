// Admin-authenticated foreclosure proxy.
// Validates x-admin-password header — no Supabase session required.
// Allows the admin panel to run the full foreclosure tool inline.

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
  type ForeclosureLead,
} from "@/lib/agents/foreclosure-agent"
import { batchDiscoverContacts } from "@/lib/foreclosure-enrichment"
import { searchFreeForeclosures } from "@/lib/free-foreclosure-scraper"

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "ap2026admin"

function auth(req: NextRequest) {
  return req.headers.get("x-admin-password") === ADMIN_PASSWORD
}

function hashStr(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0
  return h
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function freeLeadToForeclosureLead(fl: any): ForeclosureLead {
  const { computeScore, computeDealCalc } = require("@/lib/agents/foreclosure-agent")
  const partial = {
    attomId: Math.abs(hashStr(fl.address + fl.city)),
    address: fl.address, city: fl.city, state: fl.state, zip: fl.zip,
    ownerName: fl.ownerName || "Owner Unknown", ownerName2: null,
    ownerType: "individual" as const, isAbsentee: false, mailingAddress: null,
    yearsOwned: null, phone: null, email: null, linkedInUrl: null, contactConfidence: null,
    foreclosureType: fl.foreclosureStage, foreclosureStage: fl.foreclosureStage,
    recordingDate: fl.recordingDate,
    daysOnFile: fl.recordingDate ? Math.floor((Date.now() - new Date(fl.recordingDate).getTime()) / 86400000) : 0,
    defaultAmount: fl.defaultAmount, lender: fl.lender, auctionDate: fl.auctionDate,
    estimatedValue: fl.estimatedValue, avmValue: null, avmConfidence: null,
    purchasePrice: null, purchaseDate: null,
    totalLiens: fl.defaultAmount ?? 0, lienCount: fl.defaultAmount ? 1 : 0,
    estimatedEquity: null, equityPercent: null, taxDelinquent: false,
    propertyType: null, beds: null, baths: null, sqft: null, yearBuilt: null, lotSize: null,
    dealCalc: null, outreach: null,
  }
  const { score, priority, breakdown, signals } = computeScore(partial)
  const dealCalc = fl.estimatedValue ? computeDealCalc({ ...partial, score, priority, scoreBreakdown: breakdown, scoreReason: "", distressSignals: signals }) : null
  return { ...partial, score, priority, scoreBreakdown: breakdown, scoreReason: signals[0] ?? fl.rawSignals?.[0] ?? "Pre-foreclosure public record", distressSignals: [...signals.slice(0, 4), ...(fl.rawSignals ?? []).slice(0, 2)], dealCalc }
}

// GET — return first business id for the admin
export async function GET(request: NextRequest) {
  if (!auth(request)) return Response.json({ error: "Unauthorized" }, { status: 401 })
  const business = await prisma.business.findFirst({ orderBy: { createdAt: "asc" } })
  return Response.json({ businessId: business?.id ?? null, businessName: business?.name ?? null })
}

// POST — run foreclosure search (same logic as /api/leads/foreclosure-search)
export async function POST(request: NextRequest) {
  if (!auth(request)) return Response.json({ error: "Unauthorized" }, { status: 401 })

  const body = await request.json()
  const { searchType, zipCode, city, state, county, maxLeads = 100, daysBack = 90, enrichContacts = false } = body

  if (!searchType) return Response.json({ error: "searchType required" }, { status: 400 })

  const safeMax = Math.min(Math.max(maxLeads, 1), 500)
  const safeDays = Math.min(Math.max(daysBack, 7), 365)

  // Free path (no ATTOM)
  if (!process.env.ATTOM_API_KEY) {
    if (!process.env.TAVILY_API_KEY) {
      return Response.json({ error: "Add TAVILY_API_KEY (free at tavily.com) or ATTOM_API_KEY to search.", setupRequired: true }, { status: 503 })
    }
    const { leads: freeLeads, total } = await searchFreeForeclosures({ searchType, zipCode, city, state, county, daysBack: safeDays, maxLeads: safeMax })
    const leads: ForeclosureLead[] = freeLeads.map(freeLeadToForeclosureLead)
    leads.sort((a, b) => b.score - a.score)
    return Response.json({ leads, total, fetched: leads.length, dataSource: "free-public-records" })
  }

  // ATTOM path
  const endDate = new Date().toISOString().split("T")[0]
  const startDate = new Date(Date.now() - safeDays * 86400000).toISOString().split("T")[0]
  const allRecords: Awaited<ReturnType<typeof searchForeclosuresByZip>>["records"] = []
  let page = 1, totalAvailable = Infinity

  while (allRecords.length < safeMax && allRecords.length < totalAvailable) {
    const pageSize = Math.min(safeMax - allRecords.length, 100)
    const result = searchType === "zip"
      ? await searchForeclosuresByZip(zipCode, startDate, endDate, page, pageSize)
      : searchType === "city"
      ? await searchForeclosuresByCity(city, state, startDate, endDate, page, pageSize)
      : await searchForeclosuresByCounty(county, state, startDate, endDate, page, pageSize)
    totalAvailable = result.total
    allRecords.push(...result.records)
    if (result.records.length < pageSize) break
    page++
  }

  if (allRecords.length === 0) return Response.json({ leads: [], total: 0, fetched: 0, message: "No records found. Try wider date range or larger area." })

  const records = allRecords.slice(0, safeMax)
  const bundleMap = await batchFullEnrichment(records.map(r => r.attomId), 3)

  let contactMap = new Map()
  if (enrichContacts && process.env.TAVILY_API_KEY) {
    const inputs = records.map(r => ({ attomId: r.attomId, ownerName: bundleMap.get(r.attomId)?.detail?.ownerName ?? "Unknown", address: r.address, city: r.city, state: r.state, zip: r.zip }))
    contactMap = await batchDiscoverContacts(inputs, 2)
  }

  const leads = records.map(r => buildForeclosureLead(r, bundleMap.get(r.attomId) ?? { detail: null, avm: null, saleHistory: null, liens: null }, contactMap.get(r.attomId)))
  leads.sort((a, b) => b.score - a.score)
  return Response.json({ leads, total: totalAvailable, fetched: leads.length })
}

// PUT — save selected leads to the first business
export async function PUT(request: NextRequest) {
  if (!auth(request)) return Response.json({ error: "Unauthorized" }, { status: 401 })

  const { leads }: { leads: ForeclosureLead[] } = await request.json()
  const business = await prisma.business.findFirst({ orderBy: { createdAt: "asc" } })
  if (!business) return Response.json({ error: "No business found" }, { status: 404 })

  const created = await Promise.all(leads.map(lead =>
    prisma.lead.create({
      data: {
        businessId: business.id,
        name: `${lead.ownerName} — ${lead.address}, ${lead.city} ${lead.state}`,
        email: lead.email ?? null, phone: lead.phone ?? null,
        source: `Pre-Foreclosure · ${lead.foreclosureStage.replace(/_/g, " ")}`,
        score: lead.score,
        notes: `Stage: ${lead.foreclosureStage.replace(/_/g, " ")} · Filed: ${lead.recordingDate}\nEst. Value: ${lead.estimatedValue ? `$${lead.estimatedValue.toLocaleString()}` : "unknown"} · Equity: ${lead.equityPercent ?? "?"}%\nScore: ${lead.score}/100 — ${lead.scoreReason}\n${lead.distressSignals.join(" · ")}`,
        status: lead.priority === "HOT" ? "QUALIFIED" : "NEW",
      },
    })
  ))
  return Response.json({ saved: created.length })
}
