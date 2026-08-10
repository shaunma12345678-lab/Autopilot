// Federal litigation exposure — read the same way EDGAR filings are: a
// primary record, not press coverage or a summary of one.
//
// WHY THIS SOURCE. Securities class actions, patent suits, and material
// contract disputes get filed in federal court, often well before they force
// an 8-K disclosure or reach analyst coverage. CourtListener's RECAP archive
// is the largest free index of federal docket data anywhere — verified live
// against courtlistener.com/api/rest/v4/search/ during development, no
// PACER account or per-page fee required.
//
// CLASSIFICATION IS DETERMINISTIC. What kind of suit this is gets decided by
// regex over `suitNature`/`cause` text, the same rules-over-a-bounded-
// vocabulary approach lib/narrative-extract.ts already uses for filing
// prose — never a model guessing at legal significance from a case caption.
//
// RATE BUDGET IS REAL, NOT DECORATIVE. CourtListener's documented
// authenticated-tier limit is 125 requests/day. This is called only from the
// deep-research path (same gate as governance/narrative reading), and every
// call increments an in-process daily counter so a burst within one process
// can't silently exhaust the day's quota — it cannot coordinate across
// serverless instances, so it is a soft safety margin, not a hard guarantee.
//
// WHAT THIS IS NOT. A free-text company-name search returns loosely related
// noise (subsidiaries, unrelated parties who share a word), so every hit is
// filtered to require the company's own name in the case caption and a
// filing date within the last 18 months. This surfaces a raw docket entry
// for a human to read, not a verdict — a company being SUED says nothing
// about who is right.
const COURTLISTENER_SEARCH = "https://www.courtlistener.com/api/rest/v4/search/"

const DAILY_BUDGET = 100 // headroom under the documented 125/day ceiling
let callsToday = 0
let budgetDate = new Date().toISOString().slice(0, 10)

function withinBudget(): boolean {
  const today = new Date().toISOString().slice(0, 10)
  if (today !== budgetDate) { budgetDate = today; callsToday = 0 }
  return callsToday < DAILY_BUDGET
}

export type LitigationCategory = "securities" | "patent" | "antitrust" | "contract" | "other"

export interface LitigationHit {
  caseName: string
  court: string
  dateFiled: string | null
  suitNature: string | null
  category: LitigationCategory
  docketUrl: string
}

export interface LitigationRead {
  hits: LitigationHit[]
  securitiesCount: number
  patentCount: number
  riskPenalty: number
  flags: string[]
}

function classify(suitNature: string, cause: string): LitigationCategory {
  const text = `${suitNature} ${cause}`.toLowerCase()
  if (/securities|10b-5|stockholder deriv|shareholder deriv/.test(text)) return "securities"
  if (/patent/.test(text)) return "patent"
  if (/antitrust|sherman act|clayton act/.test(text)) return "antitrust"
  if (/contract/.test(text)) return "contract"
  return "other"
}

export async function checkLitigation(companyName: string): Promise<LitigationRead | null> {
  const token = process.env.COURTLISTENER_API_TOKEN
  if (!token) return null // optional key, not configured — see .env.example
  if (!companyName || companyName.trim().length < 3) return null
  if (!withinBudget()) return null

  try {
    const url = new URL(COURTLISTENER_SEARCH)
    url.searchParams.set("q", companyName)
    url.searchParams.set("type", "r")

    callsToday++
    const res = await fetch(url.toString(), {
      headers: { Authorization: `Token ${token}`, Accept: "application/json" },
      signal: AbortSignal.timeout(20000),
    })
    if (!res.ok) return null

    const payload = await res.json() as { results?: Array<Record<string, unknown>> }
    const results = payload.results ?? []

    const cutoff = Date.now() - 18 * 30 * 86400000
    // First word of the legal name (e.g. "Tesla" out of "Tesla, Inc.") — the
    // needle a free-text search has to actually contain to count as a real
    // hit rather than an unrelated case that happened to match other terms.
    const nameNeedle = companyName.trim().toLowerCase().split(/[\s,]+/)[0]
    if (nameNeedle.length < 3) return null

    const hits: LitigationHit[] = []
    for (const r of results) {
      const caseName = String(r.caseName ?? r.case_name_full ?? "")
      if (!caseName.toLowerCase().includes(nameNeedle)) continue

      const dateFiled = typeof r.dateFiled === "string" ? r.dateFiled : null
      if (dateFiled && new Date(dateFiled).getTime() < cutoff) continue
      if (!dateFiled) continue // undated results can't be judged as recent

      const suitNature = typeof r.suitNature === "string" ? r.suitNature : ""
      const cause = typeof r.cause === "string" ? r.cause : ""
      const absoluteUrl = typeof r.docket_absolute_url === "string" ? r.docket_absolute_url : null

      hits.push({
        caseName,
        court: typeof r.court === "string" ? r.court : "",
        dateFiled,
        suitNature: suitNature || null,
        category: classify(suitNature, cause),
        docketUrl: absoluteUrl ? `https://www.courtlistener.com${absoluteUrl}` : "",
      })
      if (hits.length >= 10) break
    }

    const securitiesHits = hits.filter(h => h.category === "securities")
    const patentHits = hits.filter(h => h.category === "patent")

    const flags: string[] = []
    let riskPenalty = 0
    if (securitiesHits.length > 0) {
      // Modest by design: this is a raw docket match, not an adjudicated
      // finding, and a company can be sued without having done anything
      // wrong. The penalty reflects "worth reading the docket," not guilt.
      riskPenalty = Math.min(10 + securitiesHits.length * 5, 25)
      flags.push(`⚠ ${securitiesHits.length} securities-related federal case${securitiesHits.length > 1 ? "s" : ""} filed in the last 18 months — most recent: "${securitiesHits[0].caseName}" (${securitiesHits[0].court}, filed ${securitiesHits[0].dateFiled}). A filing is an allegation, not a finding.`)
    }
    if (patentHits.length > 0) {
      flags.push(`${patentHits.length} patent-related federal case${patentHits.length > 1 ? "s" : ""} filed in the last 18 months.`)
    }

    return { hits, securitiesCount: securitiesHits.length, patentCount: patentHits.length, riskPenalty, flags }
  } catch {
    return null
  }
}
