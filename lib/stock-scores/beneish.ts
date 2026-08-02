// Beneish M-Score — Beneish (1999), an earnings-manipulation detection model.
// Famously flags Enron retrospectively; almost no retail tool surfaces it.
//
// M = -4.84 + 0.920·DSRI + 0.528·GMI + 0.404·AQI + 0.892·SGI
//     + 0.115·DEPI - 0.172·SGAI + 4.679·TATA - 0.327·LVGI
//
// M > -1.78 is the conventional threshold suggesting a company's financials
// share characteristics with known manipulators.
//
// Critical framing, carried through to the UI: this detects statistical
// RESEMBLANCE to manipulator financials. It is not evidence of fraud, and false
// positives are common for fast-growing companies (high SGI alone pushes M up).
// It should read as "worth a closer look at the filings," never as an accusation.
import type { FundamentalSeries } from "../edgar-normalize"
import { seriesAt as at } from "../edgar-normalize"

export interface BeneishResult {
  mScore: number | null
  flagged: boolean | null
  components: Record<string, number | null>
  interpretation: string
}

function ratio(numerator: number | null, denominator: number | null): number | null {
  if (numerator === null || denominator === null || denominator === 0) return null
  const r = numerator / denominator
  return isFinite(r) ? r : null
}

// Index of a ratio across two periods, clamped to keep one malformed filing
// from blowing out the composite (the model is sensitive to extreme indices).
function index(current: number | null, prior: number | null, lo = 0.1, hi = 5): number | null {
  if (current === null || prior === null || prior === 0) return null
  const idx = current / prior
  if (!isFinite(idx)) return null
  return Math.max(lo, Math.min(hi, idx))
}

export function computeBeneishM(s: FundamentalSeries): BeneishResult {
  const revNow = at(s.revenue, 0), revPrior = at(s.revenue, 1)
  const recNow = at(s.receivables, 0), recPrior = at(s.receivables, 1)
  const assetsNow = at(s.totalAssets, 0), assetsPrior = at(s.totalAssets, 1)
  const caNow = at(s.currentAssets, 0), caPrior = at(s.currentAssets, 1)
  const ppeNow = at(s.ppeNet, 0), ppePrior = at(s.ppeNet, 1)
  const deprNow = at(s.depreciation, 0), deprPrior = at(s.depreciation, 1)
  const sgaNow = at(s.sga, 0), sgaPrior = at(s.sga, 1)
  const niNow = at(s.netIncome, 0)
  const cfoNow = at(s.cfo, 0)
  const clNow = at(s.currentLiabilities, 0), clPrior = at(s.currentLiabilities, 1)
  const ltdNow = at(s.longTermDebt, 0), ltdPrior = at(s.longTermDebt, 1)
  const grossNow = at(s.grossProfit, 0), grossPrior = at(s.grossProfit, 1)

  // DSRI — days sales in receivables index (receivables growing faster than sales)
  const dsri = index(ratio(recNow, revNow), ratio(recPrior, revPrior))

  // GMI — gross margin index (deteriorating margin, so prior/current)
  const gmNow = ratio(grossNow, revNow)
  const gmPrior = ratio(grossPrior, revPrior)
  const gmi = index(gmPrior, gmNow)

  // AQI — asset quality index (share of assets that are neither current nor PPE)
  const aqNow = assetsNow !== null && caNow !== null && ppeNow !== null && assetsNow !== 0
    ? 1 - (caNow + ppeNow) / assetsNow : null
  const aqPrior = assetsPrior !== null && caPrior !== null && ppePrior !== null && assetsPrior !== 0
    ? 1 - (caPrior + ppePrior) / assetsPrior : null
  const aqi = index(aqNow, aqPrior)

  // SGI — sales growth index
  const sgi = index(revNow, revPrior)

  // DEPI — depreciation rate index (slowing depreciation, so prior/current)
  const deprRateNow = deprNow !== null && ppeNow !== null && deprNow + ppeNow !== 0 ? deprNow / (deprNow + ppeNow) : null
  const deprRatePrior = deprPrior !== null && ppePrior !== null && deprPrior + ppePrior !== 0 ? deprPrior / (deprPrior + ppePrior) : null
  const depi = index(deprRatePrior, deprRateNow)

  // SGAI — SG&A index
  const sgai = index(ratio(sgaNow, revNow), ratio(sgaPrior, revPrior))

  // TATA — total accruals to total assets
  const tata = niNow !== null && cfoNow !== null && assetsNow !== null && assetsNow !== 0
    ? (niNow - cfoNow) / assetsNow : null

  // LVGI — leverage index
  const levNow = assetsNow !== null && assetsNow !== 0 ? ((clNow ?? 0) + (ltdNow ?? 0)) / assetsNow : null
  const levPrior = assetsPrior !== null && assetsPrior !== 0 ? ((clPrior ?? 0) + (ltdPrior ?? 0)) / assetsPrior : null
  const lvgi = index(levNow, levPrior)

  const components = { dsri, gmi, aqi, sgi, depi, sgai, tata, lvgi }

  // The four highest-weighted terms (TATA 4.679, DSRI 0.920, SGI 0.892, GMI 0.528)
  // are required; the rest fall back to the model's neutral value of 1.0.
  if (dsri === null || sgi === null || tata === null || gmi === null) {
    return {
      mScore: null, flagged: null, components,
      interpretation: "Not enough two-year filing detail to compute a reliable M-Score.",
    }
  }

  const mScore =
    -4.84 +
    0.920 * dsri +
    0.528 * gmi +
    0.404 * (aqi ?? 1) +
    0.892 * sgi +
    0.115 * (depi ?? 1) -
    0.172 * (sgai ?? 1) +
    4.679 * tata -
    0.327 * (lvgi ?? 1)

  const flagged = mScore > -1.78

  const interpretation = flagged
    ? `M-Score ${mScore.toFixed(2)} (above the -1.78 threshold) — this company's financials statistically resemble those of firms that have manipulated earnings. This is a prompt to read the filings closely, not evidence of wrongdoing; fast-growing companies frequently trigger it.`
    : `M-Score ${mScore.toFixed(2)} — below the -1.78 threshold, no statistical resemblance to manipulator financials.`

  return { mScore, flagged, components, interpretation }
}
