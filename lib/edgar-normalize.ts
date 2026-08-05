// Normalizes SEC EDGAR's raw XBRL "companyfacts" payload into the fundamentals
// our scoring engines need.
//
// Two hard problems this file exists to solve:
//  1. Filers tag the same concept under different us-gaap names (e.g. "Revenues"
//     vs "RevenueFromContractWithCustomerExcludingAssessedTax"), so every concept
//     is resolved via an ordered fallback chain — first tag with usable data wins.
//  2. The Piotroski / Beneish models are year-over-year by construction, so this
//     returns a two-period SERIES (current + prior fiscal year) per concept, not
//     just a latest value.
import type { CompanyFacts } from "./edgar-client"

interface TagRef {
  taxonomy: "us-gaap" | "dei"
  tag: string
}

export interface AnnualObservation {
  value: number
  fiscalYear: number
  end: string
}

// ~10 months — floor for "this duration looks like a full fiscal year", so a
// quarterly figure is never mistaken for an annual one.
const ANNUAL_MS = 300 * 24 * 60 * 60 * 1000

function gaap(...tags: string[]): TagRef[] {
  return tags.map(tag => ({ taxonomy: "us-gaap" as const, tag }))
}

// Returns annual observations for a concept, newest first, deduped by period end.
// Duration concepts (revenue, net income) require an annual-length window;
// instant concepts (assets, equity) have no start date and match on `end` alone.
//
// CRITICAL: this merges ALL tags in the fallback chain rather than returning the
// first one that has any data. Filers migrate between tags over time — Apple
// reported under `Revenues` through FY2018 then switched to
// `RevenueFromContractWithCustomerExcludingAssessedTax`. Returning the first
// non-empty tag would have pinned revenue to 2018 forever while other concepts
// resolved to the current year, silently producing nonsense ratios (a 73% gross
// margin for Apple, whose real figure is ~46%). Merging and preferring the most
// recent observation per period fixes that class of bug outright.
function annualSeries(facts: CompanyFacts, refs: TagRef[], isInstant = false): AnnualObservation[] {
  const byTaxonomy = (facts as { facts?: Record<string, Record<string, unknown>> }).facts
  if (!byTaxonomy) return []

  const byEnd = new Map<string, AnnualObservation>()

  // Iterate in priority order; earlier tags in the chain win ties for the same
  // period end, later tags fill in periods the earlier ones don't cover.
  for (const ref of refs) {
    const concept = byTaxonomy[ref.taxonomy]?.[ref.tag] as
      | { units?: Record<string, Array<{ val: number; end: string; start?: string; form: string; fy?: number }>> }
      | undefined
    if (!concept?.units) continue

    const units = concept.units.USD ?? concept.units["USD/shares"] ?? concept.units.shares
    if (!units || units.length === 0) continue

    for (const u of units) {
      if (u.form !== "10-K") continue
      if (typeof u.val !== "number" || !isFinite(u.val)) continue
      if (!isInstant) {
        if (!u.start) continue
        if (new Date(u.end).getTime() - new Date(u.start).getTime() < ANNUAL_MS) continue
      }
      if (byEnd.has(u.end)) continue // higher-priority tag already covered this period
      byEnd.set(u.end, { value: u.val, fiscalYear: u.fy ?? new Date(u.end).getFullYear(), end: u.end })
    }
  }

  return [...byEnd.values()].sort((a, b) => new Date(b.end).getTime() - new Date(a.end).getTime())
}

// Picks the observation whose period end is closest to `anchorEnd`, within a
// tolerance. Fiscal period ends differ by a few days across concepts within the
// same 10-K, so exact string matching is too strict — but a year apart is a
// different fiscal year and must not be mixed in.
const PERIOD_MATCH_TOLERANCE_MS = 75 * 24 * 60 * 60 * 1000

