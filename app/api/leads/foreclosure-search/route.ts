import { NextRequest } from "next/server"
import { prisma } from "@/lib/prisma"
import {
  searchForeclosuresByZip,
  searchForeclosuresByCity,
  searchForeclosuresByCounty,
  batchFullEnrichment,
  type AttomForeclosureRecord,
  type AttomPropertyBundle,
} from "@/lib/attom"
import {
  buildForeclosureLead,
  computeScore,
  computeDealCalc,
  type ForeclosureLead,
  type ScoreBreakdown,
} from "@/lib/agents/foreclosure-agent"
import { batchDiscoverContacts } from "@/lib/foreclosure-enrichment"
import { searchFreeForeclosures, type FreeLead } from "@/lib/free-foreclosure-scraper"

// Convert a free-scraped lead into the ForeclosureLead shape (no ATTOM data)
function freeLeadToForeclosureLead(fl: FreeLead): ForeclosureLead {
  const partial = {
    attomId: Math.abs(hashStr(fl.address + fl.city)),
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
    daysOnFile: fl.recordingDate ? Math.floor((Date.now() - new Date(fl.recordingDate).getTime()) / 86400000) : 0,
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
    estimatedEquity: null,
    equityPercent: null,
    taxDelinquent: false,
    propertyType: null,
    beds: null,
    baths: null,
    sqft: null,
    yearBuilt: null,
    lotSize: null,
    dealCalc: null,
    outreach: null,
  }
  const { score, priority, breakdown, signals } = computeScore(partial)
  const dealCalc = fl.estimatedValue ? computeDealCalc({ ...partial, score, priority, scoreBreakdown: breakdown, scoreReason: "", distressSignals: signals }) : null
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

function hashStr(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0
  return h
}

// POST /api/leads/foreclosure-search
// Uses ATTOM if configured (deep 6-pass), otherwise free public-records scraper via Tavily.
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      searchType,       // "zip" | "city" | "county"
      zipCode,
      city,
      state,
      county,
      maxLeads = 100,
      daysBack = 90,
      enrichContacts = false,  // web-search contact discovery (uses Tavily quota)
    } = body as {
      searchType: string
      zipCode?: string
      city?: string
      state?: string
      county?: string
      maxLeads?: number
      daysBack?: number
      enrichContacts?: boolean
    }

    if (!searchType)
      return Response.json({ error: "searchType required" }, { status: 400 })
    if (searchType === "zip" && !zipCode)
      return Response.json({ error: "zipCode required" }, { status: 400 })
    if (searchType === "city" && (!city || !state))
      return Response.json({ error: "city and state required" }, { status: 400 })
    if (searchType === "county" && (!county || !state))
      return Response.json({ error: "county and state required" }, { status: 400 })

    const safeMax = Math.min(Math.max(maxLeads, 1), 500)
    const safeDays = Math.min(Math.max(daysBack, 7), 365)

    // ── FREE PATH: use public records scraper when ATTOM is not configured ────
    if (!process.env.ATTOM_API_KEY) {
      const { leads: freeLeads, total, sourceCounts } = await searchFreeForeclosures({
        searchType, zipCode, city, state, county, daysBack: safeDays, maxLeads: safeMax,
      })

      const leads: ForeclosureLead[] = freeLeads.map(freeLeadToForeclosureLead)
      leads.sort((a, b) => b.score - a.score)

      const sourceList = Object.entries(sourceCounts ?? {})
        .map(([src, n]) => `${src} (${n})`)
        .join(", ")

      return Response.json({
        leads,
        total,
        fetched:    leads.length,
        dataSource: "direct-sources",
        sources:    sourceCounts ?? {},
        note:       sourceList
          ? `Sources: ${sourceList}. Add ATTOM_API_KEY for full equity/liens/AVM data.`
          : "No leads found — try a broader area or different date range.",
      })
    }

    // ── ATTOM PATH: full 6-pass enrichment ───────────────────────────────────
    const endDate = new Date().toISOString().split("T")[0]
    const startDate = new Date(Date.now() - safeDays * 86400000)
      .toISOString()
      .split("T")[0]

    // ── Pass 1: Fetch foreclosure records ─────────────────────────────────
    const allRecords: Awaited<ReturnType<typeof searchForeclosuresByZip>>["records"] = []
    let page = 1
    let totalAvailable = Infinity

    while (allRecords.length < safeMax && allRecords.length < totalAvailable) {
      const pageSize = Math.min(safeMax - allRecords.length, 100)
      let result: { records: typeof allRecords; total: number }

      if (searchType === "zip") {
        result = await searchForeclosuresByZip(zipCode!, startDate, endDate, page, pageSize)
      } else if (searchType === "city") {
        result = await searchForeclosuresByCity(city!, state!, startDate, endDate, page, pageSize)
      } else {
        result = await searchForeclosuresByCounty(county!, state!, startDate, endDate, page, pageSize)
      }

      totalAvailable = result.total
      allRecords.push(...result.records)
      if (result.records.length < pageSize) break
      page++
    }

    if (allRecords.length === 0) {
      return Response.json({
        leads: [],
        total: 0,
        fetched: 0,
        message:
          "No pre-foreclosure records found for this area and date range. Try expanding the date range or a larger area.",
      })
    }

    const records = allRecords.slice(0, safeMax)

    // ── Passes 2-5: Property detail + AVM + Sale history + Liens ─────────
    // Run all 4 ATTOM calls in parallel per property, batched at 3 concurrent
    const bundleMap = await batchFullEnrichment(
      records.map((r) => r.attomId),
      3
    )

    // ── Pass 6: Web search contact discovery (optional, uses Tavily) ──────
    let contactMap = new Map<number, { phone: string | null; email: string | null; linkedInUrl: string | null; confidence: "high" | "medium" | "low" }>()

    if (enrichContacts && process.env.TAVILY_API_KEY) {
      const contactInputs = records.map((r) => {
        const bundle = bundleMap.get(r.attomId)
        return {
          attomId: r.attomId,
          ownerName: bundle?.detail?.ownerName ?? "Unknown",
          address: r.address,
          city: r.city,
          state: r.state,
          zip: r.zip,
        }
      })
      contactMap = await batchDiscoverContacts(contactInputs, 2)
    }

    // ── Score & build final leads ─────────────────────────────────────────
    const leads: ForeclosureLead[] = records.map((record) => {
      const bundle = bundleMap.get(record.attomId) ?? {
        detail: null, avm: null, saleHistory: null, liens: null,
      }
      const contact = contactMap.get(record.attomId)
      return buildForeclosureLead(record, bundle, contact)
    })

    // Sort by score descending
    leads.sort((a, b) => b.score - a.score)

    return Response.json({
      leads,
      total: totalAvailable,
      fetched: leads.length,
      contactEnrichmentRan: enrichContacts && !!process.env.TAVILY_API_KEY,
    })
  } catch (err) {
    console.error("[foreclosure-search POST]", err)
    return Response.json(
      { error: err instanceof Error ? err.message : "Search failed" },
      { status: 500 }
    )
  }
}

