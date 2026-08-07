// Crypto exposure inside equities — the cross-asset link, from filings.
//
// Spec 2 asks the system to reason about stocks and crypto together rather than
// as two products bolted side by side. The place they genuinely intersect is a
// balance sheet: a company holding bitcoin is an equity whose value is partly a
// crypto position, and an equity screen that ignores that is mispricing the
// business it thinks it is analysing.
//
// This became cleanly measurable only recently. ASU 2023-08 requires crypto
// assets to be carried at fair value and separately disclosed, so US GAAP now
// has a dedicated tag — CryptoAssetFairValue — and SEC's frames API returns
// every filer reporting it in a single request. Verified: 107 companies.
//
// WHY IT MATTERS MORE THAN IT LOOKS. When a company's crypto holdings approach
// or exceed its market capitalisation, the equity has stopped being a claim on
// an operating business and become a leveraged proxy for a token. Its
// fundamentals still compute — revenue, margins, F-Score — and every one of
// them is now describing a minority of what a buyer is actually purchasing.
// A screen reporting "sound business, cheap valuation" on that company is
// technically correct and practically misleading, which is the worst
// combination a screen can produce.
//
// Before this tag existed, holdings sat inside indefinite-lived intangibles
// alongside trademarks and licences, indistinguishable without reading the
// footnotes. That is why almost no equity tool accounts for it.
import { throttledFetch } from "./edgar-client"

const FRAMES = "https://data.sec.gov/api/xbrl/frames/us-gaap"
const CRYPTO_TAG = "CryptoAssetFairValue"

export interface CryptoHolder {
  cik: string
  entityName: string
  cryptoValueUsd: number
  endDate: string
}

export interface CryptoExposure {
  cryptoValueUsd: number
  marketCapUsd: number | null
  /** Crypto holdings as a share of market value. */
  exposurePct: number | null
  /** Above this the equity is materially a token proxy. */
  classification: "incidental" | "material" | "dominant" | "unknown"
  asOf: string
  notes: string[]
}

// Frames for a closed instantaneous period are immutable, so caching is
// correctness rather than convenience.
const holderCache = new Map<string, CryptoHolder[]>()

// Instant-measurement periods use the Q-with-I suffix. The most recent closed
// quarter is tried first, then progressively older ones — the newest quarter is
// frequently incomplete because filers report on different schedules.
function recentInstantPeriods(): string[] {
  const now = new Date()
  const out: string[] = []
  for (let back = 1; back <= 5; back++) {
    const d = new Date(now.getFullYear(), now.getMonth() - back * 3, 1)
    out.push(`CY${d.getFullYear()}Q${Math.floor(d.getMonth() / 3) + 1}I`)
  }
  return [...new Set(out)]
}

export async function getCryptoHolders(): Promise<CryptoHolder[]> {
  for (const period of recentInstantPeriods()) {
    const cached = holderCache.get(period)
    if (cached) return cached
    try {
      const res = await throttledFetch(`${FRAMES}/${CRYPTO_TAG}/USD/${period}.json`)
      if (!res.ok) continue
      const data = await res.json() as {
        data?: Array<{ cik?: number; entityName?: string; val?: number; end?: string }>
      }
      const holders = (data.data ?? [])
        .filter(d => typeof d.val === "number" && d.val > 0 && typeof d.cik === "number")
        .map(d => ({
          cik: String(d.cik).padStart(10, "0"),
          entityName: d.entityName ?? "",
          cryptoValueUsd: d.val as number,
          endDate: d.end ?? period,
        }))
      // A handful of filers is not the population; keep looking back.
      if (holders.length < 10) continue
      holderCache.set(period, holders)
      return holders
    } catch { /* try an older period */ }
  }
  return []
}

// Above 10% the position is large enough to move the equity independently of
// operations; above 60% the operating business is the minority of the asset.
const MATERIAL_PCT = 10
const DOMINANT_PCT = 60

export async function getCryptoExposure(
  cik: string,
  marketCapUsd: number | null
): Promise<CryptoExposure | null> {
  const holders = await getCryptoHolders()
  if (holders.length === 0) return null

  const padded = cik.padStart(10, "0")
  const match = holders.find(h => h.cik === padded)
  if (!match) return null

  const exposurePct = marketCapUsd && marketCapUsd > 0
    ? (match.cryptoValueUsd / marketCapUsd) * 100
    : null

  const classification: CryptoExposure["classification"] =
    exposurePct === null ? "unknown"
    : exposurePct >= DOMINANT_PCT ? "dominant"
    : exposurePct >= MATERIAL_PCT ? "material"
    : "incidental"

  const notes: string[] = []
  notes.push(`Holds $${(match.cryptoValueUsd / 1e6).toFixed(0)}M of crypto assets at fair value as of ${match.endDate}, separately disclosed under ASU 2023-08.`)

  if (classification === "dominant" && exposurePct !== null) {
    notes.push(`⚠ Crypto holdings equal about ${exposurePct.toFixed(0)}% of market value. This equity is substantially a leveraged proxy for a token rather than a claim on an operating business — its revenue, margins and F-Score all describe a minority of what a buyer is actually purchasing.`)
  } else if (classification === "material" && exposurePct !== null) {
    notes.push(`Crypto holdings equal about ${exposurePct.toFixed(0)}% of market value, large enough to move the share price independently of how the business performs.`)
  }

  return {
    cryptoValueUsd: match.cryptoValueUsd, marketCapUsd, exposurePct,
    classification, asOf: match.endDate, notes,
  }
}

// A screen gate. A company whose value is mostly a token position should not be
// ranked on business fundamentals as though those fundamentals were the asset.
export function shouldExcludeFromEquityScreen(e: CryptoExposure | null): string | null {
  if (!e || e.classification !== "dominant") return null
  return `crypto holdings are ${e.exposurePct?.toFixed(0)}% of market value — the fundamentals describe a minority of the asset, so ranking it as an operating business would mislead`
}
