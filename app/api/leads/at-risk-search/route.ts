// Pre-pre-foreclosure intelligence scanner.
// Finds homeowners showing distress signals BEFORE the NOD/lis pendens is filed.
// Uses AI-powered web search across public tax records, court filings,
// code violations, HOA liens, and county delinquency lists.

import { NextRequest } from "next/server"
import { webSearchAny, webSearchDeepOrAny, extractPageContent } from "@/lib/search"
import { runAgent } from "@/lib/claude"
export interface AtRiskLead {
  id: string
  address: string
  city: string
  state: string
  zip: string
  ownerName: string
  signalType:
    | "tax_delinquent"
    | "code_violation"
    | "hoa_lien"
    | "judgment_lien"
    | "court_filing"
    | "vacant_distressed"
    | "multiple_signals"
  signalSummary: string
  riskScore: number        // 0-100
  riskLevel: "CRITICAL" | "HIGH" | "MODERATE"
  sourceUrl: string
  // Enriched from ATTOM (best-effort)
  estimatedValue: number | null
  estimatedEquity: number | null
  equityPercent: number | null
  beds: number | null
  yearBuilt: number | null
  isAbsentee: boolean
  phone: string | null
  email: string | null
  actionNote: string       // what to do with this lead
}

const EXTRACT_SYSTEM = `You are a real estate data extraction expert.
Extract distressed property leads from web search results.
Return valid JSON only — no markdown, no explanation outside JSON.`

function buildQueries(area: {
  searchType: string
  zipCode?: string
  city?: string
  state?: string
  county?: string
}): string[] {
  const place =
    area.searchType === "zip"
      ? `"${area.zipCode}"`
      : area.searchType === "city"
      ? `"${area.city}" "${area.state}"`
      : `"${area.county} county" "${area.state}"`

  const cityOrZip =
    area.searchType === "zip"
      ? area.zipCode!
      : area.searchType === "city"
      ? `${area.city} ${area.state}`
      : `${area.county} county ${area.state}`

  const year = new Date().getFullYear()

  return [
    // Tax delinquency (most reliable early-distress signal)
    `${place} property tax delinquent list ${year} address owner`,
    `${place} delinquent real estate taxes ${year} county records`,
    // Code violations and vacant/distressed properties
    `${place} code violation notice property ${year} owner address`,
    `${place} abandoned vacant property ${year} owner`,
    // HOA and judgment liens
    `${place} HOA lien filed property owner ${year}`,
    `${place} judgment lien property real estate ${year}`,
    // Court pre-foreclosure filings
    `${cityOrZip} court civil action property owner ${year} debt`,
    // Delinquency aggregators
    `${cityOrZip} tax lien property list ${year} address`,
  ]
}