// PUT /api/leads/foreclosure-search — save selected leads to CRM
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json()
    const { businessId, leads }: { businessId: string; leads: ForeclosureLead[] } = body

    if (!businessId || !Array.isArray(leads) || leads.length === 0)
      return Response.json({ error: "businessId and leads array required" }, { status: 400 })

    const business = await prisma.business.findFirst({ where: { id: businessId } })
    if (!business) return Response.json({ error: "Business not found" }, { status: 404 })

    const created = await Promise.all(
      leads.map((lead) =>
        prisma.lead.create({
          data: {
            businessId,
            name: `${lead.ownerName} — ${lead.address}, ${lead.city} ${lead.state}`,
            email: lead.email ?? null,
            phone: lead.phone ?? null,
            source: `Pre-Foreclosure · ${lead.foreclosureStage.replace(/_/g, " ")}`,
            score: lead.score,
            notes: buildNotes(lead),
            status: lead.priority === "HOT" ? "QUALIFIED" : "NEW",
          },
        })
      )
    )

    return Response.json({ saved: created.length })
  } catch (err) {
    console.error("[foreclosure-search PUT]", err)
    return Response.json({ error: "Failed to save leads" }, { status: 500 })
  }
}

function buildNotes(lead: ForeclosureLead): string {
  const lines = [
    `Property: ${lead.address}, ${lead.city}, ${lead.state} ${lead.zip}`,
    lead.propertyType ? `Type: ${lead.propertyType}` : null,
    lead.beds ? `${lead.beds}bd / ${lead.baths}ba · ${lead.sqft?.toLocaleString() ?? "?"} sqft · Built ${lead.yearBuilt ?? "?"}` : null,
    ``,
    `Stage: ${lead.foreclosureStage.replace(/_/g, " ")} · Filed: ${lead.recordingDate} (${lead.daysOnFile}d ago)`,
    lead.defaultAmount ? `Default Amount: $${lead.defaultAmount.toLocaleString()}` : null,
    lead.lender ? `Lender: ${lead.lender}` : null,
    lead.auctionDate ? `Auction Date: ${lead.auctionDate}` : null,
    ``,
    lead.estimatedValue ? `Est. Value: $${lead.estimatedValue.toLocaleString()}${lead.avmValue ? ` (AVM confidence: ${lead.avmConfidence}%)` : ""}` : null,
    lead.estimatedEquity !== null ? `Est. Equity: $${lead.estimatedEquity.toLocaleString()} (${lead.equityPercent}%)` : null,
    `Total Liens: $${lead.totalLiens.toLocaleString()} · Lien Count: ${lead.lienCount}`,
    lead.purchasePrice ? `Purchased: $${lead.purchasePrice.toLocaleString()} in ${lead.purchaseDate?.slice(0, 7) ?? "?"}` : null,
    lead.taxDelinquent ? `⚠ TAX DELINQUENT` : null,
    lead.isAbsentee ? `Owner is ABSENTEE (mailing: ${lead.mailingAddress ?? "?"})` : null,
    `Owner Type: ${lead.ownerType}`,
    lead.yearsOwned !== null ? `Owned ${lead.yearsOwned} years` : null,
    ``,
    lead.dealCalc
      ? [
          `Deal Calculator:`,
          `  ARV: $${lead.dealCalc.arv.toLocaleString()}`,
          `  Est. Repairs: $${lead.dealCalc.estimatedRepairs.toLocaleString()}`,
          `  Max Offer (70% rule): $${lead.dealCalc.maxOffer.toLocaleString()}`,
          `  Equity Available: $${lead.dealCalc.equityAvailable.toLocaleString()}`,
          `  Potential Profit: $${lead.dealCalc.potentialProfit.toLocaleString()}`,
          `  Deal Grade: ${lead.dealCalc.dealGrade}`,
        ].join("\n")
      : null,
    ``,
    `AI Score: ${lead.score}/100 — ${lead.scoreReason}`,
    `Distress Signals:\n${lead.distressSignals.map((s) => `  · ${s}`).join("\n")}`,
  ]
  return lines.filter((l) => l !== null).join("\n")
}
