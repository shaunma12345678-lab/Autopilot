// Federal contract revenue — an independent record of money a company claims.
//
// WHY THIS IS DIFFERENT FROM EVERY OTHER SOURCE HERE. Everything else reads what
// a company says about itself: its filings, its narrative, its own audited
// numbers. Even the audited numbers are the company's own representation, signed
// off by an auditor the company pays.
//
// USAspending is the other side of the transaction. When the federal government
// pays a contractor, the government publishes what it paid, on its own schedule,
// from its own systems. For a defense or government-services company, that is a
// genuinely independent record of the same dollars the 10-K reports — two
// separate parties recording one transaction.
//
// Almost nobody reconciles them, because it requires matching a corporate legal
// name to a federal recipient name and understanding that neither side is wrong
// when they differ. But the reconciliation is exactly where the information is:
// a company describing government demand as strong while its actual obligations
// decline is a contradiction of the same class as narrative-versus-XBRL, only
// with a source the company does not control.
//
// HONEST SCOPE. This is meaningful only for companies with material federal
// business — defense, aerospace, government IT, healthcare services. For the
// overwhelming majority it returns nothing, and nothing is the correct answer
// rather than a red flag. It is never used to score a company down for having
// no federal business.
//
// WHAT THE NUMBERS ARE, AND WHAT THEY ARE NOT. USAspending's "Award Amount" is
// the LIFETIME value of a contract including option years, and "Total Outlays"
// is cumulative spend to date. Neither is period revenue. Verified directly:
// a Leidos query returned contracts running 2008-2024 and 2011-2026 inside a
// one-year window, because the filter matches contracts ACTIVE in the period,
// not awarded in it.
//
// So this deliberately does NOT compare against reported revenue. Dividing
// lifetime contract value by annual revenue produced 678% for Lockheed and
// 208% for Leidos — figures that look authoritative and mean nothing. What IS
// supportable is the SCALE of active federal contracting and the DIRECTION of
// change between comparable windows, both stated as what they are.
const USASPENDING = "https://api.usaspending.gov/api/v2/search/spending_by_award/"

export interface FederalRevenueRead {
  recipientName: string
  /** Lifetime value of contracts active in the last year — NOT annual revenue. */
  activeContractValueUsd: number
  priorPeriodValueUsd: number
  changePct: number | null
  awardCount: number
  material: boolean
  notes: string[]
}

// A company with less than this in active federal contracts is not meaningfully
// a government contractor, and the trend would be dominated by single awards.
const MATERIAL_CONTRACT_VALUE_USD = 500_000_000
// Award types A-D are definitive contracts (not grants, loans or direct payments),
// which is the category that maps to commercial revenue.
const CONTRACT_TYPES = ["A", "B", "C", "D"]

interface AwardRow { "Award Amount"?: number; "Recipient Name"?: string }

async function fetchAwards(name: string, start: string, end: string): Promise<AwardRow[]> {
  const res = await fetch(USASPENDING, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      filters: {
        award_type_codes: CONTRACT_TYPES,
        recipient_search_text: [name],
        time_period: [{ start_date: start, end_date: end }],
      },
      fields: ["Award Amount", "Recipient Name"],
      limit: 100,
    }),
    signal: AbortSignal.timeout(25000),
  })
  if (!res.ok) return []
  const data = await res.json() as { results?: AwardRow[] }
  return Array.isArray(data.results) ? data.results : []
}

// Corporate legal names carry suffixes the federal recipient registry does not,
// and searching "Lockheed Martin Corporation" matches less reliably than
// "Lockheed Martin". Stripping the entity suffix widens the match without
// making it vague.
function searchName(companyName: string): string {
  return companyName
    .replace(/\b(INC|CORP|CORPORATION|CO|COMPANY|LTD|LLC|PLC|HOLDINGS?|GROUP|THE)\b\.?/gi, " ")
    .replace(/[^A-Za-z0-9 &]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function yearsAgo(n: number): string {
  const d = new Date()
  d.setFullYear(d.getFullYear() - n)
  return d.toISOString().slice(0, 10)
}

export async function getFederalRevenue(
  companyName: string
): Promise<FederalRevenueRead | null> {
  const name = searchName(companyName)
  if (name.length < 4) return null

  try {
    const today = new Date().toISOString().slice(0, 10)
    const [current, prior] = await Promise.all([
      fetchAwards(name, yearsAgo(1), today),
      fetchAwards(name, yearsAgo(2), yearsAgo(1)),
    ])
    if (current.length === 0 && prior.length === 0) return null

    const sum = (rows: AwardRow[]) =>
      rows.reduce((s, r) => s + (typeof r["Award Amount"] === "number" ? r["Award Amount"] : 0), 0)

    const activeContractValueUsd = sum(current)
    const priorPeriodValueUsd = sum(prior)
    if (activeContractValueUsd === 0 && priorPeriodValueUsd === 0) return null

    const changePct = priorPeriodValueUsd > 0
      ? ((activeContractValueUsd - priorPeriodValueUsd) / priorPeriodValueUsd) * 100
      : null

    const material = activeContractValueUsd >= MATERIAL_CONTRACT_VALUE_USD

    const notes: string[] = []
    if (material) {
      notes.push(`Holds $${(activeContractValueUsd / 1e9).toFixed(1)}B of active federal contracts by lifetime award value across ${current.length} awards — recorded by the paying agency, not by the company. This is contract scale, not annual revenue.`)
    }
    if (material && changePct !== null && changePct <= -25) {
      notes.push(`⚠ Active federal contract value fell ${Math.abs(changePct).toFixed(0)}% versus the prior comparable window. Contract awards lead recognised revenue, and this is the counterparty's own record rather than the company's characterisation of demand.`)
    } else if (material && changePct !== null && changePct >= 30) {
      notes.push(`Active federal contract value rose ${changePct.toFixed(0)}% versus the prior comparable window, in the government's own records.`)
    }

    return {
      recipientName: current[0]?.["Recipient Name"] ?? prior[0]?.["Recipient Name"] ?? name,
      activeContractValueUsd, priorPeriodValueUsd, changePct,
      awardCount: current.length, material, notes,
    }
  } catch {
    return null
  }
}

// Reconciliation against the company's own narrative. Same logic as
// contradiction-check.ts, but the contradicting source is one the company has
// no ability to influence.
export function reconcileFederalRevenue(
  fed: FederalRevenueRead | null,
  revenueGrowthYoyPct: number | null
): { flags: string[]; riskPenalty: number } {
  if (!fed || !fed.material || fed.changePct === null) return { flags: [], riskPenalty: 0 }

  const flags = [...fed.notes]
  let riskPenalty = 0

  // Reported growth while the government's record of what it actually obligated
  // to this company is falling sharply. Both can be true — commercial segments
  // can offset, and obligations lead revenue recognition — but the divergence is
  // worth surfacing precisely because the company did not author one side of it.
  if (revenueGrowthYoyPct !== null && revenueGrowthYoyPct > 0 && fed.changePct <= -25) {
    flags.push(`⚠ Reported revenue grew ${revenueGrowthYoyPct.toFixed(1)}% while the value of its active federal contracts fell ${Math.abs(fed.changePct).toFixed(0)}% in the government's own records. Commercial segments may be offsetting it, and contract value is not revenue — but this is one side of the ledger the company does not write.`)
    riskPenalty = 8
  }

  return { flags, riskPenalty }
}
