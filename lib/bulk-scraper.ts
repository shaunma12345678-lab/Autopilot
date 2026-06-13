// Bulk pre-foreclosure scraper — runs many ZIP-based searches in parallel
// to reach 100-300 real leads per scan session.
//
// Architecture:
//   1. Divide target ZIPs into batches of ZIP_BATCH_SIZE
//   2. Per batch: fire all search queries simultaneously (pure I/O, no serialization)
//   3. Combine all snippets → one AI extraction call (efficient token use)
//   4. Deduplicate by address+signalType across all batches
//   5. Stop when deadline reached or maxRaw signals collected

import { webSearchSnippets, EXTRACTOR_SYSTEM, type RawSignalInput } from "@/lib/scrapers/base"
import { runAgent } from "@/lib/claude"

const COUNTY_DISPLAY: Record<string, string> = {
  "san-diego":      "San Diego",
  "riverside":      "Riverside",
  "san-bernardino": "San Bernardino",
  "orange":         "Orange",
}

// 2 targeted queries per ZIP — enough diversity, tight on token budget
function zipQueries(zip: string, countyName: string): string[] {
  const yr = new Date().getFullYear()
  return [
    `"notice of default" OR "lis pendens" ${zip} "${countyName} County" California ${yr}`,
    `pre-foreclosure property ${zip} California county recorder ${yr}`,
  ]
}

// Run one batch of ZIPs: all searches fire in parallel, one AI call to extract
async function processZipBatch(
  zips:        string[],
  countyName:  string,
  countyId:    string,
  deadlineMs:  number
): Promise<RawSignalInput[]> {
  if (Date.now() >= deadlineMs) return []

  const queries = zips.flatMap(z => zipQueries(z, countyName))

  // All searches fire simultaneously — limited only by network latency
  const searchResults = await Promise.allSettled(
    queries.map(q => webSearchSnippets(q).catch(() => [] as string[]))
  )

  const allSnippets: string[] = []
  for (const r of searchResults) {
    if (r.status === "fulfilled") allSnippets.push(...r.value)
  }
  if (allSnippets.length === 0) return []

  // One AI call extracts from all combined snippets
  const content = allSnippets.join("\n---\n").slice(0, 12000)
  const zipsStr  = zips.join(", ")

  try {
    const raw = await runAgent(
      EXTRACTOR_SYSTEM,
      `Extract EVERY pre-foreclosure property from the search results below.
ZIP codes covered: ${zipsStr} — ${countyName} County, CA.

SEARCH RESULTS:
${content}

Return a JSON array only (no markdown fences). Each item:
{
  "address": "full street address with city and state",
  "signalType": "one of: nod|lis_pendens|notice_of_sale|tax_delinquent|pre_foreclosure|auction",
  "signalDate": "YYYY-MM-DD (use today if unknown: ${new Date().toISOString().split("T")[0]})",
  "rawData": {
    "ownerName": "owner if found, else null",
    "amount":    "dollar amount if found, else null",
    "lender":    "lender name if found, else null",
    "notes":     "brief note"
  }
}

Rules:
- Only include properties with a real, recognizable US street address.
- Include EVERY property you can find — do not filter or limit.
- signalDate must be a valid ISO date string.
- Return [] if no valid properties found.`,
      { maxTokens: 3000 }
    )

    const rawStr    = typeof raw === "string" ? raw : JSON.stringify(raw)
    const jsonMatch = rawStr.match(/\[[\s\S]*\]/)
    if (!jsonMatch) return []

    const parsed: Array<{
      address?:    string
      signalType?: string
      signalDate?: string
      rawData?:    Record<string, unknown>
    }> = JSON.parse(jsonMatch[0])

    const today = new Date().toISOString().split("T")[0]
    return parsed
      .filter(s => s.address && s.signalType)
      .map(s => ({
        address:    s.address!.trim(),
        county:     countyName,
        signalType: s.signalType!,
        signalDate: s.signalDate ?? today,
        rawData:    s.rawData ?? {},
        source:     `bulk-scan-${countyId}`,
      }))
  } catch {
    return []
  }
}

// Main export — scans ZIP list in batches until deadline or maxRaw reached
export async function bulkScan(
  countyId:  string,
  zips:      string[],
  maxRaw:    number,
  deadlineMs: number
): Promise<RawSignalInput[]> {
  const countyName = COUNTY_DISPLAY[countyId] ?? countyId
  const ZIP_BATCH  = 5  // 5 ZIPs × 2 queries = 10 parallel searches per batch
  const results:   RawSignalInput[] = []
  const seen = new Set<string>()

  for (let i = 0; i < zips.length; i += ZIP_BATCH) {
    if (Date.now() >= deadlineMs)       break
    if (results.length >= maxRaw)        break

    const batch   = zips.slice(i, i + ZIP_BATCH)
    const signals = await processZipBatch(batch, countyName, countyId, deadlineMs)

    for (const s of signals) {
      const key = `${s.address.toLowerCase()}|${s.signalType}`
      if (!seen.has(key)) {
        seen.add(key)
        results.push(s)
      }
    }
  }

  return results
}
