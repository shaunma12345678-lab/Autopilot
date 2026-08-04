// Altman Z-Score — Altman (1968), the standard bankruptcy-distress predictor.
//
// Z = 1.2·X1 + 1.4·X2 + 3.3·X3 + 0.6·X4 + 1.0·X5
//   X1 = working capital / total assets
//   X2 = retained earnings / total assets
//   X3 = EBIT / total assets
//   X4 = market value of equity / total liabilities
//   X5 = revenue / total assets
//
// Zones (original public-manufacturer calibration): >2.99 safe, 1.81–2.99 grey,
// <1.81 distress. Known limitation, surfaced rather than hidden: the original
// coefficients were fit on public manufacturers, so the score reads low for
// asset-light software and is not meaningful for banks/insurers whose balance
// sheets don't have comparable working capital.
import type { FundamentalSeries } from "../edgar-normalize"
import { seriesAt as at } from "../edgar-normalize"

export interface AltmanResult {
  zScore: number | null
  zone: "safe" | "grey" | "distress" | null
  components: { x1: number | null; x2: number | null; x3: number | null; x4: number | null; x5: number | null }
  interpretation: string
}

// Financial-sector SIC ranges where the model doesn't apply.
export function isAltmanApplicable(sicCode: string | null): boolean {
  if (!sicCode) return true
  const sic = Number(sicCode)
  if (!isFinite(sic)) return true
  return !(sic >= 6000 && sic <= 6799)
}

export function computeAltmanZ(s: FundamentalSeries, marketCapUsd: number | null, sicCode: string | null = null): AltmanResult {
  const empty = { x1: null, x2: null, x3: null, x4: null, x5: null }

  if (!isAltmanApplicable(sicCode)) {
    return {
      zScore: null, zone: null, components: empty,
      interpretation: "Altman Z-Score isn't meaningful for financial-sector companies — their balance sheets aren't comparable to the model's calibration.",
    }
  }

  const totalAssets = at(s.totalAssets, 0)
  if (totalAssets === null || totalAssets === 0) {
    return { zScore: null, zone: null, components: empty, interpretation: "Total assets not reported — Z-Score cannot be computed." }
  }

  const currentAssets = at(s.currentAssets, 0)
  const currentLiabilities = at(s.currentLiabilities, 0)
  const retainedEarnings = at(s.retainedEarnings, 0)
  const operatingIncome = at(s.operatingIncome, 0)
  const equity = at(s.stockholdersEquity, 0)
  // Many filers never tag `Liabilities` directly. Assets − Equity is the
  // balance-sheet identity, not an estimate, so deriving it here recovers the
  // Z-Score for companies that would otherwise return N/A.
  const totalLiabilities = at(s.totalLiabilities, 0)
    ?? (equity !== null ? totalAssets - equity : null)
  const revenue = at(s.revenue, 0)

  const x1 = currentAssets !== null && currentLiabilities !== null ? (currentAssets - currentLiabilities) / totalAssets : null
  const x2 = retainedEarnings !== null ? retainedEarnings / totalAssets : null
  const x3 = operatingIncome !== null ? operatingIncome / totalAssets : null
  const x4 = marketCapUsd !== null && totalLiabilities !== null && totalLiabilities !== 0 ? marketCapUsd / totalLiabilities : null
  const x5 = revenue !== null ? revenue / totalAssets : null

  const components = { x1, x2, x3, x4, x5 }
  const present = [x1, x2, x3, x4, x5].filter(v => v !== null).length

  // X3 (EBIT/assets) and X4 (market equity/liabilities) carry the most weight —
  // without them the score is not trustworthy, so refuse rather than approximate.
  if (present < 4 || x3 === null || x4 === null) {
    return {
      zScore: null, zone: null, components,
      interpretation: `Missing inputs for a reliable Z-Score (${present}/5 components available).`,
    }
  }

  const zScore = 1.2 * (x1 ?? 0) + 1.4 * (x2 ?? 0) + 3.3 * x3 + 0.6 * x4 + 1.0 * (x5 ?? 0)
  const zone: AltmanResult["zone"] = zScore > 2.99 ? "safe" : zScore >= 1.81 ? "grey" : "distress"

  const interpretation = zone === "safe"
    ? `Z-Score ${zScore.toFixed(2)} — in Altman's "safe" zone, low modelled bankruptcy risk.`
    : zone === "grey"
    ? `Z-Score ${zScore.toFixed(2)} — Altman's "grey" zone, neither clearly safe nor clearly distressed.`
    : `Z-Score ${zScore.toFixed(2)} — Altman's "distress" zone, elevated modelled bankruptcy risk.`

  return { zScore, zone, components, interpretation }
}
