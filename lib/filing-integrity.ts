// Deterministic data-integrity checks — run BEFORE anything interprets a filing.
//
// Every score in this system is computed from XBRL. If the XBRL itself is
// internally inconsistent, every ratio downstream is arithmetic on corrupt
// input, and no amount of careful interpretation later recovers from it. These
// checks are pure arithmetic on identities that must hold in any correctly
// tagged filing, so they can be verified without judgment.
//
// TOLERANCE, NOT EXACT EQUALITY. Filers round, restate in different units, and
// tag immaterial items inconsistently, so a real balance sheet almost never
// closes to the cent. Demanding exact equality would reject nearly every
// company. The threshold is relative to total assets, which is what makes a
// discrepancy material or not — $1M off on $150M of assets is a problem, the
// same $1M on $400B is a rounding artifact.
import type { FundamentalSeries } from "./edgar-normalize"

export interface IntegrityCheck {
  name: string
  passed: boolean
  detail: string
}

export interface IntegrityResult {
  checks: IntegrityCheck[]
  failed: number
  /** True when a check failed badly enough that the filing data should not be
   *  trusted for scoring at all. */
  corrupt: boolean
  flags: string[]
}

// A discrepancy under this share of total assets is rounding, not an error.
const BALANCE_TOLERANCE = 0.01   // 1%
// Beyond this the statement is not merely imprecise, it is wrong.
const BALANCE_CORRUPT = 0.05     // 5%

export function checkDataIntegrity(series: FundamentalSeries): IntegrityResult {
  const checks: IntegrityCheck[] = []
  const flags: string[] = []
  let corrupt = false

  const assets = series.totalAssets?.[0]
  const liabilities = series.totalLiabilities?.[0]
  const equity = series.stockholdersEquity?.[0]

  // ── The accounting identity: Assets = Liabilities + Equity ───────────────
  // This must hold in every audited balance sheet. When it does not, either a
  // concept was mistagged or we resolved two different periods against each
  // other — both of which invalidate every leverage and return ratio.
  if (assets && liabilities && equity && assets.value !== 0) {
    // Only compare figures from the SAME period end. Mixing periods is the
    // very error this check exists to catch, so it must not commit it itself.
    const sameEnd = assets.end === liabilities.end && assets.end === equity.end
    if (!sameEnd) {
      checks.push({
        name: "balance_sheet_identity",
        passed: false,
        detail: `Balance-sheet components resolved to different period ends (assets ${assets.end}, liabilities ${liabilities.end}, equity ${equity.end}) — not comparable.`,
      })
      flags.push("⚠ Balance-sheet figures come from different reporting periods, so leverage ratios built on them are not reliable.")
    } else {
      const variance = Math.abs(assets.value - (liabilities.value + equity.value))
      const relative = variance / Math.abs(assets.value)
      const passed = relative <= BALANCE_TOLERANCE
      checks.push({
        name: "balance_sheet_identity",
        passed,
        detail: passed
          ? `Assets reconcile to liabilities plus equity within ${(relative * 100).toFixed(2)}%.`
          : `Assets differ from liabilities plus equity by ${(relative * 100).toFixed(1)}% ($${(variance / 1e6).toFixed(0)}M).`,
      })
      if (!passed) {
        flags.push(`⚠ The balance sheet does not reconcile: assets differ from liabilities plus equity by ${(relative * 100).toFixed(1)}%. Every leverage and return figure is computed from these, so treat them with caution.`)
        if (relative > BALANCE_CORRUPT) corrupt = true
      }
    }
  }

  // ── Equity sign vs solvency ──────────────────────────────────────────────
  // Negative equity is not a data error — it is a real and serious condition —
  // but it breaks ROE, which divides by it and returns a nonsense figure.
  if (equity && equity.value < 0) {
    checks.push({
      name: "positive_equity",
      passed: false,
      detail: `Stockholders' equity is negative ($${(equity.value / 1e9).toFixed(2)}B).`,
    })
    flags.push("⚠ Stockholders' equity is negative — liabilities exceed assets. Return-on-equity is not meaningful here and should be ignored rather than read.")
  }

  // ── Cash flow vs net income plausibility ─────────────────────────────────
  // Not an identity, so this never marks data corrupt. An enormous gap in
  // either direction usually means a units or scaling error in the tagging.
  const ni = series.netIncome?.[0]
  const cfo = series.cfo?.[0]
  if (ni && cfo && ni.value !== 0 && ni.end === cfo.end) {
    const ratio = cfo.value / Math.abs(ni.value)
    if (Math.abs(ratio) > 50) {
      checks.push({
        name: "cashflow_scale",
        passed: false,
        detail: `Operating cash flow is ${ratio.toFixed(0)}x net income — implausible at face value.`,
      })
      flags.push("⚠ Operating cash flow is implausibly large relative to net income, which usually indicates a units or scaling error in the filing's tagging.")
    }
  }

  return { checks, failed: checks.filter(c => !c.passed).length, corrupt, flags }
}
