// Balance-sheet landmines — obligations and exposures that never appear in the
// headline debt-to-equity ratio.
//
// Debt-to-equity tells you how much a company owes. It does not tell you WHEN
// it comes due, how much of "profit" is being paid in stock, or how much of
// the asset base is a premium paid for acquisitions that may not have worked.
// Those are the things that turn a solvent company into a distressed one.
//
// Every input verified live in XBRL:
//   Microsoft — $9.2B of debt due within 12 months, $12.4B of share-based
//   compensation, $119.7B of goodwill, $21.9B of operating lease liabilities,
//   19.4% effective tax rate.
//
// Why each one matters:
//   DEBT MATURITY WALL — the direct equity analog to the CMBS maturity concept
//     in the commercial real estate module. Debt coming due into a hostile
//     refinancing market is how solvent companies become distressed ones.
//   SHARE-BASED COMPENSATION — dilution that hasn't reached the share count
//     yet, and the most common way "adjusted" earnings overstate reality.
//   GOODWILL — the premium paid for past acquisitions. A large balance is
//     impairment risk sitting on the books waiting to be written down; a
//     realized impairment is the market's verdict that M&A destroyed value.
//   OPERATING LEASES — real obligations that sit outside the debt line.
//   EFFECTIVE TAX RATE — an abnormally low rate normalizes eventually, cutting
//     earnings with no operational change whatsoever.
import type { FundamentalSeries } from "./edgar-normalize"
import { seriesAt as at } from "./edgar-normalize"

const US_STATUTORY_RATE_PCT = 21

export interface BalanceSheetRisk {
  debtDueNext12MoUsd: number | null
  debtDue3YrUsd: number | null
  debtWallToFcfYears: number | null    // years of free cash flow to clear near-term maturities
  sbcUsd: number | null
  sbcToRevenuePct: number | null
  sbcToFcfPct: number | null
  goodwillUsd: number | null
  goodwillToAssetsPct: number | null
  hadGoodwillImpairment: boolean
  operatingLeaseUsd: number | null
  effectiveTaxRatePct: number | null
  riskPenalty: number
  flags: string[]
  notes: string[]
}

function pct(numerator: number | null, denominator: number | null): number | null {
  if (numerator === null || denominator === null || denominator === 0) return null
  const r = (numerator / denominator) * 100
  return isFinite(r) ? r : null
}

