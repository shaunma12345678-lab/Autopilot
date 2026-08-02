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
function annualSeries(facts: CompanyFacts, refs: TagRef[], isInstant = false): AnnualObservation[] {
  const byTaxonomy = (facts as { facts?: Record<string, Record<string, unknown>> }).facts
  if (!byTaxonomy) return []

  for (const ref of refs) {
    const concept = byTaxonomy[ref.taxonomy]?.[ref.tag] as
      | { units?: Record<string, Array<{ val: number; end: string; start?: string; form: string; fy?: number }>> }
      | undefined
    if (!concept?.units) continue

    const units = concept.units.USD ?? concept.units["USD/shares"] ?? concept.units.shares
    if (!units || units.length === 0) continue

    const annual = units.filter(u => {
      if (u.form !== "10-K") return false
      if (typeof u.val !== "number" || !isFinite(u.val)) return false
      if (isInstant) return true
      if (!u.start) return false
      return new Date(u.end).getTime() - new Date(u.start).getTime() >= ANNUAL_MS
    })
    if (annual.length === 0) continue

    // Dedupe by period end (amended filings restate the same period), newest first
    const byEnd = new Map<string, AnnualObservation>()
    for (const u of annual) {
      if (!byEnd.has(u.end)) {
        byEnd.set(u.end, { value: u.val, fiscalYear: u.fy ?? new Date(u.end).getFullYear(), end: u.end })
      }
    }
    const series = [...byEnd.values()].sort((a, b) => new Date(b.end).getTime() - new Date(a.end).getTime())
    if (series.length > 0) return series
  }
  return []
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
}

export function extractSeries(facts: CompanyFacts): FundamentalSeries {
  return {
    revenue: annualSeries(facts, gaap("Revenues", "RevenueFromContractWithCustomerExcludingAssessedTax", "RevenueFromContractWithCustomerIncludingAssessedTax", "SalesRevenueNet")),
    netIncome: annualSeries(facts, gaap("NetIncomeLoss", "ProfitLoss")),
    grossProfit: annualSeries(facts, gaap("GrossProfit")),
    costOfRevenue: annualSeries(facts, gaap("CostOfRevenue", "CostOfGoodsAndServicesSold", "CostOfGoodsSold")),
    operatingIncome: annualSeries(facts, gaap("OperatingIncomeLoss")),
    cfo: annualSeries(facts, gaap("NetCashProvidedByUsedInOperatingActivities", "NetCashProvidedByUsedInOperatingActivitiesContinuingOperations")),
    capex: annualSeries(facts, gaap("PaymentsToAcquirePropertyPlantAndEquipment", "PaymentsForCapitalImprovements")),
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

  const revenue = at(s.revenue, 0)
  const revenuePrior = at(s.revenue, 1)
  const netIncome = at(s.netIncome, 0)
  const grossProfit = at(s.grossProfit, 0)
  const costOfRevenue = at(s.costOfRevenue, 0)
  const operatingIncome = at(s.operatingIncome, 0)
  const cfo = at(s.cfo, 0)
  const capex = at(s.capex, 0)
  const totalAssets = at(s.totalAssets, 0)
  const currentAssets = at(s.currentAssets, 0)
  const currentLiabilities = at(s.currentLiabilities, 0)
  const totalLiabilities = at(s.totalLiabilities, 0)
  const equity = at(s.stockholdersEquity, 0)
  const longTermDebt = at(s.longTermDebt, 0)
  const shortTermDebt = at(s.shortTermDebt, 0)
  const interestExpense = at(s.interestExpense, 0)
  const dividendsPaid = at(s.dividendsPaid, 0)
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

  const scoredFields = [
    revenue, revenueGrowthYoyPct, grossMarginPct, operatingMarginPct, netMarginPct,
    roePct, roicPct, debtToEquity, interestCoveragePct, currentRatio,
    freeCashFlowTtm, fcfMarginPct, accrualsRatioPct, at(s.dividendPerShare, 0), at(s.epsDiluted, 0),
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
    dividendPerShare: at(s.dividendPerShare, 0),
    payoutRatioEarningsPct,
    payoutRatioFcfPct,
    epsDiluted: at(s.epsDiluted, 0),
    sharesOutstanding: shares,
    buybackYieldPct,
    fiscalYear: s.revenue[0]?.fiscalYear ?? s.totalAssets[0]?.fiscalYear ?? null,
    periodEnd: s.revenue[0]?.end ?? s.totalAssets[0]?.end ?? null,
    fieldsPresent,
    fieldsExpected: EXPECTED_FIELD_COUNT,
  }
}

export { at as seriesAt, safeDiv }