function alignedTo(series: AnnualObservation[], anchorEnd: string | null): AnnualObservation | null {
  if (series.length === 0) return null
  if (!anchorEnd) return series[0]

  const anchor = new Date(anchorEnd).getTime()
  let best: AnnualObservation | null = null
  let bestDelta = Infinity
  for (const obs of series) {
    const delta = Math.abs(new Date(obs.end).getTime() - anchor)
    if (delta < bestDelta) { bestDelta = delta; best = obs }
  }
  return bestDelta <= PERIOD_MATCH_TOLERANCE_MS ? best : null
}

function at(series: AnnualObservation[], index: number): number | null {
  return series[index]?.value ?? null
}

function safeDiv(numerator: number | null, denominator: number | null): number | null {
  if (numerator === null || denominator === null || denominator === 0) return null
  const result = numerator / denominator
  return isFinite(result) ? result : null
}

// Every raw concept the scoring engines draw on, as a two-period series.
export interface FundamentalSeries {
  revenue: AnnualObservation[]
  netIncome: AnnualObservation[]
  grossProfit: AnnualObservation[]
  costOfRevenue: AnnualObservation[]
  operatingIncome: AnnualObservation[]
  cfo: AnnualObservation[]
  capex: AnnualObservation[]
  totalAssets: AnnualObservation[]
  currentAssets: AnnualObservation[]
  currentLiabilities: AnnualObservation[]
  totalLiabilities: AnnualObservation[]
  stockholdersEquity: AnnualObservation[]
  longTermDebt: AnnualObservation[]
  shortTermDebt: AnnualObservation[]
  retainedEarnings: AnnualObservation[]
  receivables: AnnualObservation[]
  ppeNet: AnnualObservation[]
  depreciation: AnnualObservation[]
  sga: AnnualObservation[]
  interestExpense: AnnualObservation[]
  dividendsPaid: AnnualObservation[]
  dividendPerShare: AnnualObservation[]
  epsDiluted: AnnualObservation[]
  sharesOutstanding: AnnualObservation[]
  // Forward-looking concepts — what the company has committed to or is
  // investing in, as opposed to what it already earned.
  remainingPerformanceObligation: AnnualObservation[]
  researchAndDevelopment: AnnualObservation[]
  deferredRevenue: AnnualObservation[]
  // Balance-sheet landmines — obligations and exposures that don't appear in
  // the headline debt-to-equity ratio.
  debtDueNext12Mo: AnnualObservation[]
  debtDueYear2: AnnualObservation[]
  debtDueYear3: AnnualObservation[]
  shareBasedComp: AnnualObservation[]
  goodwill: AnnualObservation[]
  goodwillImpairment: AnnualObservation[]
  operatingLeaseLiability: AnnualObservation[]
  effectiveTaxRate: AnnualObservation[]
  treasuryStockPurchased: AnnualObservation[]
}

