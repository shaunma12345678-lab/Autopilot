// Market-wide percentile ranking, straight from SEC's XBRL frames API.
//
// WHY THIS MATTERS MORE THAN IT SOUNDS. Every ratio this system computes is an
// absolute number, and an absolute number cannot answer the question that
// actually decides whether a company is worth owning: is this good, or is the
// whole industry like this? A 42% gross margin is excellent for a distributor
// and mediocre for a software company. Scoring it against a fixed threshold
// scores the industry, not the business.
//
// lib/sector-benchmarks.ts already attempts this, but it compares against peers
// in OUR OWN Ticker table. With a few hundred scored rows, most SIC buckets
// hold a handful of companies, and a percentile computed against six peers is
// noise wearing a number's clothing.
//
// SEC publishes the frames API: for any us-gaap concept and period, EVERY
// filer's reported value in one response. Verified live — 2,191 filers for
// Revenues in CY2025. That is the real population, not our sample of it, and it
// costs one request that is identical for every company we score.
//
// WHY IT IS CHEAP DESPITE THE SIZE. A frame for a closed period never changes,
// so it is fetched once and reused for every company in the run. The per-company
// marginal cost is a binary search over a sorted array.
import { throttledFetch } from "./edgar-client"

const FRAMES = "https://data.sec.gov/api/xbrl/frames/us-gaap"

interface FrameEntry { cik: number; val: number }

// Frames for a closed period are immutable, so this cache is correct rather
// than merely convenient. Keyed by concept+unit+period.
const frameCache = new Map<string, number[] | null>()

// Sorted values for a concept across every filer that reported it.
async function getFrame(concept: string, period: string, unit = "USD"): Promise<number[] | null> {
  const key = `${concept}/${unit}/${period}`
  const cached = frameCache.get(key)
  if (cached !== undefined) return cached

  try {
    // throttledFetch already applies the SEC User-Agent and the 120ms request
    // floor, so headers must not be passed again here.
    const res = await throttledFetch(`${FRAMES}/${concept}/${unit}/${period}.json`)
    if (!res.ok) { frameCache.set(key, null); return null }

    const data = await res.json() as { data?: FrameEntry[] }
    const values = (data.data ?? [])
      .map(d => d.val)
      .filter(v => typeof v === "number" && isFinite(v))
      .sort((a, b) => a - b)

    // A frame with few reporters is not a market distribution.
    const result = values.length >= 100 ? values : null
    frameCache.set(key, result)
    return result
  } catch {
    frameCache.set(key, null)
    return null
  }
}

// Percentile of `value` within a sorted array, 0-100.
function percentileIn(sorted: number[], value: number): number {
  let lo = 0, hi = sorted.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (sorted[mid] < value) lo = mid + 1
    else hi = mid
  }
  return (lo / sorted.length) * 100
}

export interface MarketPercentile {
  concept: string
  value: number
  percentile: number
  peerCount: number
  label: string
}

export interface MarketContext {
  percentiles: MarketPercentile[]
  reasons: string[]
}

// Concepts worth ranking market-wide. Deliberately absolute-dollar concepts
// only: RATIOS are not published as frames, and comparing a company's revenue
// against every filer answers "how big is this relative to the market", which
// is the scale question. Margin-style comparisons stay with sector benchmarks,
// where the peer set is the right denominator.
const RANKED: Array<{ concept: string; label: string; unit?: string }> = [
  { concept: "Revenues", label: "revenue" },
  { concept: "NetIncomeLoss", label: "net income" },
  { concept: "Assets", label: "total assets" },
  { concept: "NetCashProvidedByUsedInOperatingActivities", label: "operating cash flow" },
  { concept: "ResearchAndDevelopmentExpense", label: "R&D spend" },
  // Leverage side — same absolute-dollar-only rule applies. Liabilities and
  // StockholdersEquity are the two halves debtToEquity is already computed
  // from (see lib/edgar-normalize.ts); ranking each against every SEC filer
  // separately from the ratio shows whether it's a large balance sheet
  // carrying proportionate debt or a large balance sheet carrying a
  // disproportionate share of it.
  { concept: "Liabilities", label: "total liabilities" },
  { concept: "LongTermDebtNoncurrent", label: "long-term debt" },
  { concept: "StockholdersEquity", label: "stockholders' equity" },
]

