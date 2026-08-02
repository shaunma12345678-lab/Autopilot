// 1031 exchange replacement-property matching — purely internal logic, no
// external data source. A seller doing a 1031 exchange has a hard 45-day
// identification deadline and 180-day closing deadline (IRS rule, not
// something we invented); matching existing distress-lead inventory against
// that deadline surfaces a genuinely time-sensitive, underserved lead type.
import { prisma } from "@/lib/prisma"

export const IDENTIFICATION_WINDOW_DAYS = 45
export const CLOSING_WINDOW_DAYS = 180

export interface ExchangeMatch {
  leadId: string
  address: string
  assetClass: string
  score: number
  estimatedValue: number | null
  fitScore: number
  fitReasons: string[]
}

interface LeadRow {
  id: string
  name: string
  source: string
  assetClass: string
  score: number
  estimatedValue: number | null
  status: string
}

export async function findExchangeMatches(params: {
  businessId: string
  targetPriceMin: number | null
  targetPriceMax: number | null
  targetPropertyType: string // residential | commercial | any
  targetCounties: string[]
  limit?: number
}): Promise<ExchangeMatch[]> {
  const where: Record<string, unknown> = { businessId: params.businessId }
  if (params.targetPropertyType !== "any") where.assetClass = params.targetPropertyType

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const leads = await (prisma.lead as any).findMany({
    where,
    orderBy: { score: "desc" },
    take: 500, // score against a generous pool, rank down to the requested limit
  }) as LeadRow[]

  const matches: ExchangeMatch[] = leads.map(lead => {
    let fitScore = 0
    const fitReasons: string[] = []

    if (lead.estimatedValue !== null && (params.targetPriceMin !== null || params.targetPriceMax !== null)) {
      const inRange = (params.targetPriceMin === null || lead.estimatedValue >= params.targetPriceMin) &&
                       (params.targetPriceMax === null || lead.estimatedValue <= params.targetPriceMax)
      if (inRange) { fitScore += 40; fitReasons.push("Price fits your target range") }
      else { fitScore += 0; fitReasons.push("Price is outside your target range") }
    } else {
      fitScore += 15 // no price data either way — neutral, not penalized for a data gap
    }

    if (params.targetCounties.length === 0) {
      fitScore += 15
    } else {
      const matchesCounty = params.targetCounties.some(c => lead.source.toLowerCase().includes(c.toLowerCase()))
      if (matchesCounty) { fitScore += 25; fitReasons.push("In a target county") }
    }

    fitScore += Math.round((lead.score / 100) * 25) // underlying distress-lead quality
    if (lead.score >= 70) fitReasons.push("High-quality distressed lead")

    return {
      leadId: lead.id, address: lead.name, assetClass: lead.assetClass,
      score: lead.score, estimatedValue: lead.estimatedValue,
      fitScore: Math.min(fitScore, 100), fitReasons,
    }
  })

  return matches
    .sort((a, b) => b.fitScore - a.fitScore)
    .slice(0, params.limit ?? 25)
}

export function computeDeadlines(saleClosingDate: Date): { identificationDeadline: Date; closingDeadline: Date } {
  const identificationDeadline = new Date(saleClosingDate.getTime() + IDENTIFICATION_WINDOW_DAYS * 86400000)
  const closingDeadline = new Date(saleClosingDate.getTime() + CLOSING_WINDOW_DAYS * 86400000)
  return { identificationDeadline, closingDeadline }
}