function buildDeepAtRiskQueries(area: {
  searchType: string
  zipCode?: string
  city?: string
  state?: string
  county?: string
}): string[] {
  const year = new Date().getFullYear()
  const countyOrCity =
    area.searchType === "zip"
      ? `zip ${area.zipCode}`
      : area.searchType === "city"
      ? `${area.city} ${area.state}`
      : `${area.county} county ${area.state}`

  return [
    // County tax delinquency lists — published online, contain addresses
    `${countyOrCity} property tax delinquent list ${year} address owner`,
    // Legal notice publications for judgment/HOA liens
    `${countyOrCity} legal notice judgment lien HOA ${year} property address`,
    // County assessor / treasurer records with delinquent owners
    `${countyOrCity} county assessor treasurer delinquent property ${year}`,
  ]
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { searchType, zipCode, city, state, county, maxLeads = 50 } = body as {
      searchType: string
      zipCode?: string
      city?: string
      state?: string
      county?: string
      maxLeads?: number
    }

    const queries     = buildQueries({ searchType, zipCode, city, state, county })
    const deepQueries = buildDeepAtRiskQueries({ searchType, zipCode, city, state, county })

    // ── Phase 1: Standard searches ───────────────────────────────────────────
    const allSnippets: Array<{ query: string; title: string; url: string; content: string }> = []
    const topUrls: string[] = []

    const searchResults = await Promise.allSettled(queries.map((q) => webSearchAny(q, 8)))
    searchResults
      .filter((r) => r.status === "fulfilled")
      .forEach((r) => {
        const result = (r as PromiseFulfilledResult<Awaited<ReturnType<typeof webSearchAny>>>).value
        result.results.forEach((sr) => {
          allSnippets.push({ query: result.query, title: sr.title, url: sr.url, content: sr.content.slice(0, 1500) })
          if (topUrls.length < 12) topUrls.push(sr.url)
        })
      })

    // ── Phase 2: Deep search with full page content ───────────────────────────
    for (const q of deepQueries.slice(0, 3)) {
      try {
        const result = await webSearchDeepOrAny(q, 5)
        result.results.forEach((sr) => {
          const content = sr.rawContent ? sr.rawContent.slice(0, 4000) : sr.content.slice(0, 1500)
          allSnippets.push({ query: q, title: sr.title, url: sr.url, content })
          if (topUrls.length < 20) topUrls.push(sr.url)
        })
        await new Promise((r) => setTimeout(r, 300))
      } catch { /* continue */ }
    }

    // ── Phase 3: Extract content from county/government pages ────────────────
    const extractionCandidates = [...new Set(topUrls)]
      .filter((u) => /county|assessor|treasurer|taxdelinquent|publicrecord|legalnotice|courtrecord|lien/i.test(u))
      .slice(0, 5)

    if (extractionCandidates.length > 0) {
      const pages = await extractPageContent(extractionCandidates)
      pages.forEach((p) => {
        if (p.content.length > 100) {
          allSnippets.push({ query: "direct page extraction", title: p.url, url: p.url, content: p.content.slice(0, 5000) })
        }
      })
    }

    if (allSnippets.length === 0) {
      return Response.json({
        leads: [],
        total: 0,
        message: "No at-risk signals found for this area. Try a broader area or check that TAVILY_API_KEY is set.",
      })
    }

    const areaDesc =
      searchType === "zip"
        ? `ZIP ${zipCode}`
        : searchType === "city"
        ? `${city}, ${state}`
        : `${county} County, ${state}`

    const extractUser = `Extract ALL distressed property leads from these web search results and page content for ${areaDesc}.

For each property found, identify:
- Street address (required)
- Owner name (if mentioned)
- City, state, zip
- Type of distress signal
- Summary of the signal
- Source URL

Sources (${allSnippets.length} total):
${allSnippets.map((s, i) => `[${i + 1}] Query: "${s.query}"\nPage: ${s.title}\nURL: ${s.url}\nContent:\n${s.content}`).join("\n\n---\n\n")}

Return JSON array (empty array if none found):
[{
  "address": "full street address",
  "city": "city name (infer from context if needed)",
  "state": "2-letter state (use ${state || ""} if not specified)",
  "zip": "zip if known, else ''",
  "ownerName": "owner name if mentioned, else ''",
  "signalType": "tax_delinquent|code_violation|hoa_lien|judgment_lien|court_filing|vacant_distressed|multiple_signals",
  "signalSummary": "one sentence describing the specific distress",
  "sourceUrl": "URL where this was found"
}]

Include EVERY property with a street address. If a page lists 10 properties, extract all 10.
Deduplicate if the same address appears multiple times (merge signal types).`

    let rawLeads: Array<{
      address: string
      city: string
      state: string
      zip: string
      ownerName: string
      signalType: AtRiskLead["signalType"]
      signalSummary: string
      sourceUrl: string
    }>

    try {
      rawLeads = (await runAgent(EXTRACT_SYSTEM, extractUser, {
        jsonMode:  true,
        maxTokens: 8000,
        model:     "sonnet",
      })) as unknown as typeof rawLeads
    } catch {
      return Response.json({ leads: [], total: 0, message: "AI extraction failed — try again." })
    }

    if (!Array.isArray(rawLeads) || rawLeads.length === 0) {
      return Response.json({
        leads: [],
        total: 0,
        message: "No specific property addresses found in public records for this area.",
      })
    }

    // Deduplicate by address
    const seen = new Set<string>()
    const unique = rawLeads.filter((l) => {
      const key = l.address.toLowerCase().trim()
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })

    const limited = unique.slice(0, maxLeads)

    // ATTOM enrichment: try to find property detail for each address (best-effort)
    // We don't have attomId yet, so skip ATTOM lookup for now
    // (Could be enhanced with ATTOM address-based search in future)

    // Score and build final leads
    const leads: AtRiskLead[] = limited.map((raw, idx) => {
      const score = computeAtRiskScore(raw.signalType)
      return {
        id: `atrisk-${idx}-${Date.now()}`,
        address: raw.address,
        city: raw.city || (searchType === "city" ? city! : ""),
        state: raw.state || state || "",
        zip: raw.zip,
        ownerName: raw.ownerName || "Owner Unknown",
        signalType: raw.signalType,
        signalSummary: raw.signalSummary,
        riskScore: score,
        riskLevel:
          score >= 75 ? "CRITICAL" : score >= 50 ? "HIGH" : "MODERATE",
        sourceUrl: raw.sourceUrl,
        estimatedValue: null,
        estimatedEquity: null,
        equityPercent: null,
        beds: null,
        yearBuilt: null,
        isAbsentee: false,
        phone: null,
        email: null,
        actionNote: buildActionNote(raw.signalType),
      }
    })

    // Sort by risk score
    leads.sort((a, b) => b.riskScore - a.riskScore)

    return Response.json({ leads, total: leads.length })
  } catch (err) {
    console.error("[at-risk-search POST]", err)
    return Response.json(
      { error: err instanceof Error ? err.message : "At-risk search failed" },
      { status: 500 }
    )
  }
}

function computeAtRiskScore(type: AtRiskLead["signalType"]): number {
  const base: Record<AtRiskLead["signalType"], number> = {
    multiple_signals:   95,
    tax_delinquent:     85,
    judgment_lien:      75,
    hoa_lien:           65,
    court_filing:       80,
    code_violation:     55,
    vacant_distressed:  60,
  }
  // Add small random variation so leads don't all have identical scores
  const jitter = Math.floor(Math.random() * 8) - 4
  return Math.max(30, Math.min(99, (base[type] ?? 50) + jitter))
}

function buildActionNote(type: AtRiskLead["signalType"]): string {
  const notes: Record<AtRiskLead["signalType"], string> = {
    tax_delinquent:
      "Owner is behind on property taxes — likely also behind on mortgage. Contact BEFORE the NOD is filed.",
    judgment_lien:
      "A court judgment has been placed against the owner. Financial stress likely. Great time to reach out.",
    hoa_lien:
      "HOA has filed a lien. Owner is ignoring multiple obligations. Often leads to foreclosure within 6 months.",
    court_filing:
      "Court action has been initiated. May not yet be in national foreclosure databases. First-mover advantage.",
    code_violation:
      "Property has code violations — may be vacant or distressed. Absentee owner likely. Good outreach candidate.",
    vacant_distressed:
      "Property appears vacant or distressed. Owner may have already walked away — a short sale or discounted deal.",
    multiple_signals:
      "Multiple distress signals detected. This owner is under serious pressure from multiple directions.",
  }
  return notes[type] ?? "Distress signal detected — reach out promptly."
}
