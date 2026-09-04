// Is this actually worth anything?
//
// THE GAP THIS CLOSES. lib/valuation.ts answers a RELATIVE question — is this
// cheaper than it usually is — and that is genuinely the axis this system's
// backtest found signal in. But relative cheapness cannot answer whether
// something is worth owning at all. A business in permanent decline gets
// cheaper against its own history the entire way to zero, and every step of
// that descent scores as a bargain.
//
// TWO ABSOLUTE TESTS, NEITHER OF WHICH REQUIRES FORECASTING.
//
//   1. WHAT DOES THE PRICE ALREADY ASSUME? Forecasting growth is unreliable,
//      so this does not attempt it. It inverts the problem instead: given
//      today's market cap, today's cash flow and a stated discount rate, solve
//      for the growth rate that would justify the current price. Then compare
//      that number to what the company has ACTUALLY achieved. The output is a
//      falsifiable sentence — "the market is pricing in 19% annual growth; this
//      company has delivered 4%" — rather than a price target, which would be a
//      forecast wearing a number's clothing.
//
//   2. DOES THE BUSINESS CREATE VALUE AT ALL? A company earning 6% on capital
//      that costs it 9% destroys value with every dollar it reinvests, and
//      grows itself poorer. ROIC minus the cost of capital is the most
//      fundamental test of whether a business is worth anything, and this
//      system computed ROIC without ever comparing it to anything.
//
// EVERY ASSUMPTION IS STATED AND RETURNED. Discount rate, horizon and terminal
// growth all change the answer, so they are reported alongside it rather than
// buried, and the implied growth is also computed across a range of discount
// rates so the reader can see how sensitive the conclusion actually is.

/** Long-run nominal GDP-ish ceiling. Nothing grows faster than the economy
 *  forever, so a terminal rate above this is not a forecast, it is an error. */
const TERMINAL_GROWTH = 0.025
const DEFAULT_HORIZON_YEARS = 10
/** Equity risk premium — the long-run excess return of stocks over bonds.
 *  Damodaran's implied ERP has averaged roughly this over recent decades. */
const EQUITY_RISK_PREMIUM = 0.05
/** Used when the risk-free rate is not supplied. Stated, not hidden. */
const DEFAULT_RISK_FREE = 0.042

export interface CostOfCapital {
  wacc: number
  costOfEquity: number
  costOfDebt: number | null
  equityWeight: number
  debtWeight: number
  beta: number
  riskFreeRate: number
  assumptions: string[]
}

export interface CostOfCapitalInput {
  betaVsSpy: number | null
  marketCap: number | null
  totalDebt: number | null
  interestExpense: number | null
  effectiveTaxRatePct: number | null
  riskFreeRate?: number
}

export function estimateCostOfCapital(input: CostOfCapitalInput): CostOfCapital | null {
  const { marketCap, totalDebt, interestExpense, effectiveTaxRatePct } = input
  if (!marketCap || marketCap <= 0) return null

  const assumptions: string[] = []
  const riskFreeRate = input.riskFreeRate ?? DEFAULT_RISK_FREE
  if (input.riskFreeRate === undefined) {
    assumptions.push(`Risk-free rate assumed at ${(DEFAULT_RISK_FREE * 100).toFixed(1)}% (long-term Treasury).`)
  }

  // Beta near 1 is the honest default when it cannot be measured: assuming a
  // company is exactly as risky as the market is far safer than assuming it is
  // unusually safe, which would flatter every valuation downstream.
  const beta = input.betaVsSpy !== null && isFinite(input.betaVsSpy) && input.betaVsSpy > 0
    ? Math.min(input.betaVsSpy, 3)
    : 1.0
  if (input.betaVsSpy === null) assumptions.push("Beta unavailable; assumed 1.0 (as risky as the market).")
  else if (input.betaVsSpy > 3) assumptions.push("Beta capped at 3.0 — higher measured values are usually noise.")

  // CAPM.
  const costOfEquity = riskFreeRate + beta * EQUITY_RISK_PREMIUM

  const debt = totalDebt && totalDebt > 0 ? totalDebt : 0
  const taxRate = effectiveTaxRatePct !== null && effectiveTaxRatePct >= 0 && effectiveTaxRatePct < 60
    ? effectiveTaxRatePct / 100
    : 0.21
  if (effectiveTaxRatePct === null) assumptions.push("Effective tax rate unavailable; assumed 21% (US statutory).")

  let costOfDebt: number | null = null
  if (debt > 0 && interestExpense && interestExpense > 0) {
    costOfDebt = Math.min(interestExpense / debt, 0.25)
  } else if (debt > 0) {
    costOfDebt = riskFreeRate + 0.02
    assumptions.push("Interest expense unavailable; cost of debt assumed at the risk-free rate plus 2%.")
  }

  const totalCapital = marketCap + debt
  const equityWeight = marketCap / totalCapital
  const debtWeight = debt / totalCapital

  // Interest is tax-deductible, so debt costs the company less than its coupon.
  const wacc = equityWeight * costOfEquity + debtWeight * (costOfDebt ?? 0) * (1 - taxRate)

  return {
    wacc, costOfEquity, costOfDebt, equityWeight, debtWeight, beta, riskFreeRate,
    assumptions,
  }
}