export function extractSeries(facts: CompanyFacts): FundamentalSeries {
  return {
    revenue: annualSeries(facts, gaap("Revenues", "RevenueFromContractWithCustomerExcludingAssessedTax", "RevenueFromContractWithCustomerIncludingAssessedTax", "SalesRevenueNet")),
    netIncome: annualSeries(facts, gaap("NetIncomeLoss", "ProfitLoss")),
    grossProfit: annualSeries(facts, gaap("GrossProfit")),
    costOfRevenue: annualSeries(facts, gaap("CostOfRevenue", "CostOfGoodsAndServicesSold", "CostOfGoodsSold")),
    operatingIncome: annualSeries(facts, gaap("OperatingIncomeLoss")),
    cfo: annualSeries(facts, gaap("NetCashProvidedByUsedInOperatingActivities", "NetCashProvidedByUsedInOperatingActivitiesContinuingOperations")),
    capex: annualSeries(facts, gaap("PaymentsToAcquirePropertyPlantAndEquipment", "PaymentsToAcquireProductiveAssets", "PaymentsForCapitalImprovements", "PaymentsToAcquirePropertyPlantAndEquipmentExcludingCapitalizedInterest")),
    totalAssets: annualSeries(facts, gaap("Assets"), true),
    currentAssets: annualSeries(facts, gaap("AssetsCurrent"), true),
    currentLiabilities: annualSeries(facts, gaap("LiabilitiesCurrent"), true),
    totalLiabilities: annualSeries(facts, gaap("Liabilities"), true),
    stockholdersEquity: annualSeries(facts, gaap("StockholdersEquity", "StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest"), true),
    longTermDebt: annualSeries(facts, gaap("LongTermDebtNoncurrent", "LongTermDebt"), true),
    shortTermDebt: annualSeries(facts, gaap("LongTermDebtCurrent", "DebtCurrent"), true),
    retainedEarnings: annualSeries(facts, gaap("RetainedEarningsAccumulatedDeficit"), true),
    receivables: annualSeries(facts, gaap("AccountsReceivableNetCurrent", "ReceivablesNetCurrent"), true),
    ppeNet: annualSeries(facts, gaap("PropertyPlantAndEquipmentNet"), true),
    depreciation: annualSeries(facts, gaap("DepreciationDepletionAndAmortization", "DepreciationAmortizationAndAccretionNet", "Depreciation")),
    sga: annualSeries(facts, gaap("SellingGeneralAndAdministrativeExpense", "GeneralAndAdministrativeExpense")),
    interestExpense: annualSeries(facts, gaap("InterestExpense", "InterestExpenseDebt", "InterestIncomeExpenseNet")),
    dividendsPaid: annualSeries(facts, gaap("PaymentsOfDividends", "PaymentsOfDividendsCommonStock")),
    dividendPerShare: annualSeries(facts, gaap("CommonStockDividendsPerShareDeclared", "CommonStockDividendsPerShareCashPaid")),
    epsDiluted: annualSeries(facts, gaap("EarningsPerShareDiluted", "EarningsPerShareBasic")),
    debtDueNext12Mo: annualSeries(facts, gaap("LongTermDebtMaturitiesRepaymentsOfPrincipalInNextTwelveMonths"), true),
    debtDueYear2: annualSeries(facts, gaap("LongTermDebtMaturitiesRepaymentsOfPrincipalInYearTwo"), true),
    debtDueYear3: annualSeries(facts, gaap("LongTermDebtMaturitiesRepaymentsOfPrincipalInYearThree"), true),
    shareBasedComp: annualSeries(facts, gaap("ShareBasedCompensation", "AllocatedShareBasedCompensationExpense")),
    goodwill: annualSeries(facts, gaap("Goodwill"), true),
    goodwillImpairment: annualSeries(facts, gaap("GoodwillImpairmentLoss", "ImpairmentOfIntangibleAssetsIncludingGoodwill")),
    operatingLeaseLiability: annualSeries(facts, gaap("OperatingLeaseLiability", "OperatingLeaseLiabilityNoncurrent"), true),
    effectiveTaxRate: annualSeries(facts, gaap("EffectiveIncomeTaxRateContinuingOperations")),
    treasuryStockPurchased: annualSeries(facts, gaap("PaymentsForRepurchaseOfCommonStock", "TreasuryStockValueAcquiredCostMethod")),
    remainingPerformanceObligation: annualSeries(facts, gaap("RevenueRemainingPerformanceObligation"), true),
    researchAndDevelopment: annualSeries(facts, gaap("ResearchAndDevelopmentExpense", "ResearchAndDevelopmentExpenseExcludingAcquiredInProcessCost")),
    deferredRevenue: annualSeries(facts, gaap("ContractWithCustomerLiability", "ContractWithCustomerLiabilityCurrent", "DeferredRevenueCurrent"), true),
    sharesOutstanding: annualSeries(facts, [
      { taxonomy: "dei", tag: "EntityCommonStockSharesOutstanding" },
      { taxonomy: "us-gaap", tag: "CommonStockSharesOutstanding" },
      { taxonomy: "us-gaap", tag: "WeightedAverageNumberOfDilutedSharesOutstanding" },
    ], true),
  }
}