// The most recent period with complete frame coverage. SEC publishes a frame
// once enough filers have reported, so the current year is usually incomplete.
function recentPeriods(): string[] {
  const y = new Date().getFullYear()
  return [`CY${y - 1}`, `CY${y - 2}`]
}

export async function getMarketContext(values: {
  revenueTtm?: number | null
  netIncome?: number | null
  totalAssets?: number | null
  operatingCashFlow?: number | null
  rndExpense?: number | null
  totalLiabilities?: number | null
  longTermDebt?: number | null
  stockholdersEquity?: number | null
}): Promise<MarketContext> {
  const lookup: Record<string, number | null | undefined> = {
    Revenues: values.revenueTtm,
    NetIncomeLoss: values.netIncome,
    Assets: values.totalAssets,
    NetCashProvidedByUsedInOperatingActivities: values.operatingCashFlow,
    ResearchAndDevelopmentExpense: values.rndExpense,
    Liabilities: values.totalLiabilities,
    LongTermDebtNoncurrent: values.longTermDebt,
    StockholdersEquity: values.stockholdersEquity,
  }

  const percentiles: MarketPercentile[] = []
  const periods = recentPeriods()

  for (const { concept, label } of RANKED) {
    const value = lookup[concept]
    if (value === null || value === undefined || !isFinite(value)) continue

    let frame: number[] | null = null
    for (const period of periods) {
      frame = await getFrame(concept, period)
      if (frame) break
    }
    if (!frame) continue

    percentiles.push({
      concept, value,
      percentile: percentileIn(frame, value),
      peerCount: frame.length,
      label,
    })
  }

  const reasons: string[] = []
  const rev = percentiles.find(p => p.concept === "Revenues")
  if (rev) {
    reasons.push(`Revenue ranks in the ${rev.percentile.toFixed(0)}th percentile of all ${rev.peerCount.toLocaleString()} SEC filers reporting it — this is the real market distribution, not a sample of it.`)
  }

  const rnd = percentiles.find(p => p.concept === "ResearchAndDevelopmentExpense")
  if (rnd && rev) {
    // R&D far above or below a company's revenue rank is informative in both
    // directions: outspending its size can mean a real technology push, and
    // underspending it can mean harvesting a position rather than defending it.
    const gap = rnd.percentile - rev.percentile
    if (gap > 15) {
      reasons.push(`Spends more on R&D than its size would suggest — ${rnd.percentile.toFixed(0)}th percentile on R&D against ${rev.percentile.toFixed(0)}th on revenue.`)
    } else if (gap < -15) {
      reasons.push(`Spends less on R&D than its size would suggest — ${rnd.percentile.toFixed(0)}th percentile on R&D against ${rev.percentile.toFixed(0)}th on revenue, which can mean harvesting a position rather than defending it.`)
    }
  }

  const ni = percentiles.find(p => p.concept === "NetIncomeLoss")
  if (ni && rev && ni.percentile - rev.percentile > 15) {
    reasons.push(`Earns more than its revenue rank implies — ${ni.percentile.toFixed(0)}th percentile on net income against ${rev.percentile.toFixed(0)}th on revenue, which is what structurally better economics looks like.`)
  }

  // Leverage relative to size: a company can rank modestly on assets and still
  // carry a liabilities load near the top of the whole market, which the
  // debtToEquity ratio alone doesn't show — it's silent on whether the SCALE
  // of debt is itself unusual.
  const liab = percentiles.find(p => p.concept === "Liabilities")
  const assets = percentiles.find(p => p.concept === "Assets")
  if (liab && assets && liab.percentile - assets.percentile > 15) {
    reasons.push(`⚠ Carries more total liabilities than its asset base would suggest — ${liab.percentile.toFixed(0)}th percentile on liabilities against ${assets.percentile.toFixed(0)}th on assets, across every SEC filer reporting both.`)
  }
  const equity = percentiles.find(p => p.concept === "StockholdersEquity")
  if (liab && equity && liab.percentile - equity.percentile > 20) {
    reasons.push(`⚠ Liabilities rank well above stockholders' equity across the whole market — ${liab.percentile.toFixed(0)}th percentile on liabilities against ${equity.percentile.toFixed(0)}th on equity, a market-wide leverage comparison the debt-to-equity ratio alone doesn't show.`)
  }

  return { percentiles, reasons }
}