export interface ValueCreation {
  roicPct: number
  waccPct: number
  /** ROIC − WACC. Positive creates value; negative destroys it while growing. */
  spreadPct: number
  createsValue: boolean
  verdict: string
}

export function assessValueCreation(roicPct: number | null, wacc: number | null): ValueCreation | null {
  if (roicPct === null || wacc === null || !isFinite(roicPct) || !isFinite(wacc)) return null
  const waccPct = wacc * 100
  const spreadPct = roicPct - waccPct
  const createsValue = spreadPct > 0

  const verdict = spreadPct > 10
    ? `Earns ${roicPct.toFixed(1)}% on invested capital against a ${waccPct.toFixed(1)}% cost of that capital — a ` +
      `${spreadPct.toFixed(1)} point spread. Every dollar reinvested creates value, which is what makes growth worth ` +
      `paying for here.`
    : spreadPct > 0
      ? `Earns ${roicPct.toFixed(1)}% on capital costing ${waccPct.toFixed(1)}% — a thin ${spreadPct.toFixed(1)} point ` +
        `spread. The business creates value, but not by enough for growth alone to justify a high price.`
      : `Earns ${roicPct.toFixed(1)}% on capital that costs ${waccPct.toFixed(1)}%. The spread is ` +
        `${spreadPct.toFixed(1)} points — NEGATIVE. This business destroys value with every dollar it reinvests, so ` +
        `growth actively makes shareholders poorer rather than richer.`

  return { roicPct, waccPct, spreadPct, createsValue, verdict }
}

export interface ReverseDcf {
  /** Annual FCF growth for the horizon that the current price implies. */
  impliedGrowthPct: number | null
  /** What the company has actually delivered, for comparison. */
  historicalGrowthPct: number | null
  /** impliedGrowth − historicalGrowth. Large positive = the price needs a
   *  step change that has not happened yet. */
  expectationGapPct: number | null
  discountRatePct: number
  horizonYears: number
  terminalGrowthPct: number
  /** Implied growth recomputed across a band of discount rates. */
  sensitivity: Array<{ discountRatePct: number; impliedGrowthPct: number | null }>
  plausibility: "modest" | "demanding" | "heroic" | "implausible" | "unknown"
  verdict: string
  assumptions: string[]
}

/** Present value of a two-stage FCF stream: `years` at `growth`, then a
 *  perpetuity growing at the terminal rate. */
function presentValue(fcf: number, growth: number, discount: number, years: number): number {
  if (discount <= TERMINAL_GROWTH) return Number.POSITIVE_INFINITY
  let pv = 0
  let cash = fcf
  for (let t = 1; t <= years; t++) {
    cash *= 1 + growth
    pv += cash / Math.pow(1 + discount, t)
  }
  const terminal = (cash * (1 + TERMINAL_GROWTH)) / (discount - TERMINAL_GROWTH)
  return pv + terminal / Math.pow(1 + discount, years)
}

/** Solves for the growth rate that makes PV equal the market cap. Monotonic in
 *  growth, so a bisection is exact enough and cannot get stuck. */