export interface NormalizedFundamentals {
  revenueTtm: number | null
  revenueGrowthYoyPct: number | null
  grossMarginPct: number | null
  operatingMarginPct: number | null
  netMarginPct: number | null
  roePct: number | null
  roicPct: number | null
  debtToEquity: number | null
  interestCoveragePct: number | null
  currentRatio: number | null
  freeCashFlowTtm: number | null
  fcfMarginPct: number | null
  accrualsRatioPct: number | null
  dividendPerShare: number | null
  payoutRatioEarningsPct: number | null
  payoutRatioFcfPct: number | null
  epsDiluted: number | null
  sharesOutstanding: number | null
  buybackYieldPct: number | null
  fiscalYear: number | null
  periodEnd: string | null
  fieldsPresent: number
  fieldsExpected: number
}

// Core scored fields — drives the data-completeness gate in stock-scoring.ts.
const EXPECTED_FIELD_COUNT = 15

export function normalizeFundamentals(facts: CompanyFacts, series?: FundamentalSeries): NormalizedFundamentals {
  const s = series ?? extractSeries(facts)

  // Anchor every concept to ONE fiscal period. Without this, each concept
  // independently resolves to its own latest available period and ratios mix
  // years — e.g. this year's gross profit over a five-year-old revenue figure.
  // Revenue is the anchor because it's the most consistently tagged concept;
  // total assets is the fallback for filers with unusual revenue tagging.
  const anchorEnd = s.revenue[0]?.end ?? s.totalAssets[0]?.end ?? null
  const priorAnchorEnd = s.revenue[1]?.end ?? s.totalAssets[1]?.end ?? null

  const val = (arr: AnnualObservation[], anchor: string | null): number | null =>
    alignedTo(arr, anchor)?.value ?? null

  const revenue = val(s.revenue, anchorEnd)
  const revenuePrior = val(s.revenue, priorAnchorEnd)
  const netIncome = val(s.netIncome, anchorEnd)
  const grossProfit = val(s.grossProfit, anchorEnd)
  const costOfRevenue = val(s.costOfRevenue, anchorEnd)
  const operatingIncome = val(s.operatingIncome, anchorEnd)
  const cfo = val(s.cfo, anchorEnd)
  const capex = val(s.capex, anchorEnd)
  const totalAssets = val(s.totalAssets, anchorEnd)
  const currentAssets = val(s.currentAssets, anchorEnd)
  const currentLiabilities = val(s.currentLiabilities, anchorEnd)
  const totalLiabilities = val(s.totalLiabilities, anchorEnd)
  const equity = val(s.stockholdersEquity, anchorEnd)
  const longTermDebt = val(s.longTermDebt, anchorEnd)
  const shortTermDebt = val(s.shortTermDebt, anchorEnd)
  const interestExpense = val(s.interestExpense, anchorEnd)
  const dividendsPaid = val(s.dividendsPaid, anchorEnd)
  // Share count is often tagged with a cover-page date rather than the fiscal
  // period end, so it uses the plain latest value rather than the anchor.
  const shares = at(s.sharesOutstanding, 0)
  const sharesPrior = at(s.sharesOutstanding, 1)

  const revenueGrowthYoyPct = revenue !== null && revenuePrior !== null && revenuePrior !== 0
    ? ((revenue - revenuePrior) / Math.abs(revenuePrior)) * 100 : null

  const grossMarginPct = revenue !== null && revenue !== 0
    ? (grossProfit !== null ? (grossProfit / revenue) * 100
      : costOfRevenue !== null ? ((revenue - costOfRevenue) / revenue) * 100
      : null)
    : null

  const operatingMarginPct = revenue !== null && revenue !== 0 && operatingIncome !== null
    ? (operatingIncome / revenue) * 100 : null

  const netMarginPct = revenue !== null && revenue !== 0 && netIncome !== null
    ? (netIncome / revenue) * 100 : null

  const roeRatio = safeDiv(netIncome, equity)
  const roePct = roeRatio !== null ? roeRatio * 100 : null

  const hasDebtData = longTermDebt !== null || shortTermDebt !== null
  const totalDebt = (longTermDebt ?? 0) + (shortTermDebt ?? 0)

  // Pre-tax ROIC approximation: a true after-tax NOPAT needs an effective tax
  // rate that isn't reliably tagged across filers. Documented as an
  // approximation and weighted lower in scoring than ROE for that reason.
  const investedCapital = hasDebtData || equity !== null ? totalDebt + (equity ?? 0) : null
  const roicRatio = safeDiv(operatingIncome, investedCapital)
  const roicPct = roicRatio !== null ? roicRatio * 100 : null

  const debtToEquity = hasDebtData && equity !== null && equity !== 0
    ? totalDebt / equity
    : safeDiv(totalLiabilities, equity) // weaker proxy: total liabilities, not just debt

  const interestCoveragePct = operatingIncome !== null && interestExpense !== null && interestExpense !== 0
    ? operatingIncome / Math.abs(interestExpense) : null

  const currentRatio = safeDiv(currentAssets, currentLiabilities)

  const freeCashFlowTtm = cfo !== null ? cfo - (capex ?? 0) : null
  const fcfMarginPct = freeCashFlowTtm !== null && revenue !== null && revenue !== 0
    ? (freeCashFlowTtm / revenue) * 100 : null

  const accrualsRatioPct = netIncome !== null && cfo !== null && totalAssets !== null && totalAssets !== 0
    ? ((netIncome - cfo) / totalAssets) * 100 : null

  const dividendsPaidAbs = dividendsPaid !== null ? Math.abs(dividendsPaid) : null
  const payoutRatioEarningsPct = dividendsPaidAbs !== null && netIncome !== null && netIncome > 0
    ? (dividendsPaidAbs / netIncome) * 100 : null
  const payoutRatioFcfPct = dividendsPaidAbs !== null && freeCashFlowTtm !== null && freeCashFlowTtm > 0
    ? (dividendsPaidAbs / freeCashFlowTtm) * 100 : null

  // Positive = net buyback (shrinking share count), negative = dilution.
  const buybackYieldPct = shares !== null && sharesPrior !== null && sharesPrior !== 0
    ? ((sharesPrior - shares) / sharesPrior) * 100 : null

  const dividendPerShare = val(s.dividendPerShare, anchorEnd)
  const epsDiluted = val(s.epsDiluted, anchorEnd)

  const scoredFields = [
    revenue, revenueGrowthYoyPct, grossMarginPct, operatingMarginPct, netMarginPct,
    roePct, roicPct, debtToEquity, interestCoveragePct, currentRatio,
    freeCashFlowTtm, fcfMarginPct, accrualsRatioPct, dividendPerShare, epsDiluted,
  ]
  const fieldsPresent = scoredFields.filter(f => f !== null).length

  return {
    revenueTtm: revenue,
    revenueGrowthYoyPct,
    grossMarginPct,
    operatingMarginPct,
    netMarginPct,
    roePct,
    roicPct,
    debtToEquity,
    interestCoveragePct,
    currentRatio,
    freeCashFlowTtm,
    fcfMarginPct,
    accrualsRatioPct,
    dividendPerShare,
    payoutRatioEarningsPct,
    payoutRatioFcfPct,
    epsDiluted,
    sharesOutstanding: shares,
    buybackYieldPct,
    fiscalYear: s.revenue[0]?.fiscalYear ?? s.totalAssets[0]?.fiscalYear ?? null,
    periodEnd: anchorEnd,
    fieldsPresent,
    fieldsExpected: EXPECTED_FIELD_COUNT,
  }
}

export { at as seriesAt, safeDiv }
