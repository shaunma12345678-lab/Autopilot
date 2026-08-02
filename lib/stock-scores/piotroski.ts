// Piotroski F-Score — Piotroski (2000), "Value Investing: The Use of Historical
// Financial Statement Information to Separate Winners from Losers."
//
// A 9-point binary checklist across profitability, leverage/liquidity, and
// operating efficiency. Documented outperformance is concentrated in high
// book-to-market (value) names — that caveat is surfaced in the interpretation
// rather than implying it predicts everything equally.
//
// Every input comes from SEC EDGAR annual filings. Any test whose inputs are
// missing is reported as `null` (not scored as a failure), and `maxPossible`
// drops accordingly — so a company with partial filing history isn't penalized
// for a data gap the way it would be for an actual failed test.
import type { FundamentalSeries } from "../edgar-normalize"
import { seriesAt as at, safeDiv } from "../edgar-normalize"

export interface PiotroskiTest {
  key: string
  label: string
  passed: boolean | null
}

export interface PiotroskiResult {
  score: number | null       // points earned
  maxPossible: number        // tests that could actually be evaluated
  normalized: number | null  // 0-9 scale, extrapolated when some tests are unavailable
  tests: PiotroskiTest[]
  interpretation: string
}

export function computePiotroski(s: FundamentalSeries): PiotroskiResult {
  const assetsNow = at(s.totalAssets, 0)
  const assetsPrior = at(s.totalAssets, 1)
  const niNow = at(s.netIncome, 0)
  const niPrior = at(s.netIncome, 1)
  const cfoNow = at(s.cfo, 0)
  const revNow = at(s.revenue, 0)
  const revPrior = at(s.revenue, 1)

  const roaNow = safeDiv(niNow, assetsNow)
  const roaPrior = safeDiv(niPrior, assetsPrior)
  const cfoToAssets = safeDiv(cfoNow, assetsNow)

  const ltdNow = at(s.longTermDebt, 0)
  const ltdPrior = at(s.longTermDebt, 1)
  const leverageNow = safeDiv(ltdNow, assetsNow)
  const leveragePrior = safeDiv(ltdPrior, assetsPrior)

  const currentRatioNow = safeDiv(at(s.currentAssets, 0), at(s.currentLiabilities, 0))
  const currentRatioPrior = safeDiv(at(s.currentAssets, 1), at(s.currentLiabilities, 1))

  const sharesNow = at(s.sharesOutstanding, 0)
  const sharesPrior = at(s.sharesOutstanding, 1)

  const grossProfitNow = at(s.grossProfit, 0)
  const grossProfitPrior = at(s.grossProfit, 1)
  const cogsNow = at(s.costOfRevenue, 0)
  const cogsPrior = at(s.costOfRevenue, 1)

  const grossMarginNow = grossProfitNow !== null
    ? safeDiv(grossProfitNow, revNow)
    : (cogsNow !== null && revNow !== null && revNow !== 0 ? (revNow - cogsNow) / revNow : null)
  const grossMarginPrior = grossProfitPrior !== null
    ? safeDiv(grossProfitPrior, revPrior)
    : (cogsPrior !== null && revPrior !== null && revPrior !== 0 ? (revPrior - cogsPrior) / revPrior : null)

  const assetTurnoverNow = safeDiv(revNow, assetsNow)
  const assetTurnoverPrior = safeDiv(revPrior, assetsPrior)

  const both = (a: number | null, b: number | null, cmp: (x: number, y: number) => boolean): boolean | null =>
    a === null || b === null ? null : cmp(a, b)

  const tests: PiotroskiTest[] = [
    { key: "roaPositive", label: "Return on assets is positive", passed: roaNow === null ? null : roaNow > 0 },
    { key: "cfoPositive", label: "Operating cash flow is positive", passed: cfoNow === null ? null : cfoNow > 0 },
    { key: "roaImproving", label: "Return on assets improved year over year", passed: both(roaNow, roaPrior, (a, b) => a > b) },
    { key: "accrualQuality", label: "Operating cash flow exceeds net income (clean accruals)", passed: both(cfoToAssets, roaNow, (a, b) => a > b) },
    { key: "leverageDown", label: "Long-term debt burden decreased", passed: both(leverageNow, leveragePrior, (a, b) => a <= b) },
    { key: "liquidityUp", label: "Current ratio improved", passed: both(currentRatioNow, currentRatioPrior, (a, b) => a > b) },
    { key: "noDilution", label: "No net share issuance", passed: both(sharesNow, sharesPrior, (a, b) => a <= b * 1.001) },
    { key: "marginUp", label: "Gross margin improved", passed: both(grossMarginNow, grossMarginPrior, (a, b) => a > b) },
    { key: "turnoverUp", label: "Asset turnover improved", passed: both(assetTurnoverNow, assetTurnoverPrior, (a, b) => a > b) },
  ]

  const evaluated = tests.filter(t => t.passed !== null)
  const maxPossible = evaluated.length
  const score = maxPossible > 0 ? evaluated.filter(t => t.passed === true).length : null

  // Fewer than 5 evaluable tests makes the composite too thin to mean anything.
  if (score === null || maxPossible < 5) {
    return {
      score, maxPossible, normalized: null, tests,
      interpretation: `Not enough comparable filing history to compute a reliable F-Score (only ${maxPossible} of 9 tests evaluable).`,
    }
  }

  const normalized = Math.round((score / maxPossible) * 9)
  const interpretation = normalized >= 8
    ? `F-Score ${normalized}/9 — financially strengthening on nearly every measure Piotroski tracks.`
    : normalized >= 6
    ? `F-Score ${normalized}/9 — solid financial trend, most health checks passing.`
    : normalized >= 4
    ? `F-Score ${normalized}/9 — mixed financial trend.`
    : `F-Score ${normalized}/9 — weak on most of Piotroski's financial-health checks.`

  return { score, maxPossible, normalized, tests, interpretation }
}