function solveImpliedGrowth(marketCap: number, fcf: number, discount: number, years: number): number | null {
  if (fcf <= 0 || marketCap <= 0) return null
  let lo = -0.5, hi = 1.0
  if (presentValue(fcf, hi, discount, years) < marketCap) return null   // even 100% growth cannot justify it
  if (presentValue(fcf, lo, discount, years) > marketCap) return lo     // priced below a fast-shrinking business

  for (let i = 0; i < 100; i++) {
    const mid = (lo + hi) / 2
    if (presentValue(fcf, mid, discount, years) < marketCap) lo = mid
    else hi = mid
  }
  return (lo + hi) / 2
}

/**
 * Compound annual growth rate from a series ordered NEWEST FIRST (the order
 * lib/edgar-normalize.ts produces).
 *
 * CAGR rather than an average of yearly changes: averaging percentage changes
 * overstates growth badly for volatile series, since a −50% followed by a
 * +100% averages to +25% while actually returning to where it started.
 *
 * Returns null when the earliest value is not positive — a CAGR out of a
 * negative or zero base is arithmetically meaningless, and reporting one would
 * be worse than reporting nothing.
 */
export function annualizedGrowthPct(newestFirst: Array<number | null | undefined>): number | null {
  const vals = newestFirst.filter((v): v is number => typeof v === "number" && isFinite(v))
  if (vals.length < 3) return null
  const latest = vals[0]
  const earliest = vals[vals.length - 1]
  const years = vals.length - 1
  if (earliest <= 0 || latest <= 0) return null
  return (Math.pow(latest / earliest, 1 / years) - 1) * 100
}

export interface ReverseDcfInput {
  marketCap: number | null
  freeCashFlowTtm: number | null
  /** Achieved annualised FCF growth, for the comparison that gives the number meaning. */
  historicalGrowthPct: number | null
  wacc: number | null
  horizonYears?: number
}

export function reverseDcf(input: ReverseDcfInput): ReverseDcf | null {
  const { marketCap, freeCashFlowTtm, historicalGrowthPct } = input
  const horizonYears = input.horizonYears ?? DEFAULT_HORIZON_YEARS
  const assumptions: string[] = []

  if (!marketCap || marketCap <= 0) return null
  if (!freeCashFlowTtm || freeCashFlowTtm <= 0) {
    return {
      impliedGrowthPct: null, historicalGrowthPct, expectationGapPct: null,
      discountRatePct: (input.wacc ?? 0) * 100, horizonYears, terminalGrowthPct: TERMINAL_GROWTH * 100,
      sensitivity: [], plausibility: "unknown",
      verdict: "Free cash flow is zero or negative, so there is no cash stream to discount. A price cannot be " +
               "justified by cash the business does not currently produce — any value here rests entirely on a " +
               "future that has not arrived.",
      assumptions,
    }
  }

  // The discount rate IS the required return. Using the company's own cost of
  // capital is the standard choice; a fixed hurdle is the fallback.
  const discount = input.wacc && input.wacc > TERMINAL_GROWTH + 0.01 ? input.wacc : 0.09
  if (!input.wacc) assumptions.push("Cost of capital unavailable; a 9% required return was assumed.")
  assumptions.push(`Terminal growth fixed at ${(TERMINAL_GROWTH * 100).toFixed(1)}% — nothing outgrows the economy forever.`)
  assumptions.push(`${horizonYears}-year explicit forecast horizon before the terminal value.`)

  const implied = solveImpliedGrowth(marketCap, freeCashFlowTtm, discount, horizonYears)
  const impliedGrowthPct = implied === null ? null : implied * 100

  // Sensitivity: the conclusion should be reported alongside how much it moves
  // when the one big assumption changes.
  const sensitivity = [discount - 0.02, discount, discount + 0.02].map(d => {
    const g = solveImpliedGrowth(marketCap, freeCashFlowTtm, d, horizonYears)
    return { discountRatePct: d * 100, impliedGrowthPct: g === null ? null : g * 100 }
  })

  const expectationGapPct = impliedGrowthPct !== null && historicalGrowthPct !== null
    ? impliedGrowthPct - historicalGrowthPct
    : null

  let plausibility: ReverseDcf["plausibility"] = "unknown"
  if (impliedGrowthPct !== null) {
    plausibility = impliedGrowthPct > 25 ? "implausible"
      : impliedGrowthPct > 15 ? "heroic"
      : impliedGrowthPct > 8 ? "demanding"
      : "modest"
  }

  let verdict: string
  if (impliedGrowthPct === null) {
    verdict = "Even 100% annual growth for the whole horizon would not justify the current price from today's cash " +
              "flow. The market is valuing something other than the cash this business currently produces."
  } else {
    const base = `At today's price the market is pricing in about ${impliedGrowthPct.toFixed(1)}% annual free-cash-flow ` +
                 `growth for ${horizonYears} years, discounted at ${(discount * 100).toFixed(1)}%.`
    if (historicalGrowthPct === null) {
      verdict = `${base} No reliable growth history was available to compare that against.`
    } else if (expectationGapPct! > 10) {
      verdict = `${base} The company has actually delivered ${historicalGrowthPct.toFixed(1)}%. The price therefore ` +
                `requires roughly ${expectationGapPct!.toFixed(1)} points MORE growth than this business has ever ` +
                `produced — something fundamental has to change for it to work out.`
    } else if (expectationGapPct! < -5) {
      verdict = `${base} The company has actually delivered ${historicalGrowthPct.toFixed(1)}% — comfortably more than ` +
                `the price requires. The market is assuming this business does materially worse than it has, which is ` +
                `the shape of a genuine mispricing IF the historical rate is repeatable.`
    } else {
      verdict = `${base} The company has delivered ${historicalGrowthPct.toFixed(1)}%, so the price is broadly asking ` +
                `for a continuation of what it already does rather than a change in trajectory.`
    }
  }

  return {
    impliedGrowthPct, historicalGrowthPct, expectationGapPct,
    discountRatePct: discount * 100, horizonYears, terminalGrowthPct: TERMINAL_GROWTH * 100,
    sensitivity, plausibility, verdict, assumptions,
  }
}