export function computeBalanceSheetRisk(s: FundamentalSeries, freeCashFlow: number | null): BalanceSheetRisk {
  const revenue = at(s.revenue, 0)
  const totalAssets = at(s.totalAssets, 0)

  const debtDueNext12MoUsd = at(s.debtDueNext12Mo, 0)
  const due2 = at(s.debtDueYear2, 0)
  const due3 = at(s.debtDueYear3, 0)
  const debtDue3YrUsd = debtDueNext12MoUsd !== null
    ? debtDueNext12MoUsd + (due2 ?? 0) + (due3 ?? 0)
    : null

  const debtWallToFcfYears = debtDueNext12MoUsd !== null && freeCashFlow !== null && freeCashFlow > 0
    ? debtDueNext12MoUsd / freeCashFlow
    : null

  const sbcUsd = at(s.shareBasedComp, 0)
  const sbcToRevenuePct = pct(sbcUsd, revenue)
  const sbcToFcfPct = freeCashFlow !== null && freeCashFlow > 0 ? pct(sbcUsd, freeCashFlow) : null

  const goodwillUsd = at(s.goodwill, 0)
  const goodwillToAssetsPct = pct(goodwillUsd, totalAssets)
  const impairment = at(s.goodwillImpairment, 0)
  const hadGoodwillImpairment = impairment !== null && impairment > 0

  const operatingLeaseUsd = at(s.operatingLeaseLiability, 0)

  const rawTaxRate = at(s.effectiveTaxRate, 0)
  // XBRL reports this as a decimal (0.194) for most filers but occasionally as
  // a percentage — normalize rather than reporting a 19x tax rate.
  const effectiveTaxRatePct = rawTaxRate === null ? null : rawTaxRate <= 1.5 ? rawTaxRate * 100 : rawTaxRate

  const flags: string[] = []
  const notes: string[] = []
  let riskPenalty = 0

  if (debtWallToFcfYears !== null) {
    if (debtWallToFcfYears > 3) {
      riskPenalty += 15
      flags.push(`⚠ Debt maturity wall: $${(debtDueNext12MoUsd! / 1e9).toFixed(1)}B comes due within 12 months — roughly ${debtWallToFcfYears.toFixed(1)} years of current free cash flow. Refinancing risk is material if credit conditions tighten.`)
    } else if (debtWallToFcfYears > 1.5) {
      riskPenalty += 7
      flags.push(`⚠ $${(debtDueNext12MoUsd! / 1e9).toFixed(1)}B of debt matures within 12 months — about ${debtWallToFcfYears.toFixed(1)} years of free cash flow.`)
    } else {
      notes.push(`✓ Near-term debt maturities are covered by roughly ${(1 / debtWallToFcfYears).toFixed(1)}x annual free cash flow.`)
    }
  } else if (debtDueNext12MoUsd !== null && debtDueNext12MoUsd > 0 && (freeCashFlow ?? 0) <= 0) {
    riskPenalty += 20
    flags.push(`⚠ $${(debtDueNext12MoUsd / 1e9).toFixed(1)}B of debt matures within 12 months while free cash flow is negative — the maturity has to be met by refinancing or asset sales.`)
  }

  if (sbcToRevenuePct !== null) {
    if (sbcToRevenuePct > 15) {
      riskPenalty += 12
      flags.push(`⚠ Share-based compensation is ${sbcToRevenuePct.toFixed(1)}% of revenue — a large ongoing transfer of ownership away from existing shareholders that doesn't show in the share count yet.`)
    } else if (sbcToRevenuePct > 8) {
      riskPenalty += 5
      flags.push(`⚠ Share-based compensation runs ${sbcToRevenuePct.toFixed(1)}% of revenue — meaningful dilution to watch.`)
    }
    if (sbcToFcfPct !== null && sbcToFcfPct > 50) {
      riskPenalty += 8
      flags.push(`⚠ Stock compensation equals ${sbcToFcfPct.toFixed(0)}% of free cash flow — a large share of "cash generation" is being paid out in equity.`)
    }
  }

  if (goodwillToAssetsPct !== null && goodwillToAssetsPct > 40) {
    riskPenalty += 10
    flags.push(`⚠ Goodwill is ${goodwillToAssetsPct.toFixed(0)}% of total assets — a large portion of the balance sheet is the premium paid for past acquisitions, exposed to write-down.`)
  } else if (goodwillToAssetsPct !== null && goodwillToAssetsPct > 25) {
    riskPenalty += 4
    notes.push(`Goodwill is ${goodwillToAssetsPct.toFixed(0)}% of assets — acquisition-heavy balance sheet.`)
  }

  if (hadGoodwillImpairment) {
    riskPenalty += 10
    flags.push("⚠ Recorded a goodwill impairment — the company has written down the value of a past acquisition, which is the accounting admission that it didn't deliver what was paid for.")
  }

  if (effectiveTaxRatePct !== null && effectiveTaxRatePct < 10 && effectiveTaxRatePct >= 0) {
    riskPenalty += 6
    flags.push(`⚠ Effective tax rate is only ${effectiveTaxRatePct.toFixed(1)}% versus a ${US_STATUTORY_RATE_PCT}% statutory rate. If it normalizes, earnings fall with no change in the business.`)
  }

  if (operatingLeaseUsd !== null && revenue !== null && revenue > 0) {
    const leaseToRevenue = (operatingLeaseUsd / revenue) * 100
    if (leaseToRevenue > 50) {
      riskPenalty += 6
      flags.push(`⚠ Operating lease obligations equal ${leaseToRevenue.toFixed(0)}% of annual revenue — fixed commitments that sit outside the reported debt figure.`)
    }
  }

  return {
    debtDueNext12MoUsd, debtDue3YrUsd, debtWallToFcfYears,
    sbcUsd, sbcToRevenuePct, sbcToFcfPct,
    goodwillUsd, goodwillToAssetsPct, hadGoodwillImpairment,
    operatingLeaseUsd, effectiveTaxRatePct,
    riskPenalty: Math.min(riskPenalty, 45),
    flags, notes,
  }
}