export interface IntrinsicAssessment {
  costOfCapital: CostOfCapital | null
  valueCreation: ValueCreation | null
  reverseDcf: ReverseDcf | null
  /** Plain-language answer to "is this worth anything". */
  summary: string
  flags: string[]
  riskPenalty: number
}

export function assessIntrinsicValue(input: {
  marketCap: number | null
  freeCashFlowTtm: number | null
  fcfGrowthPct: number | null
  roicPct: number | null
  betaVsSpy: number | null
  totalDebt: number | null
  interestExpense: number | null
  effectiveTaxRatePct: number | null
  riskFreeRate?: number
}): IntrinsicAssessment {
  const costOfCapital = estimateCostOfCapital(input)
  const valueCreation = assessValueCreation(input.roicPct, costOfCapital?.wacc ?? null)
  const dcf = reverseDcf({
    marketCap: input.marketCap,
    freeCashFlowTtm: input.freeCashFlowTtm,
    historicalGrowthPct: input.fcfGrowthPct,
    wacc: costOfCapital?.wacc ?? null,
  })

  const flags: string[] = []
  let riskPenalty = 0

  if (valueCreation && !valueCreation.createsValue) {
    riskPenalty += 10
    flags.push(
      `⚠ Returns on capital (${valueCreation.roicPct.toFixed(1)}%) are below the cost of that capital ` +
      `(${valueCreation.waccPct.toFixed(1)}%) — this business destroys value as it grows.`
    )
  }
  if (dcf?.plausibility === "implausible") {
    riskPenalty += 12
    flags.push(
      `⚠ The current price requires roughly ${dcf.impliedGrowthPct!.toFixed(0)}% annual cash-flow growth for a decade, ` +
      `which almost no business sustains.`
    )
  } else if (dcf?.plausibility === "heroic") {
    riskPenalty += 6
    flags.push(`⚠ The price assumes ${dcf.impliedGrowthPct!.toFixed(0)}% annual growth for a decade — demanding, and rarely sustained.`)
  }

  const parts: string[] = []
  if (valueCreation) parts.push(valueCreation.verdict)
  if (dcf) parts.push(dcf.verdict)
  const summary = parts.length
    ? parts.join(" ")
    : "Not enough data to judge absolute value — market cap, free cash flow and returns on capital are all required."

  return { costOfCapital, valueCreation, reverseDcf: dcf, summary, flags, riskPenalty }
}
